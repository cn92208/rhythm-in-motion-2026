# Rhythm in Motion｜2026 活動交付包

《Rhythm in Motion｜把節奏裝進身體》跨界音樂與肢體藝術分享會的正式企畫書、線上報名頁與 Google Apps Script 收件後端。

- **GitHub Pages：** https://cn92208.github.io/rhythm-in-motion-2026/
- **Repository：** https://github.com/cn92208/rhythm-in-motion-2026

> 公開頁目前採 `preview` 模式：可完整試填，但不會傳送或儲存個資。完成 Google Apps Script 部署及真實收件驗收後，才可將 `site/config.js` 改為 `open`。

## 交付內容

| 檔案／資料夾 | 用途 |
|---|---|
| `Rhythm_in_Motion_正式計畫書.docx` | 可編輯 Word 正式企畫書 |
| `Rhythm_in_Motion_正式計畫書.pdf` | 由 Microsoft Word 原生匯出的核對版 |
| `site/index.html` | GitHub Pages 報名頁（含 CSP、無第三方資源） |
| `site/styles.css`、`site/app.js` | 報名頁樣式與程式（外部檔案，配合 CSP `'self'`） |
| `site/config.js` | 報名狀態、Apps Script 端點、容量與聯絡信箱設定（無機密） |
| `docs/安全上線規劃.md` | 安全上線規劃書：風險清單、已實作防護、上線檢核與營運規範 |
| `site/backend/Code.gs` | Google 試算表收件、正取／候補、確認信與個資清除後端 |
| `site/backend/README.md` | 後端設定與驗收步驟 |
| `.github/workflows/pages.yml` | GitHub Pages 自動部署流程 |
| `scripts/build-docx.js` | Word 文件重建腳本 |

## 內容校訂決策

1. 場館名稱統一為官方用字「**臺灣當代文化實驗場（C-LAB）**」。
2. 原稿同時寫「不攝錄影」與「合照閉幕」，兩者互相矛盾；正式版改為**不合照，以一輪集體節奏收束**。
3. 原「推薦人／學生編號（抽獎用）」與活動目的、抽獎機制不一致，依個資最小化原則改為**推薦來源（選填）**。
4. 2 人報名新增同行者姓名，避免實名報到與席次計算不一致；剩 1 席時，2 人同行整筆轉候補。
5. 新增坐姿、拍腿、拍掌與純聆聽替代方式，並補入緊急應變、資料保留期限、工作分工與上線驗收清單。
6. 場地、廳別與活動日期均標示以館方核准／公告為準，避免將申請中資訊表述為已核定。

## 安全上線版（2026-09-21）

詳見 `docs/安全上線規劃.md`。摘要：

- 前端：Content-Security-Policy（只允許自家檔案與 Google Apps Script 表單目標）、`no-referrer`、移除 Google Fonts（不再向第三方送出訪客 IP）、只接受隱藏 iframe 來的 `postMessage`、送出成功後清空表單。
- 後端：畫面不顯示正取／候補與報名編號（只寄信）、系統錯誤不外洩、蜜罐＋最短填表時間＋每小時／每日上限＋同 Email 去重、`postMessage` 限定 GitHub Pages 網域、最小 OAuth 權限、主辦通知信不含個資、寄信配額不足時先記錄再補寄。
- 儲存庫：不含任何機密（試算表 ID、來源網域等只存在 Apps Script 指令碼屬性）。`endpoint` 網址本來就會公開在瀏覽器端，不是機密。

## 本機預覽

```bash
cd site
python -m http.server 8080
```

瀏覽 `http://localhost:8080/`。目前 `site/config.js` 預設為 `preview`：可完整試填，但不傳送或保存資料。

## 正式啟用報名

1. 依 `site/backend/README.md` 部署 Apps Script 與 Google 試算表。
2. 編輯 `site/config.js`：
   - `endpoint`：貼上以 `/exec` 結尾的 Web App 網址。
   - `status`：由 `preview` 改為 `open`。
   - `organizerEmail`：已設定為 `yichengstudio@gmail.com`。
3. 依 `docs/安全上線規劃.md` 的「上線檢核清單」逐項完成（含 GitHub Pages「Enforce HTTPS」、試算表共用設定、測試資料清除）。
4. 刪除測試資料後再公開網址。

## 發布 GitHub Pages

此專案已附 GitHub Actions。推送到 GitHub 的 `main` 分支後，在儲存庫：

1. **Settings → Pages**。
2. Source 選 **GitHub Actions**。
3. 執行 `Deploy GitHub Pages` workflow。
4. 從 workflow 的 deployment URL 開啟並再次送出測試。

若使用 GitHub CLI：

```bash
git init
git add .
git commit -m "Create Rhythm in Motion registration site"
git branch -M main
gh repo create rhythm-in-motion-registration --public --source . --push
gh api -X POST repos/{owner}/rhythm-in-motion-registration/pages -f build_type=workflow
```

## 重建 Word 文件

```bash
npm install
npm run build:docx
```

Word 文件由 `docx` 產生。Windows 有 Microsoft Word 時，可用 `verification/hermes-verify-word-render.py` 更新目錄、原生匯出 PDF 並核對 OOXML 封裝。

## 資料與隱私

- GitHub Pages 只包含前端，不保存個資；頁面不載入任何第三方資源（無字型、無分析工具、無 CDN）。
- 正式資料寫入主辦人指定的 Google 試算表；報名結果只寄到報名者信箱，畫面不顯示。
- 試算表不得設為公開連結可檢視；主辦帳號應開啟兩步驟驗證。
- 活動後 30 日內由 Apps Script 清除姓名、同行者、電話、Email、協助需求與提問；Gmail 內的信件副本需由主辦人手動刪除。
- 主辦聯絡信箱為 `yichengstudio@gmail.com`，供查詢、更正、取消與刪除申請。
