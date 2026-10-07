/**
 * Rhythm in Motion 報名後端（Google Apps Script）
 *
 * 安全設計重點：
 * - 所有機密（試算表 ID、收件信箱、允許來源）只存在「指令碼屬性」，不進入公開儲存庫。
 * - 對外回應一律「通用訊息」：不在畫面回傳正取／候補、報名編號或任何既有資料，
 *   結果只寄到報名者自己的信箱，避免用表單探測某個 Email 是否已報名。
 * - 系統錯誤不把內部錯誤文字回傳給瀏覽器（只有欄位驗證錯誤會回傳）。
 * - 蜜罐欄位、最短填表時間、每小時／每日收件上限、同 Email 去重，降低垃圾報名與寄信轟炸。
 * - postMessage 只送往 ALLOWED_ORIGIN（GitHub Pages 網域），不再使用 "*"。
 * - 主辦通知信不含電話與 Email（資料最小化），完整資料只在試算表。
 * - 活動後由排程去識別化；寄信配額不足時先記錄再補寄，不會遺失報名。
 */

const HEADERS = [
  "收件時間",
  "報名編號",
  "請求識別碼",
  "活動識別碼",
  "狀態",
  "席次",
  "姓名",
  "同行者姓名",
  "聯絡電話",
  "電子郵件",
  "公開提問",
  "推薦來源",
  "參與協助需求",
  "年齡陪同確認",
  "規範與隱私同意",
  "前端送出時間",
  "資料來源",
  "去識別時間",
  "備註"
];

const COL = {
  receivedAt: 0, code: 1, requestId: 2, eventId: 3, status: 4, seats: 5,
  fullName: 6, companionName: 7, phone: 8, email: 9, question: 10, referral: 11,
  accessibility: 12, ageConfirm: 13, privacyConsent: 14, submittedAt: 15,
  source: 16, anonymizedAt: 17, note: 18
};

const ACTIVE_STATUSES = ["正取", "候補", "已報到"];
const NOTE_PENDING_MAIL = "確認信待補寄";
const GENERIC_OK_MESSAGE = "已收件。正取／候補結果與報名編號將寄至您填寫的信箱，請留意收件匣與垃圾郵件匣。";
const GENERIC_ERROR_MESSAGE = "系統暫時無法收件，請稍後再試。";

class ValidationError extends Error {}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const required = ["SPREADSHEET_ID", "ORGANIZER_EMAIL", "ALLOWED_ORIGIN"];
  const missing = required.filter((key) => !properties.getProperty(key));
  if (missing.length) {
    throw new Error(`尚未設定指令碼屬性：${missing.join(", ")}`);
  }
  return {
    spreadsheetId: properties.getProperty("SPREADSHEET_ID"),
    sheetName: properties.getProperty("SHEET_NAME") || "報名資料",
    organizerEmail: properties.getProperty("ORGANIZER_EMAIL"),
    allowedOrigin: properties.getProperty("ALLOWED_ORIGIN").replace(/\/+$/, ""),
    capacity: Number(properties.getProperty("CAPACITY") || "50"),
    formStatus: (properties.getProperty("FORM_STATUS") || "CLOSED").toUpperCase(),
    eventId: properties.getProperty("EVENT_ID") || "rim-2026-11-28",
    retentionCutoff: properties.getProperty("RETENTION_CUTOFF") || "2026-12-28T23:59:59+08:00",
    minFillSeconds: Number(properties.getProperty("MIN_FILL_SECONDS") || "4"),
    hourlyLimit: Number(properties.getProperty("HOURLY_LIMIT") || "40"),
    dailyLimit: Number(properties.getProperty("DAILY_LIMIT") || "200"),
    organizerNotice: (properties.getProperty("ORGANIZER_NOTICE") || "ON").toUpperCase() === "ON"
  };
}

function getSheet_() {
  const config = getConfig_();
  const spreadsheet = SpreadsheetApp.openById(config.spreadsheetId);
  let sheet = spreadsheet.getSheetByName(config.sheetName);
  if (!sheet) sheet = spreadsheet.insertSheet(config.sheetName);
  return sheet;
}

function setup() {
  const sheet = getSheet_();
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground("#292824")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true);
  sheet.getDataRange().setVerticalAlignment("middle");
  [150, 150, 230, 150, 85, 60, 130, 130, 135, 220, 320, 160, 260, 90, 90, 170, 110, 150, 160]
    .forEach((width, index) => sheet.setColumnWidth(index + 1, width));
  sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange("R:R").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  console.log("Setup complete.");
}

