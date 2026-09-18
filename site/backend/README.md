# Rhythm in Motion — Google Apps Script 報名後端

此後端把 GitHub Pages 靜態表單寫入 Google 試算表，自動依 50 席容量判定「正取／候補」，並寄出確認信。前端以隱藏 iframe 送出，因此不需處理 CORS。

## 1. 建立試算表與 Apps Script

1. 在 Google Drive 建立一份空白試算表，複製網址中的 Spreadsheet ID。
2. 開啟 [script.google.com](https://script.google.com/) 建立獨立專案。
3. 將本資料夾的 `Code.gs` 與 `appsscript.json` 貼入專案。
4. 到「專案設定 → 指令碼屬性」新增：

| 屬性 | 值 |
|---|---|
| `SPREADSHEET_ID` | 試算表 ID |
| `SHEET_NAME` | `報名資料` |
| `ORGANIZER_EMAIL` | 主辦收件信箱 |
| `CAPACITY` | `50` |
| `FORM_STATUS` | 測試用 `OPEN`；停止收件用 `CLOSED` |
| `EVENT_ID` | `rim-2026-11-28` |
| `RETENTION_CUTOFF` | `2026-12-28T23:59:59+08:00` |

5. 在編輯器執行 `setup()`，完成授權並建立欄位。
6. 執行 `installDailyCleanupTrigger()`，建立活動後個資清除排程。

## 2. 部署 Web App

1. 「部署 → 新增部署作業 → 網頁應用程式」。
2. 執行身分：**我**。
3. 存取權：**所有人**。
4. 部署後複製以 `/exec` 結尾的 Web App 網址。
5. 把網址貼到 `../config.js` 的 `endpoint`，並將 `status` 由 `preview` 改為 `open`。

> 每次修改 `Code.gs` 後都要建立新版本並更新部署，否則公開端仍使用舊程式。

## 3. 正式開放前驗收

- 送出 1 人報名：試算表新增 1 列、席次為 1、收到正取信。
- 送出 2 人報名：同行者姓名必填、席次為 2。
- 將 `CAPACITY` 暫改為已用席次，確認下一筆成為候補。
- 重送同一 `requestId`，確認不重複佔位。
- 測試錯誤信箱、手機號碼、蜜罐欄位與 `FORM_STATUS=CLOSED`。
- 刪除所有測試資料，再把容量與狀態改回正式值。

## 4. 權限與個資

- 試算表只授權給必要工作人員，不開啟「知道連結者可檢視」。
- `purgeExpiredPersonalData()` 會在保留截止日後清除姓名、電話、Email、協助需求與提問，只保留去識別統計欄位。
- 若活動延期，須同步更新 `RETENTION_CUTOFF`、前端日期與企畫書。
