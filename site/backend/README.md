# Rhythm in Motion — Google Apps Script 報名後端

此後端把 GitHub Pages 靜態表單寫入 Google 試算表，自動依 50 席容量判定「正取／候補」，並寄出確認信。前端以隱藏 iframe 送出，因此不需處理 CORS。

**安全版（2026-09-21）重點**：畫面上不再顯示正取／候補或報名編號（只寄到報名者信箱）；系統錯誤不回傳內部訊息；蜜罐＋最短填表時間＋每小時／每日上限＋同 Email 去重；`postMessage` 只送往 `ALLOWED_ORIGIN`；主辦通知信不含個資；寄信配額不足時先記錄再補寄。

## 1. 建立試算表與 Apps Script

1. 用**專門的 Google 帳號**（建議已開啟兩步驟驗證）在 Google Drive 建立一份空白試算表，複製網址中的 Spreadsheet ID。
2. 開啟 [script.google.com](https://script.google.com/) 建立獨立專案。
3. 將本資料夾的 `Code.gs` 與 `appsscript.json`（需先在專案設定勾選「在編輯器中顯示 appsscript.json」）貼入專案。
4. 到「專案設定 → 指令碼屬性」新增：

| 屬性 | 值 | 必填 |
|---|---|---|
| `SPREADSHEET_ID` | 試算表 ID | ✅ |
| `ORGANIZER_EMAIL` | 主辦收件信箱 | ✅ |
| `ALLOWED_ORIGIN` | `https://cn92208.github.io`（GitHub Pages 網域，不含路徑與結尾斜線） | ✅ |
| `SHEET_NAME` | `報名資料` | 預設 `報名資料` |
| `CAPACITY` | `50` | 預設 50 |
| `FORM_STATUS` | 收件用 `OPEN`；停止收件用 `CLOSED` | 預設 `CLOSED` |
| `EVENT_ID` | `rim-2026-11-28` | 預設同左 |
| `RETENTION_CUTOFF` | `2026-12-28T23:59:59+08:00` | 預設同左 |
| `MIN_FILL_SECONDS` | 最短填表秒數，低於此值視為機器人 | 預設 4 |
| `HOURLY_LIMIT` / `DAILY_LIMIT` | 每小時／每日最多收件數 | 預設 40 / 200 |
| `ORGANIZER_NOTICE` | `ON` 每筆寄摘要通知給主辦；`OFF` 不寄 | 預設 `ON` |

5. 在編輯器執行 `setup()`，完成授權並建立欄位（授權畫面只會要求：試算表、以您的身分寄信、管理觸發程序——這是 `appsscript.json` 的 `oauthScopes` 明確限制的最小權限）。
6. 執行 `installDailyCleanupTrigger()`，建立活動後個資清除排程。

## 2. 部署 Web App

1. 「部署 → 新增部署作業 → 網頁應用程式」。
2. 執行身分：**我**。
3. 存取權：**所有人**（匿名報名者才能送出；這是靜態網站接表單的必要設定，防護由程式內的限制承擔）。
4. 部署後複製以 `/exec` 結尾的 Web App 網址。
5. 把網址貼到 `../config.js` 的 `endpoint`，並將 `status` 由 `preview` 改為 `open`。

> 每次修改 `Code.gs` 後都要「管理部署作業 → 編輯 → 新版本」，否則公開端仍使用舊程式。

## 3. 正式開放前驗收

- 送出 1 人報名：試算表新增 1 列、席次為 1、**畫面只顯示「已收件」**、信箱收到正取信。
- 送出 2 人報名：同行者姓名必填、席次為 2。
- 用同一個 Email 再送一次：試算表**不新增列**，信箱收到標示「先前已完成報名」的原確認信。
- 將 `CAPACITY` 暫改為已用席次，確認下一筆成為候補（信件主旨為【候補通知】）。
- 重送同一 `requestId`（開發者工具重送）：不重複佔位。
- 在 4 秒內送出（或把 `MIN_FILL_SECONDS` 暫調成 60 測試）：被拒絕並提示重新整理。
- 測試錯誤信箱、手機號碼、蜜罐欄位、姓名含網址、`FORM_STATUS=CLOSED`。
- 刻意讓 `SPREADSHEET_ID` 錯誤一次，確認畫面只出現「系統暫時無法收件」，而不是內部錯誤文字。
- **刪除所有測試資料**（含主辦信箱的通知信），再把容量與狀態改回正式值。

## 4. 寄信配額（重要）

- 一般 Gmail 帳號 Apps Script 每日約可寄 **100 封**，Google Workspace 約 1,500 封（以 Google 官方當時公告為準）。
- 每筆報名會寄 1 封確認信（＋1 封主辦通知，若 `ORGANIZER_NOTICE=ON`）。50 席活動若一天湧入大量報名，一般 Gmail 可能用完配額。
- 配額用完時，報名仍會寫入試算表，備註欄標示「確認信待補寄」；隔日由主辦人在編輯器執行 `resendPendingConfirmations()` 補寄。
- 若預期短時間內大量報名，建議把 `ORGANIZER_NOTICE` 設為 `OFF`。

## 5. 權限與個資

- 試算表只授權給必要工作人員，**不開啟「知道連結者可檢視」**。
- 主辦帳號開啟兩步驟驗證；活動結束後可停用 Web App 部署。
- `purgeExpiredPersonalData()` 會在保留截止日後清除姓名、同行者、電話、Email、提問、協助需求與備註，只保留去識別統計欄位。
- 去識別化**不會**處理 Gmail 裡的信件副本：活動後 30 日內請一併刪除主辦信箱的「寄件備份」（確認信含姓名）與通知信。
- 若活動延期，須同步更新 `RETENTION_CUTOFF`、前端日期與企畫書。