function doGet() {
  // 不回傳任何設定或狀態細節，只用來確認部署存在。
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "rim-registration" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  let config = null;
  try {
    const params = (event && event.parameter) || {};
    config = getConfig_();

    // 蜜罐欄位有值：靜默回應成功，不寫入、不寄信。
    if (String(params.website || "").trim()) {
      return response_({ ok: true, message: GENERIC_OK_MESSAGE }, config);
    }

    if (config.formStatus !== "OPEN") {
      return response_({ ok: false, message: "目前未開放報名，請稍後再試。" }, config);
    }

    const data = validate_(params, config);

    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      if (!withinRateLimit_(config)) {
        console.warn("Rate limit hit.");
        return response_({ ok: false, message: "目前報名人數較多，請稍後再試。" }, config);
      }

      const sheet = getSheet_();
      const table = readTable_(sheet);

      // 同一 requestId 重送：不重複佔位，也不透露任何內容。
      if (table.some((row) => row[COL.requestId] === data.requestId)) {
        return response_({ ok: true, message: GENERIC_OK_MESSAGE }, config);
      }

      // 同一 Email 已有有效報名：不新增，改為把原確認信再寄一次給該信箱（只有信箱主人看得到）。
      const existing = table.find((row) =>
        String(row[COL.email]).toLowerCase() === data.email &&
        ACTIVE_STATUSES.includes(String(row[COL.status])) &&
        !row[COL.anonymizedAt]
      );
      if (existing) {
        resendExisting_(existing, data.email, config);
        return response_({ ok: true, message: GENERIC_OK_MESSAGE }, config);
      }

      const usedSeats = countConfirmedSeats_(table);
      const status = usedSeats + data.seats <= config.capacity ? "正取" : "候補";
      const registrationCode = createRegistrationCode_();
      const receivedAt = new Date();
      const rowIndex = sheet.getLastRow() + 1;

      sheet.appendRow([
        receivedAt,
        safeCell_(registrationCode),
        safeCell_(data.requestId),
        safeCell_(data.eventId),
        status,
        data.seats,
        safeCell_(data.fullName),
        safeCell_(data.companionName),
        safeCell_(data.phone),
        safeCell_(data.email),
        safeCell_(data.question),
        safeCell_(data.referral),
        safeCell_(data.accessibilityNeeds),
        data.ageConfirm ? "是" : "否",
        data.privacyConsent ? "是" : "否",
        safeCell_(data.submittedAt),
        safeCell_(data.source),
        "",
        ""
      ]);
      SpreadsheetApp.flush();

      // 寄信配額不足時先保留報名，備註「待補寄」，之後由主辦人執行 resendPendingConfirmations()。
      if (MailApp.getRemainingDailyQuota() >= 1) {
        sendConfirmation_(data.email, data.fullName, data.seats, data.companionName, status, registrationCode, config);
      } else {
        sheet.getRange(rowIndex, COL.note + 1).setValue(NOTE_PENDING_MAIL);
        console.warn("Mail quota exhausted; confirmation deferred.");
      }
      if (config.organizerNotice && MailApp.getRemainingDailyQuota() >= 2) {
        sendOrganizerNotice_(status, registrationCode, data.seats, usedSeats, config);
      }

      return response_({ ok: true, message: GENERIC_OK_MESSAGE }, config);
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return response_({ ok: false, message: error.message }, config);
    }
    // 內部錯誤只留在 Apps Script 記錄，不回傳給瀏覽器。
    console.error(error && error.stack ? error.stack : error);
    return response_({ ok: false, message: GENERIC_ERROR_MESSAGE }, config);
  }
}

function withinRateLimit_(config) {
  const cache = CacheService.getScriptCache();
  const now = new Date();
  const hourKey = "rim:h:" + Utilities.formatDate(now, "Asia/Taipei", "yyyyMMddHH");
  const dayKey = "rim:d:" + Utilities.formatDate(now, "Asia/Taipei", "yyyyMMdd");
  const hourCount = Number(cache.get(hourKey) || "0") + 1;
  const dayCount = Number(cache.get(dayKey) || "0") + 1;
  cache.put(hourKey, String(hourCount), 3600);
  cache.put(dayKey, String(dayCount), 21600);
  return hourCount <= config.hourlyLimit && dayCount <= config.dailyLimit;
}

