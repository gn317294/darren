# 小步日常 — 完整原始碼

本份原始碼與目前已發布的第一版一致。
版本：2239bf4b523faf46192ec8ed839c9bfe66e38095

## 檔案結構
- dist/index.html：網頁結構
- dist/style.css：完整 CSS（含響應式版面）
- dist/app.js：全部互動、計時、推薦、紀錄、統計與備份功能
- .openai/hosting.json：原 Sites 靜態部署設定
- README.md：本說明

## 啟動
純 HTML、CSS、原生 JavaScript，沒有 React、Tailwind、npm 套件或編譯步驟。
建議解壓縮後在專案根目錄執行：

    python -m http.server 8000 --directory dist

然後開啟 http://localhost:8000/ 。亦可使用 VS Code Live Server 啟動 dist/index.html。
計時打卡及紀錄會用到現代瀏覽器提供的 crypto.randomUUID，建議以 localhost 或 HTTPS 執行。

## 資料
觀察與打卡儲存在目前瀏覽器 localStorage，並非雲端資料庫，不會跨裝置同步。
網站上已填寫的使用紀錄不包含於本 ZIP。請在原網站「家長檢視」匯出 JSON，再到新位置匯入。
原始碼含兩個孩子的姓名、生日與家長已提供的觀察內容，對外分享前請自行移除或替換。

## 其他主機部署
將 dist 內的三個檔案上傳至同一目錄即可。原 Sites 的私人登入由託管平台提供，這份前端程式不包含獨立登入系統；自行架站時需另設存取保護。
.openai/hosting.json 保留原網站識別。自行建立另一個 Sites 專案時，需使用新專案的設定，避免操作到原網站。

本工具為家庭陪伴及觀察用途，不作醫療診斷。
