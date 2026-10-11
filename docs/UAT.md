# 驗收（UAT）測試計劃

給本專案瀏覽器手動驗收用。本文件唔授權為咗「過關」而改 `src/` 或作品資料；發現問題用 GitHub issue 跟進。

## 目的與範圍

- **驗什麼：** 瀏覽器視覺小說框架（`src/` 播放器）＋作品資料能否完整可玩。
- **作品：**
  - `xingkong`（《星空情緣》）——跟 **revise-plot／V1.0 七結局** 主線（見 `works/xingkong/production/issue-28-gap-report.md`、`routes.md`、`adaptation-plan.md` §3.3）。
  - `mystery-fixture`（「晚班鑰匙」）——非戀愛短場；`offlineReady`。
- **刻意唔驗（唔當缺線 fail）：** 原型 hub `branch` 同舊三線 `s_*`／`z_*`／`q_*` GOOD／TRUE／BAD 場景（V1.0 主線唔接；檔案可留作佔位）。
- **唔驗（非本計劃缺功能 fail）：** Live2D、雲端存檔、桌面版等未交付項。公開部署若存在，須確認測緊嘅係目標 commit（Ship then UAT）。

## 前置條件（Ship then UAT）

**必須先確認 live／預覽目標係要測嘅 commit，先開始測。**

1. 記錄要測嘅 **commit SHA**。
2. 啟動方式（擇一，報告寫明）：
   - 開發：`bun install` → `bun run dev` → localhost
   - 靜態預覽：`BASE_PATH=/galgame/ bun run build:base` → `bun run preview`
   - 若有公開 Pages／正式 URL：先核對該 deploy 對應嘅 commit，先測
   - 離線：`bun run verify:offline`（見 PWA 個案）
3. 可選先跑：`bun test`、`bun run check`（唔取代瀏覽器 UAT）。
4. 報告註明：**SHA、啟動方式、URL、日期、瀏覽器、視窗寬度**。

## 基線清單（web app）

| # | 項目 | 期望 |
| --- | --- | --- |
| B1 | Mobile responsive | 約 375px：標題、對白、選項、**HUD 全部可點**（唔應要橫向捲動先夠著右側按鈕） |
| B2 | 主要 flow | 標題 → 新遊戲 → 前進／選項 → 存讀／設定 → 回標題 |
| B3 | 明顯 UI | 按鈕可點、文字可讀、主題曲／標題備註（有設先有）正常 |
| B4 | 空狀態 | 無存檔時「繼續」合理；讀檔空槽可理解 |
| B5 | 壞 link／缺資源 | 缺圖或缺音唔整頁白屏 |

## 立繪／對白對齊（強制準則）

以下任何一項即 **fail**（記：場景 ID、speaker／台詞、畫面實際立繪）：

1. **說話人 = 立繪：** 具名對白時，立繪須係該句說話人（或劇本明確同時在場者）。唔可以「對白冇綺珊但畫面有綺珊」。
2. **離場要清：** 換人／離場後唔應殘留無關立繪。
3. **旁白：** narration 唔應掛錯角色立繪當說話人；空白／錯位 speaker 名記 fail。
4. **壞圖：** 破圖、明顯錯表情、404 導致不可玩 → fail。

美術風格好不好睇：群聊 @梵高；唔用本條自動當 engine bug。

## 具體個案

### 1. 標題頁

- 預設 `xingkong`：見「新遊戲」「繼續」「讀檔」「設定」「鑑賞」。
- `titleBgm`／`titleNote`（有設先有）。

### 2. 新遊戲 · `xingkong` 主線（七結局產品）

- 「新遊戲」可前進（點擊／空白鍵／Enter）；選項可點。
- 主線跟 revise-plot：**唔**停喺舊 `midcard` 試玩感謝卡；**唔**要求進入原型 `branch`。
- 全程套用「立繪／對白對齊」。
- 背景／CG／音訊白屏、卡死無法前進 → fail。

### 3. 七個可達結局（`xingkong`）

SoT：gap report 可達結局（場景 id 以 `works/xingkong/story/` 為準）。每條須實際玩到結局畫面並截圖（可用存檔／快進輔助，但結局卡要見到）。

| # | 場景 id（約） | 標題（企劃） | 企劃標籤 |
| --- | --- | --- | --- |
| E1 | `ch10-badend`（ending `ch10-bad-secret`） | 守不住的秘密 | BAD |
| E2 | `ch12-alone` | 一個人走 | BAD |
| E3 | `end-no-look-back` | 沒有回頭 | BAD |
| E4 | `end-suting-early` | 早一步 | GOOD（素婷向） |
| E5 | `end-zhijun-hankie` | 新手帕 | TRUE／GOOD（芷君向） |
| E6 | `end-qishan-pinch` | 捏兩下 | TRUE／GOOD（綺珊向） |
| E7 | `end-canon-dawn` | 原著收束（經 `End-Canon-Rain`／天台上的雨 中段後入 Ch24） | 原著／TRUE 錨 |

- 結局可到達、可辨識、唔卡死；結局 CG／立繪錯配同樣 fail。
- 遊戲內**唔**要求顯示 TRUE／GOOD／BAD 字樣（僅驗收／企劃用）。
- 條件細節見 `production/routes.md` §4；驗收以「能到達＋畫面正確」為主，旗標公式錯誤另開 issue。

### 4. 存／讀／繼續

- 存檔 → 標題 → 讀檔／繼續回到合理進度；刷新後同瀏覽器存檔仍在。

### 5. 設定／HUD／鍵盤

- 設定：文字速度／音量等可改可返。
- HUD：快進、自動、存／讀、設定、紀錄、回想、標題等預期效果。
- 空白鍵／Enter 前進；有選項時唔誤觸跳過（或記錄實際行為）。

### 6. `?work=mystery-fixture`

- 標題「晚班鑰匙」；可玩至結局 `stop`；證明換作品唔使改 `src/`。

### 7. PWA／離線（mystery-fixture）

- `bun run verify:offline` 或 build:base + preview → Offline 重載仍可玩；只 `offlineReady` 作品提示離線。

### 8. 空狀態／切換作品

- 空存檔行為合理；`xingkong` 同 `mystery-fixture` 可交替開、存檔唔互相污染到無法玩。

## 報告格式（pass／fail）

| 項目 | 結果 | 證據 | 重現 |
| --- | --- | --- | --- |
| （編號） | pass／fail | 截圖／簡述 | URL、操作、期望 vs 實際 |

**Fail：** 開 GitHub issue（engine → Paddy；文案 → 九把刀；美術 → 群聊 @梵高 後起 issue）。驗收流程本身唔改 code。

## 唔發明功能

只驗本計劃同現有可玩主線。原型三線檔案不可達 **唔** 當 V1.0 fail（見「刻意唔驗」）。