function validate_(params, config) {
  const clean = (value, maxLength) => String(value || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
  const seats = Number(params.seats);
  const data = {
    requestId: clean(params.requestId, 80),
    eventId: clean(params.eventId, 80),
    fullName: clean(params.fullName, 50),
    companionName: clean(params.companionName, 50),
    phone: clean(params.phone, 30),
    email: clean(params.email, 160).toLowerCase(),
    seats,
    question: clean(params.question, 500),
    referral: clean(params.referral, 100),
    accessibilityNeeds: clean(params.accessibilityNeeds, 300),
    ageConfirm: params.ageConfirm === "yes",
    privacyConsent: params.privacyConsent === "yes",
    startedAt: clean(params.startedAt, 60),
    submittedAt: clean(params.submittedAt, 60),
    source: clean(params.source, 80) || "github-pages"
  };

  const errors = [];
  const looksLikeLink = (text) => /(https?:|:\/\/|www\.|<|>)/i.test(text);
  if (!data.requestId || !/^[a-zA-Z0-9-]{12,80}$/.test(data.requestId)) errors.push("請求識別碼無效，請重新整理頁面後再送出");
  if (data.eventId !== config.eventId) errors.push("活動識別碼不符，請重新整理頁面後再送出");
  if (data.fullName.length < 2) errors.push("請填寫姓名");
  if (looksLikeLink(data.fullName) || looksLikeLink(data.companionName)) errors.push("姓名欄位不可包含網址或特殊符號");
  if (![1, 2].includes(data.seats)) errors.push("參與人數只能是 1 或 2 人");
  if (data.seats === 2 && data.companionName.length < 2) errors.push("請填寫同行者姓名");
  if (!/^[+()\-\d\s]{8,30}$/.test(data.phone)) errors.push("聯絡電話格式不正確");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email) || data.email.length > 160) errors.push("電子郵件格式不正確");
  if (!data.ageConfirm) errors.push("請確認年齡與陪同規則");
  if (!data.privacyConsent) errors.push("請同意報名規範與個資告知");

  // 最短填表時間：正常人不可能在幾秒內填完，機器人常常會。
  const started = Date.parse(data.startedAt);
  const submitted = Date.parse(data.submittedAt);
  const elapsedSeconds = Number.isNaN(started) || Number.isNaN(submitted) ? NaN : (submitted - started) / 1000;
  if (Number.isNaN(elapsedSeconds) || elapsedSeconds < config.minFillSeconds || elapsedSeconds > 60 * 60 * 24) {
    errors.push("送出過快或頁面已過期，請重新整理頁面後再填寫");
  }

  if (errors.length) throw new ValidationError(errors.join("；"));
  return data;
}

function readTable_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
}

function countConfirmedSeats_(table) {
  return table.reduce((sum, row) => {
    const status = String(row[COL.status]);
    const seats = Number(row[COL.seats]) || 0;
    return ["正取", "已報到"].includes(status) ? sum + seats : sum;
  }, 0);
}

function resendExisting_(row, email, config) {
  // 同一信箱 10 分鐘內只補寄一次，避免被拿來當寄信轟炸工具。
  const cache = CacheService.getScriptCache();
  const key = "rim:resend:" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email, Utilities.Charset.UTF_8));
  if (cache.get(key)) return;
  if (MailApp.getRemainingDailyQuota() < 1) return;
  cache.put(key, "1", 600);
  sendConfirmation_(
    email,
    String(row[COL.fullName]),
    Number(row[COL.seats]) || 1,
    String(row[COL.companionName] || ""),
    String(row[COL.status]),
    String(row[COL.code]),
    config,
    true
  );
}

function createRegistrationCode_() {
  const time = Utilities.formatDate(new Date(), "Asia/Taipei", "MMddHHmmss");
  const suffix = Utilities.getUuid().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `RIM-${time}-${suffix}`;
}

