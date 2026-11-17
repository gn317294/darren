# 家庭習慣練習 App（去識別化 + Hono 六角架構重製版）

本專案嚴格依據《家庭習慣練習 App — 重製規格書（去識別版）》實作：
- **零個資與資料最小化**：僅以序位代號（`child1` 老大、`child2` 老二）與 `childConfig` 區分，不含任何真實姓名、生日、年齡、年級或性別。
- **INV-1（祕密只在伺服器端）**：前端與公開原始碼不含任何憑證、金鑰或外部儲存網址；所有機密僅由 `src/adapters/config/env.ts` 讀取。
- **INV-2（未經驗證不得碰資料）**：全站 `/api/*` 強制檢核 HMAC 簽章之 `HttpOnly` Session Cookie；家長專屬路由再檢核 `parent=true` 權限，密碼採用 WebCrypto `PBKDF2-HMAC-SHA256`（100,000 次迭代）雜湊。
- **純核心分離（附錄 A）**：`src/domain/` 零外部依賴，完整實作 2.3(a) 點數公式、2.3(b) 每日上限、2.3(c) 智慧推薦與 2.6 欄位級合併。

## 執行單元與安全驗收測試
```bash
node tests/domain/domain.test.js
```

## 部署至 Cloudflare Workers / D1
1. 設定伺服器端 Secret：`wrangler secret put SESSION_SECRET`、`wrangler secret put INITIAL_FAMILY_PASSWORD`、`wrangler secret put INITIAL_PARENT_PASSWORD`
2. 啟動開發或部署：`wrangler dev` / `wrangler deploy`
