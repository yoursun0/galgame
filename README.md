# galgame

瀏覽器／PWA 視覺小說播放器。播放器在 `src/`，作品在 `works/<id>/`——**加作品只加資料夾，唔改播放器。**

首部作品《星空情緣》（id `xingkong`）。另有非戀愛短場 `mystery-fixture`（「晚班鑰匙」），證明換作品唔使動 `src/`。

**Live：** [https://galgame-aee.pages.dev/](https://galgame-aee.pages.dev/)（Cloudflare Pages，`bun run build` base `/`）

Agent／協作規矩見 [`AGENTS.md`](./AGENTS.md)。變更紀錄見 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)。UAT 見 [`docs/UAT.md`](./docs/UAT.md)。

## 《星空情緣》現況（V1.0+）

- 可玩 SoT：`works/xingkong/story/*.json` ＋ `work.json`（Twine／`.twee` 已退役）。
- 主線跟 revise-plot：**七結局**（唔再當正式路徑驗原型 `branch` 三線 hub）。
- 對白格式：有立繪角色嘅 `dialogue` 必填 `speaker`＋`expr`；引擎自動換立繪。電話 VO（空 sprites）可省略 `expr`。
- 標題主題曲《星空烙印》（`titleBgm`）；標題備註 `titleNote`：「改篇自凌晨《話當年之二》@ 2011」。
- 設定可開 **DEBUG MODE**（右上角顯示目前 `sceneId`）；結局頁有 **「回標題」**。

## 啟動

```bash
bun install
bun run dev          # 開發伺服器
bun test
bun run check        # mystery-fixture + xingkong
bun run build        # → dist/（Pages 用呢個；base = /）
bun run preview
bun run verify:offline
```

- 預設作品：`xingkong`。切換：`?work=mystery-fixture`（或任何 `works/<id>/`）。
- **部署 root Pages 唔好用** `BASE_PATH=/galgame/ bun run build:base`。

## 點玩

1. 標題：「新遊戲」「繼續」「讀檔」「設定」「鑑賞」。
2. 點畫面／空白鍵／Enter 前進；選項出現時點選。
3. HUD：快進、自動、存／讀、設定、紀錄、回想、標題。
4. 結局卡撳「回標題」可重開。

## 目錄

| 路徑 | 用途 |
| --- | --- |
| `works/<id>/work.json` | 清單、角色、變數；可設 `offlineReady`、`titleBgm`、`titleNote` |
| `works/<id>/story/*.json` | 對白／指令（純資料） |
| `works/<id>/assets/` | 圖與聲音 |
| `works/<id>/asset-manifest.json` | 素材 id／路徑／`approved` |
| `src/` | 共用播放器 |
| `AGENTS.md` | bot／協作規則 |
| `RELEASE_NOTES.md` | 版本紀錄（新條目要**日期＋時間** HKT） |
| `docs/UAT.md` | 驗收 |
| `fiction.md` | 《星空情緣》原文參考 |
| `public/icons/` | PWA 圖示 |

缺圖 @**梵高**。對白／情節 @**九把刀**。Engine／排程 @**Paddy**（Puppy 寫 code）。UAT @**QA仔**。

## 離線／PWA

- `bun run build` 生成 SW；cache 名跟 build bump；navigate／index network-first。
- 只有 `"offlineReady": true` 嘅作品（目前 `mystery-fixture`）先喺 UI 標可離線。

## 驗收（UAT）

見 [`docs/UAT.md`](./docs/UAT.md)。重點：七結局可達；**慢睇**圖文是否相符（地點 vs background、人物 vs 立繪）；合 PR 後驗 live tip。
