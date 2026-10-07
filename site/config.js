window.RIM_CONFIG = Object.freeze({
  // preview：可完整試填，但不傳送資料；open：正式收件；closed：停止收件。
  status: "open",

  // 部署 Google Apps Script Web App 後，貼上以 /exec 結尾的網址。
  // 這個網址本來就會公開在瀏覽器端，不是機密；真正的機密（試算表 ID、收件信箱設定）
  // 只存在 Apps Script 的「指令碼屬性」，不會出現在此儲存庫。
  endpoint: "https://script.google.com/macros/s/AKfycbx-R2WKCvgU6pocfrJvj-Ib4Ci4tC2JPK1ByweDl1V66ICeOX3Uw7D1aj71IGca3qsq/exec",

  capacity: 50,
  eventId: "rim-2026-11-28",
  organizerEmail: "yichengstudio@gmail.com",
  lastUpdated: "2026-10-07"
});
