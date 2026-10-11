# 驗收（UAT）測試計劃

給 bot「驗收」（UAT／QA）用嘅短計劃。失敗交 **Paddy**；本文件唔授權改 `src/` 或作品資料。

## 目的與範圍

- **驗什麼：** 瀏覽器視覺小說框架（`src/` 播放器）＋試玩／fixture 作品。
- **作品：**
  - `xingkong`（《星空情緣》）——品質試玩段到 `midcard`
  - `mystery-fixture`（「晚班鑰匙」）——非戀愛短場；`offlineReady`
- **唔驗：** 全書《星空情緣》、三線全部結局、正式部署、Live2D、雲端存檔等 README「未完成」項。

## 前置條件（Ship then UAT）

**必須先確認 live／預覽目標係要測嘅 commit，先開始測。**

1. 記錄要測嘅 **commit SHA**（例如 `git rev-parse HEAD` 或部署註明嘅 tip）。
2. 目前 **無公開 GitHub Pages 部署**（README：唔好部署）。驗收目標用本機：
   - 開發：`bun install` → `bun run dev` → 開印出嘅 localhost
   - 或靜態預覽：`BASE_PATH=/galgame/ bun run build:base` → `bun run preview`（或 `bunx vite preview --base /galgame/`）
   - 離線：`bun run verify:offline`（見下方 PWA 個案）
3. 可選先跑：`bun test`、`bun run check`（唔取代瀏覽器 UAT）。
4. 報告入面寫清楚：**測邊個 SHA、邊種啟動方式（dev／preview／verify:offline）、邊個 URL**。

## 基線清單（web app）

每個 build／commit 建議過一輪：

| # | 項目 | 期望 |
| --- | --- | --- |
| B1 | Mobile responsive | 手機寬度（約 375px）版面可用：標題、對白、選項、HUD 唔嚴重溢出／遮擋 |
| B2 | 主要 flow | 標題 → 新遊戲 → 前進／選項 → 存讀／設定 → 回標題 |
| B3 | 明顯 UI | 按鈕可點、文字可讀、主題曲／標題備註（有設先有）正常 |
| B4 | 空狀態 | 無存檔時「繼續」行為合理（禁用或提示）；讀檔空列表可理解 |
| B5 | 壞 link／缺資源 | 缺圖或缺音唔令整頁白屏；有可辨識後備或錯誤狀態 |

## 具體個案

### 1. 標題頁

- 開預設作品（`xingkong`）。
- 見「新遊戲」「繼續」「讀檔」「設定」「鑑賞」。
- 標題／讀檔／設定／鑑賞可播主題曲（`titleBgm`）；`xingkong` 可選顯示 `titleNote`。

### 2. 新遊戲 · xingkong → midcard 品質試玩

- 「新遊戲」進入對白。
- 點畫面／空白鍵／Enter 可前進。
- 選項出現時可點選。
- 玩到品質試玩切點 `midcard`（唔要求全書）。
- 立繪／背景／對白大致正常（明顯錯位、空白 speaker、壞圖記 fail）。

### 3. 存／讀／繼續

- 遊戲中存檔 → 回標題 →「讀檔」或「繼續」可回到合理進度。
- 刷新後 IndexedDB 存檔仍在（同瀏覽器、未清資料）。

### 4. 設定

- 標題或 HUD 入設定；改文字速度／音量等可見選項後生效或可還原；可返回。

### 5. HUD

- 遊戲中：快進、自動、存／讀、設定、紀錄、回想、標題。
- 各按鈕有預期效果；「標題」可回標題頁。

### 6. 鍵盤

- 空白鍵／Enter 前進（無選項時）。
- 有選項時唔好誤觸跳過（或行為與產品一致並記錄）。

### 7. `?work=mystery-fixture` →「晚班鑰匙」

- URL 加 `?work=mystery-fixture`（dev 或 preview base path 下一樣）。
- 標題為「晚班鑰匙」；走廊缺鑰匙 → 上鎖／翻抽屜／問樓下等分支。
- 可到結局 `stop`（非戀愛；唔要求戀愛 HUD／好感）。
- **證明：** 換作品唔使改 `src/`（只靠 `works/<id>/` + query）。

### 8. PWA／離線（mystery-fixture）

- 跟 README：`bun run verify:offline`，或手動 build:base + preview，開 `?work=mystery-fixture`，玩一輪等 SW 安裝 → DevTools Offline → 重載仍可玩。
- 只有 `offlineReady: true` 作品先應有離線提示；`xingkong` 唔當離線必過項。

### 9. 空狀態／缺素材／壞 link

- 無存檔時繼續／讀檔。
- 若本機刻意缺某 asset（或已知缺圖），確認唔整頁崩潰；記截圖。
- 標題／HUD 明顯死 link 記 fail。

### 10. 切換作品

- 同一播放器：預設 `xingkong` 同 `?work=mystery-fixture` 可交替開（新分頁或改 query 重載）。
- 唔改 `src/`；作品資料各自獨立、唔互相污染存檔鍵到無法遊玩。

## 報告格式（pass／fail）

每項一行或一表：

| 項目 | 結果 | 證據 | 重現 |
| --- | --- | --- | --- |
| （個案編號／名稱） | pass／fail | 截圖檔名或簡述 | 步驟（URL、操作、期望 vs 實際） |

報告頭註明：

- Commit SHA
- 啟動方式與 URL
- 日期／環境（瀏覽器、視窗寬度）

**Fail：** 交 **Paddy**（範圍／修 code）；驗收 bot **唔自己改 code**。建議附：場景 ID 或畫面位置＋問題＋期望（同 README 回饋格式）。

## 唔發明功能

只驗 README／本計劃已寫嘅行為。未交付項（全書、正式部署、雲端存檔等）唔當缺功能 fail。
