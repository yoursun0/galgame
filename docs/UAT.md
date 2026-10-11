# 驗收（UAT）測試計劃

給本專案瀏覽器手動驗收用。本文件唔授權為咗「過關」而改 `src/` 或作品資料；發現問題用 GitHub issue 跟進。

## 目的與範圍

- **驗什麼：** 瀏覽器視覺小說框架（`src/` 播放器）＋作品資料能否完整可玩。
- **作品（皆 in-scope）：**
  - `xingkong`（《星空情緣》）——**全書主線 + 素婷／芷君／綺珊三線**；每線須能到達預期結局類型（每線至少一個 GOOD END、一個 TRUE END、兩個 BAD END，以現有 `works/xingkong/story/` 結局場景為準）。
  - `mystery-fixture`（「晚班鑰匙」）——非戀愛短場；`offlineReady`。
- **唔驗（非本計劃缺功能 fail）：** 正式公開部署（Pages 等）、Live2D、雲端存檔、桌面版、完整 SFX 未交付項。

## 前置條件（Ship then UAT）

**必須先確認 live／預覽目標係要測嘅 commit，先開始測。**

1. 記錄要測嘅 **commit SHA**（例如 `git rev-parse HEAD` 或部署註明嘅 tip）。
2. 目前若無公開部署，驗收目標用本機：
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

## 立繪／對白對齊（強制準則）

以下任何一項即 **fail**（記錄：場景 ID 或存檔點、對白 speaker／台詞、畫面上實際出現嘅立繪角色）：

1. **說話人 = 立繪：** 有具名對白時，畫面顯示嘅立繪人物必須係該句說話人（或劇本明確要求同時在場嘅角色）。唔可以出現「劇情／對白冇綺珊，但畫面有綺珊立繪」之類錯配。
2. **離場要清：** 角色已離場或場景換人後，唔應殘留上一句無關角色嘅立繪。
3. **旁白／無 speaker：** narration 唔應掛錯角色立繪當說話人；空白／錯位 speaker 名記 fail。
4. **壞圖：** 立繪破圖、明顯錯用表情檔、路徑 404 導致整頁不可玩 → fail。

美術風格好不好睇（是否夠美）唔用呢條自動開 issue；須先取得產品負責人批准再起美術類 issue。

## 具體個案

### 1. 標題頁

- 開預設作品（`xingkong`）。
- 見「新遊戲」「繼續」「讀檔」「設定」「鑑賞」。
- 標題／讀檔／設定／鑑賞可播主題曲（`titleBgm`）；`xingkong` 可選顯示 `titleNote`。

### 2. 新遊戲 · `xingkong` 全書主線

- 「新遊戲」進入對白；點畫面／空白鍵／Enter 可前進；選項出現時可點選。
- **玩完整主線至可進入三線分支**（唔只停喺舊「midcard／品質試玩」切點）。
- 全程套用上方「立繪／對白對齊」準則。
- 背景／CG／音訊明顯壞掉（白屏、死圖、卡住無法前進）記 fail。

### 3. 三線結局（`xingkong`）

每條線（素婷／芷君／綺珊）至少驗證：

| 線 | 須到達 |
| --- | --- |
| 素婷 | 1× GOOD、1× TRUE、2× BAD（對應現有結局場景，例如 `s_good*`／`s_true*`／`s_bad*` 等） |
| 芷君 | 同上（`z_*`） |
| 綺珊 | 同上（`q_*`） |

- 可用存檔／快進輔助，但每條路徑嘅最終結局畫面須實際見到並截圖。
- 結局可到達、可辨識、唔卡死；結局 CG／立繪錯配同樣 fail。
- 分支內容明顯跳錯線、死路、或選項無反應 → fail。

### 4. 存／讀／繼續

- 遊戲中存檔 → 回標題 →「讀檔」或「繼續」可回到合理進度。
- 刷新後 IndexedDB 存檔仍在（同瀏覽器、未清資料）。

### 5. 設定

- 標題或 HUD 入設定；改文字速度／音量等可見選項後生效或可還原；可返回。

### 6. HUD

- 遊戲中：快進、自動、存／讀、設定、紀錄、回想、標題。
- 各按鈕有預期效果；「標題」可回標題頁。

### 7. 鍵盤

- 空白鍵／Enter 前進（無選項時）。
- 有選項時唔好誤觸跳過（或行為與產品一致並記錄）。

### 8. `?work=mystery-fixture` →「晚班鑰匙」

- URL 加 `?work=mystery-fixture`（dev 或 preview base path 下一樣）。
- 標題為「晚班鑰匙」；走廊缺鑰匙 → 上鎖／翻抽屜／問樓下等分支。
- 可到結局 `stop`（非戀愛；唔要求戀愛 HUD／好感）。
- **證明：** 換作品唔使改 `src/`（只靠 `works/<id>/` + query）。

### 9. PWA／離線（mystery-fixture）

- 跟 README：`bun run verify:offline`，或手動 build:base + preview，開 `?work=mystery-fixture`，玩一輪等 SW 安裝 → DevTools Offline → 重載仍可玩。
- 只有 `offlineReady: true` 作品先應有離線提示；`xingkong` 唔當離線必過項。

### 10. 空狀態／缺素材／壞 link

- 無存檔時繼續／讀檔。
- 若本機刻意缺某 asset（或已知缺圖），確認唔整頁崩潰；記截圖。
- 標題／HUD 明顯死 link 記 fail。

### 11. 切換作品

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

**Fail：** 開 GitHub issue（明顯 engine／programming bug assign 工程負責；文案問題 assign 文案負責）。驗收流程本身唔改 code。建議附：場景 ID 或畫面位置＋問題＋期望。

## 唔發明功能

只驗本計劃與現有作品資料已寫嘅行為。未列喺「唔驗」且已存在於 `works/` 嘅路徑／結局，須按上表驗完。
