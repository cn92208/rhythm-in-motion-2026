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
  "去識別時間"
];

function getConfig_() {
  const properties = PropertiesService.getScriptProperties();
  const required = ["SPREADSHEET_ID", "ORGANIZER_EMAIL"];
  const missing = required.filter((key) => !properties.getProperty(key));
  if (missing.length) {
    throw new Error(`尚未設定指令碼屬性：${missing.join(", ")}`);
  }
  return {
    spreadsheetId: properties.getProperty("SPREADSHEET_ID"),
    sheetName: properties.getProperty("SHEET_NAME") || "報名資料",
    organizerEmail: properties.getProperty("ORGANIZER_EMAIL"),
    capacity: Number(properties.getProperty("CAPACITY") || "50"),
    formStatus: (properties.getProperty("FORM_STATUS") || "CLOSED").toUpperCase(),
    eventId: properties.getProperty("EVENT_ID") || "rim-2026-11-28",
    retentionCutoff: properties.getProperty("RETENTION_CUTOFF") || "2026-12-28T23:59:59+08:00"
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
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setBackground("#292824")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setWrap(true);
  sheet.getDataRange().setVerticalAlignment("middle");
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 150);
  sheet.setColumnWidth(3, 230);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 85);
  sheet.setColumnWidth(6, 60);
  sheet.setColumnWidth(7, 130);
  sheet.setColumnWidth(8, 130);
  sheet.setColumnWidth(9, 135);
  sheet.setColumnWidth(10, 220);
  sheet.setColumnWidth(11, 320);
  sheet.setColumnWidth(12, 160);
  sheet.setColumnWidth(13, 260);
  sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  sheet.getRange("R:R").setNumberFormat("yyyy-mm-dd hh:mm:ss");
  console.log(`Setup complete: ${sheet.getParent().getUrl()}`);
}

function doGet() {
  const payload = {
    ok: true,
    service: "Rhythm in Motion registration",
    time: new Date().toISOString()
  };
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  try {
    const params = (event && event.parameter) || {};

    // 蜜罐欄位有值時靜默成功，不寫入、不寄信。
    if (String(params.website || "").trim()) {
      return response_({ ok: true, status: "received", message: "已收到。" });
    }

    const config = getConfig_();
    if (config.formStatus !== "OPEN") {
      return response_({ ok: false, message: "目前未開放報名，請稍後再試。" });
    }

    const data = validate_(params, config);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const sheet = getSheet_();
      const duplicate = findDuplicate_(sheet, data.requestId);
      if (duplicate) {
        return response_({
          ok: true,
          status: duplicate.status,
          registrationCode: duplicate.registrationCode,
          duplicate: true,
          message: "此筆報名已收件，請勿重複送出。"
        });
      }

      const usedSeats = countConfirmedSeats_(sheet);
      const status = usedSeats + data.seats <= config.capacity ? "正取" : "候補";
      const registrationCode = createRegistrationCode_();
      const receivedAt = new Date();

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
        ""
      ]);
      SpreadsheetApp.flush();

      sendConfirmation_(data, status, registrationCode, config);
      sendOrganizerNotice_(data, status, registrationCode, usedSeats, config);

      return response_({
        ok: true,
        status,
        registrationCode,
        message: status === "正取"
          ? "報名成功，確認信已寄出。"
          : "已列入候補，候補通知信已寄出。"
      });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return response_({
      ok: false,
      message: error && error.message ? error.message : "系統暫時無法收件，請稍後再試。"
    });
  }
}

function validate_(params, config) {
  const clean = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
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
    submittedAt: clean(params.submittedAt, 60),
    source: clean(params.source, 80) || "github-pages"
  };

  const errors = [];
  if (!data.requestId || !/^[a-zA-Z0-9-]{12,80}$/.test(data.requestId)) errors.push("請求識別碼無效");
  if (data.eventId !== config.eventId) errors.push("活動識別碼不符");
  if (data.fullName.length < 2) errors.push("請填寫姓名");
  if (![1, 2].includes(data.seats)) errors.push("參與人數只能是 1 或 2 人");
  if (data.seats === 2 && data.companionName.length < 2) errors.push("請填寫同行者姓名");
  if (!/^[+()\-\d\s]{8,30}$/.test(data.phone)) errors.push("聯絡電話格式不正確");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push("電子郵件格式不正確");
  if (!data.ageConfirm) errors.push("請確認年齡與陪同規則");
  if (!data.privacyConsent) errors.push("請同意報名規範與個資告知");
  if (errors.length) throw new Error(errors.join("；"));
  return data;
}

function findDuplicate_(sheet, requestId) {
  if (sheet.getLastRow() < 2) return null;
  const ids = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getDisplayValues();
  const index = ids.findIndex((row) => row[0] === requestId);
  if (index < 0) return null;
  const row = index + 2;
  return {
    registrationCode: sheet.getRange(row, 2).getDisplayValue(),
    status: sheet.getRange(row, 5).getDisplayValue()
  };
}

