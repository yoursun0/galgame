# galgame

把小說改成可在瀏覽器（及 PWA）遊玩的視覺小說框架。播放器在 `src/`，作品資料在 `works/<id>/`——**加一本作品只加資料夾，不用改播放器。**

首部作品是《星空情緣》（作品 id `xingkong`）。原文在 `fiction.md`。另有非戀愛短場 `mystery-fixture`（標題「晚班鑰匙」，劇本見 `works/mystery-fixture/SCRIPT.md`），用來證明換作品不必動 `src/`。

## 原作改編要求（《星空情緣》）

- 主線盡量依照 `fiction.md`；角色性格與對白參考原文。
- 中局起可進「素婷線」「芷君線」「綺珊線」。
- 每條女角色線要有一個 GOOD END、一個 TRUE END、兩個 BAD END。
- 在 Web 上玩；可做 PWA 方便手機。角色造型可參考既有圖，新造型需 review（見下方三關）。

## 啟動（不用讀播放器原始碼）

```bash
bun install
bun run dev          # 開發伺服器；瀏覽器開印出的 localhost
bun test             # 單元測試
bun run check        # 檢查 mystery-fixture + xingkong
bun run build        # 靜態產物 → dist/（base = /）
BASE_PATH=/galgame/ bun run build:base   # 帶 base path 的靜態包
bun run preview      # 預覽 build
bun run verify:offline   # 本機離線包驗收（不部署）
```

- 預設作品：`xingkong`（品質試玩段到 midcard）。
- **切換作品：** 網址加 `?work=mystery-fixture`（或任何 `works/<id>/`）。**不必改 `src/`。**

## 怎麼玩

1. 標題頁：「新遊戲」「繼續」「讀檔」「設定」「鑑賞」。標題／讀檔／設定／鑑賞共用主題曲《星空烙印》（豆包；`titleBgm`，作品可省略）。
2. 點畫面／空白鍵／Enter 前進；選項出現時點選。
3. HUD：快進、自動、存／讀、設定、紀錄、回想、標題。
4. `?work=mystery-fixture` →「晚班鑰匙」：走廊缺鑰匙 → 上鎖／翻抽屜／問樓下 → 結局 `stop`（非戀愛）。

## 素材與目錄

| 路徑 | 用途 |
| --- | --- |
| `works/<id>/work.json` | 作品清單、角色、變數、場景；可設 `offlineReady` |
| `works/<id>/story/*.json` | 對白／指令（純資料） |
| `works/<id>/assets/` | 已批准給玩家用的圖與聲音 |
| `works/<id>/asset-manifest.json` | 素材 id、路徑、`approved` |
| `src/` | 共用播放器 |
| `prototype/` | v0.3 對照，不再加功能 |
| `public/icons/` | PWA 圖示 |
| `fiction.md` | 《星空情緣》原文 |
| `PLAN.md`／`tech_spec.md` | 企劃與技術決定 |

缺圖問**梵高**（程式端不生人臉）。對白／情節問**九把刀**。範圍問**Paddy**。

## 三個關卡（Helic 批准）

依 `PLAN.md`：

1. **改編企劃**——路線、結局、成本與範圍。
2. **人設／美術樣板**——風格與母版鎖定後才批量出圖。
3. **品質試玩**——10–15 分鐘正式體驗過關後才擴章。

回饋格式建議：場景 ID＋畫面／台詞位置＋問題＋期望。

## 離線／PWA（本機）

- 靜態 build 支援 `BASE_PATH`（例如 `/galgame/`）；service worker scope 與 manifest 跟 base 對齊。
- 首次仍需網路；SW precache 播放器殼＋已打進包的作品資源。
- 只有 `work.json` 標了 `"offlineReady": true` 的作品（目前 `mystery-fixture`）才在 UI 提示可離線。
- **不部署**（不開 Pages／wrangler／helic-studio arcade）。驗收：

```bash
bun run verify:offline
# 或手動：
BASE_PATH=/galgame/ bun run build:base
bunx vite preview --base /galgame/
# 開 URL?work=mystery-fixture，玩一輪讓 SW 安裝
# DevTools → Offline → 重載，應仍可玩「晚班鑰匙」
```

## v1 完成／未完成

**已完成**

- 播放器 A–C：對白、立繪、背景、CG、選項、音訊、IndexedDB 存讀、設定、快進／自動／紀錄／回想
- `xingkong` JSON 品質試玩切到 `midcard`（#8）
- 非戀愛第二作品 `mystery-fixture`／晚班鑰匙（#24 劇本；加作品不改 `src/`）
- 靜態 base path + PWA shell（manifest／SW／圖示）
- README、本機 `verify:offline`

**未完成**

- 《星空情緣》全書／三線全部 GOOD·TRUE·BAD
- 正式部署（Pages 等）、helic-studio arcade
- 完整 SFX、Live2D、雲端存檔、桌面版

沒有正式素材或 Helic 批准時，狀態是「框架＋試玩／fixture 完成」，**不是**完整視覺小說已交付。