function safeCell_(value) {
  // 防止試算表公式注入（=、+、-、@ 開頭會被 Sheets 當成公式）。
  const text = String(value == null ? "" : value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendConfirmation_(email, fullName, seats, companionName, status, registrationCode, config, isResend) {
  const isConfirmed = status === "正取" || status === "已報到";
  const subject = (isConfirmed ? "【報名成功】" : "【候補通知】") + `Rhythm in Motion｜${registrationCode}`;
  const statusText = isConfirmed
    ? "您已取得正取席位。請於活動當日 13:50 前完成簽到；逾時席位將釋出予現場候補。"
    : "目前已額滿，您已列入候補。若有席位釋出，主辦人將另行通知；未接獲通知前，請勿視為正取。";
  const resendNote = isResend
    ? "<p style=\"color:#7b541d\">此信箱先前已完成報名，系統不會重複登記；以下為原報名資料。若非本人操作，請忽略此信。</p>"
    : "";
  const companion = seats === 2 && companionName
    ? `<p><strong>同行者：</strong>${escapeHtml_(companionName)}</p>`
    : "";
  const htmlBody = `
    <div style="font-family:Arial,'Microsoft JhengHei',sans-serif;line-height:1.7;color:#292824;max-width:620px;margin:auto">
      <p style="letter-spacing:.12em;color:#b95735;font-weight:bold">RHYTHM IN MOTION</p>
      <h1 style="font-size:24px">${escapeHtml_(isConfirmed ? "正取" : "候補")}｜把節奏裝進身體</h1>
      <p>${escapeHtml_(fullName)} 您好：</p>
      ${resendNote}
      <p>${statusText}</p>
      <div style="background:#f6f2e9;padding:18px 20px;border-radius:10px">
        <p><strong>報名編號：</strong>${escapeHtml_(registrationCode)}</p>
        <p><strong>參與人數：</strong>${seats} 人</p>
        ${companion}
        <p><strong>活動時間：</strong>2026/11/28（六）14:00–15:00</p>
        <p><strong>報到時間：</strong>13:30–13:50</p>
        <p><strong>活動地點：</strong>C-LAB 多功能廳</p>
      </div>
      <p>正式流程不攝錄影或直播。建議穿著平底鞋與方便活動的服裝；站姿、坐姿、替代動作或純聆聽皆可。</p>
      <p style="font-size:13px;color:#666159">此信由報名系統自動寄出。如需更正、取消或刪除資料，請回覆本信聯絡主辦人。活動後 30 日內將刪除可識別資料。</p>
    </div>`;
  MailApp.sendEmail({
    to: email,
    replyTo: config.organizerEmail,
    name: "Rhythm in Motion 報名系統",
    subject,
    htmlBody,
    body: `${isConfirmed ? "正取" : "候補"}｜報名編號 ${registrationCode}\n${statusText}\n活動時間：2026/11/28 14:00–15:00\n報到時間：13:30–13:50`
  });
}

function sendOrganizerNotice_(status, registrationCode, seats, usedSeats, config) {
  // 資料最小化：通知信不含姓名、電話、Email；完整資料請到試算表查看。
  const confirmedAfter = status === "正取" ? usedSeats + seats : usedSeats;
  const subject = `【新報名／${status}】${registrationCode}`;
  const body = `狀態：${status}\n報名編號：${registrationCode}\n參與人數：${seats}\n正取已用席次：${confirmedAfter} / ${config.capacity}\n\n完整資料請至報名試算表查看。`;
  MailApp.sendEmail({ to: config.organizerEmail, subject, body });
}

function response_(payload, config) {
  const targetOrigin = config && config.allowedOrigin ? config.allowedOrigin : "null";
  const json = JSON.stringify({ source: "rim-registration", ok: payload.ok === true, message: String(payload.message || "") })
    .replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const html = `<!doctype html><meta charset="utf-8"><title>報名處理結果</title>
    <body><p>${escapeHtml_(payload.message || "處理完成")}</p>
    <script>if (window.parent !== window) { window.parent.postMessage(${json}, ${JSON.stringify(targetOrigin)}); }<\/script></body>`;
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 主辦人手動執行：補寄因配額不足而尚未寄出的確認信。 */
function resendPendingConfirmations() {
  const config = getConfig_();
  const sheet = getSheet_();
  const table = readTable_(sheet);
  let sent = 0;
  table.forEach((row, index) => {
    if (String(row[COL.note]) !== NOTE_PENDING_MAIL || row[COL.anonymizedAt]) return;
    if (MailApp.getRemainingDailyQuota() < 1) return;
    sendConfirmation_(
      String(row[COL.email]), String(row[COL.fullName]), Number(row[COL.seats]) || 1,
      String(row[COL.companionName] || ""), String(row[COL.status]), String(row[COL.code]), config
    );
    sheet.getRange(index + 2, COL.note + 1).setValue("");
    sent += 1;
  });
  console.log(`Resent ${sent} confirmation(s).`);
}

function installDailyCleanupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "purgeExpiredPersonalData")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger("purgeExpiredPersonalData")
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
}

function purgeExpiredPersonalData() {
  const config = getConfig_();
  const cutoff = new Date(config.retentionCutoff);
  if (Number.isNaN(cutoff.getTime())) throw new Error("RETENTION_CUTOFF 格式無效");
  if (new Date() <= cutoff) return;

  const sheet = getSheet_();
  const rows = sheet.getLastRow() - 1;
  if (rows <= 0) return;
  const range = sheet.getRange(2, 1, rows, HEADERS.length);
  const values = range.getValues();
  const anonymizedAt = new Date();
  let changed = 0;

  values.forEach((row) => {
    if (row[COL.anonymizedAt]) return;
    row[COL.requestId] = "";
    row[COL.fullName] = "";
    row[COL.companionName] = "";
    row[COL.phone] = "";
    row[COL.email] = "";
    row[COL.question] = "";       // 提問可能含個資
    row[COL.accessibility] = "";  // 協助需求可能含健康資訊
    row[COL.note] = "";
    row[COL.anonymizedAt] = anonymizedAt;
    changed += 1;
  });

  if (changed) range.setValues(values);
  console.log(`Anonymized ${changed} registration rows.`);
}