function countConfirmedSeats_(sheet) {
  if (sheet.getLastRow() < 2) return 0;
  const values = sheet.getRange(2, 5, sheet.getLastRow() - 1, 2).getValues();
  return values.reduce((sum, row) => {
    const status = String(row[0]);
    const seats = Number(row[1]) || 0;
    return ["正取", "已報到"].includes(status) ? sum + seats : sum;
  }, 0);
}

function createRegistrationCode_() {
  const time = Utilities.formatDate(new Date(), "Asia/Taipei", "MMddHHmmss");
  const suffix = Utilities.getUuid().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `RIM-${time}-${suffix}`;
}

function safeCell_(value) {
  const text = String(value == null ? "" : value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sendConfirmation_(data, status, registrationCode, config) {
  const isConfirmed = status === "正取";
  const subject = isConfirmed
    ? `【報名成功】Rhythm in Motion｜${registrationCode}`
    : `【候補通知】Rhythm in Motion｜${registrationCode}`;
  const statusText = isConfirmed
    ? "您已取得正取席位。請於活動當日 13:50 前完成簽到；逾時席位將釋出予現場候補。"
    : "目前已額滿，您已列入候補。若有席位釋出，主辦人將另行通知；未接獲通知前，請勿視為正取。";
  const companion = data.seats === 2
    ? `<p><strong>同行者：</strong>${escapeHtml_(data.companionName)}</p>`
    : "";
  const htmlBody = `
    <div style="font-family:Arial,'Microsoft JhengHei',sans-serif;line-height:1.7;color:#292824;max-width:620px;margin:auto">
      <p style="letter-spacing:.12em;color:#b95735;font-weight:bold">RHYTHM IN MOTION</p>
      <h1 style="font-size:24px">${escapeHtml_(status)}｜把節奏裝進身體</h1>
      <p>${escapeHtml_(data.fullName)} 您好：</p>
      <p>${statusText}</p>
      <div style="background:#f6f2e9;padding:18px 20px;border-radius:10px">
        <p><strong>報名編號：</strong>${escapeHtml_(registrationCode)}</p>
        <p><strong>參與人數：</strong>${data.seats} 人</p>
        ${companion}
        <p><strong>活動時間：</strong>2026/11/28（六）14:00–15:00</p>
        <p><strong>報到時間：</strong>13:30–13:50</p>
        <p><strong>活動地點：</strong>C-LAB 多功能廳</p>
      </div>
      <p>正式流程不攝錄影或直播。建議穿著平底鞋與方便活動的服裝；站姿、坐姿、替代動作或純聆聽皆可。</p>
      <p style="font-size:13px;color:#666159">此信由報名系統自動寄出。如需更正或取消，請回覆本信聯絡主辦人。</p>
    </div>`;
  MailApp.sendEmail({
    to: data.email,
    replyTo: config.organizerEmail,
    name: "Rhythm in Motion 報名系統",
    subject,
    htmlBody,
    body: `${status}｜報名編號 ${registrationCode}\n${statusText}\n活動時間：2026/11/28 14:00–15:00\n報到時間：13:30–13:50`
  });
}

function sendOrganizerNotice_(data, status, registrationCode, usedSeats, config) {
  const confirmedAfter = status === "正取" ? usedSeats + data.seats : usedSeats;
  const subject = `【新報名／${status}】${data.fullName}｜${registrationCode}`;
  const htmlBody = `
    <p><strong>狀態：</strong>${escapeHtml_(status)}</p>
    <p><strong>報名編號：</strong>${escapeHtml_(registrationCode)}</p>
    <p><strong>姓名：</strong>${escapeHtml_(data.fullName)}</p>
    <p><strong>參與人數：</strong>${data.seats}</p>
    <p><strong>正取已用席次：</strong>${confirmedAfter} / ${config.capacity}</p>
    <p><strong>Email：</strong>${escapeHtml_(data.email)}</p>
    <p><strong>電話：</strong>${escapeHtml_(data.phone)}</p>`;
  MailApp.sendEmail({
    to: config.organizerEmail,
    subject,
    htmlBody,
    body: `${status}｜${registrationCode}\n${data.fullName}｜${data.seats} 人\n正取已用席次：${confirmedAfter}/${config.capacity}`
  });
}

function response_(payload) {
  const json = JSON.stringify({ source: "rim-registration", ...payload }).replace(/</g, "\\u003c");
  const html = `<!doctype html><meta charset="utf-8"><title>報名處理結果</title>
    <body><p>${escapeHtml_(payload.message || "處理完成")}</p>
    <script>window.parent.postMessage(${json}, "*");<\/script></body>`;
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
    if (row[17]) return;
    row[2] = "";  // 請求識別碼
    row[6] = "";  // 姓名
    row[7] = "";  // 同行者姓名
    row[8] = "";  // 電話
    row[9] = "";  // Email
    row[10] = ""; // 提問可能含個資
    row[12] = ""; // 協助需求可能含健康資訊
    row[17] = anonymizedAt;
    changed += 1;
  });

  if (changed) range.setValues(values);
  console.log(`Anonymized ${changed} registration rows.`);
}
