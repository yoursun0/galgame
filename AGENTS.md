# AGENTS.md — yoursun0/galgame（《星空情緣》等）

臨時檔放 `.scratch/`，唔入產品。

## 角色（星空情緣工作組）

| 角色 | 職責 |
|------|------|
| Helic | 產品／最終拍板 |
| Paddy | Tech lead：engine／排程 Puppy、review／merge、RELEASE_NOTES、deploy |
| Puppy | 實作（Grok CLI）；開 PR，**唔**自己 merge／deploy |
| QA仔 | UAT／QA：live URL＋spec → 計畫 → browser；明顯 bug 開 issue；合 PR 後刪 branch |
| 九把刀 | 文案／story JSON |
| 凌晨 | 文案風格 review（語氣／節奏／AI 腔／破第四牆）；**唔**要求照搬原著情節；一 round feedback **一張** issue |
| 梵高 | 美術；群聊討論；常識自決；卡住先 A/B/C 圖問 Helic；可開 art issue（群裡講一聲） |
| 主廚 | 旁觀／協調，唔做日常實作 |

進度寫「星空情緣工作組」，唔 DM Helic 報進度。美術意見先 @梵高，唔先 DM Helic。

## Git／分支

- 合 PR 後**即刪** remote branch（唔留 Active 舊枝）。
- 只有 Helic／Paddy 打 `ai:ready`。
- Bug fix 預設：Paddy 派 Puppy → PR → Paddy review／merge／NOTES／deploy；極細改動 Paddy 可自改。

## RELEASE_NOTES.md（強制）

- **每次**合入 `main` 都要更新 `RELEASE_NOTES.md`（檔名係 `RELEASE_NOTES.md`，唔係舊嘅 `RELEASE_NOTE.md`）。
- 由 **下一次 commit 起**，標題必須有**日期＋時間**（Asia/Hong_Kong），格式：

```markdown
## v1.11 2026-10-11 10:58:01
```

- 寫清：改咗乜、對應 issue／PR；短句、可掃。
- 舊條目可以得日期；新條目唔好再省略時間。

## 內容 SoT

- 可玩文案／演出：`works/<work>/story/*.json` ＋ `work.json`（＋ asset-manifest）。
- Twine／`.twee`／Tweego **已退役**，唔再當 SoT，唔加返 player path。
- 部署 Cloudflare Pages：`bun run build`（base `/`），**唔好**用 `build:base` 推去 root Pages。

## 演出／立繪規則（engine）

- `dialogue` 對**有立繪**角色必填 `speaker`＋`expr`＋`text`；引擎按 speaker＋expr **自動** show／update 立繪。
- 表情 id **唔限** 01–05；新表情寫入 `characters[].sprites` 後 @梵高 出圖。
- 空／無 `sprites`＝電話 VO／無立繪：可省略 `expr`，唔自動出立繪。
- `narration` **唔**自動換立繪。
- 全頁 CG：叙事期間點畫面應繼續對白並**保持 CG**，直到 script `cg hide`／換 CG。
- 結局頁要有「回標題」；Settings 可開 DEBUG MODE（右上角顯示 `sceneId`）。

## UAT

- 跟 Ship then UAT；V1.0 主線為 **七結局**（唔驗原型 `branch` 三線）。
- 除結局／可達外，要**慢睇畫面對照文案**（地點 vs background、提及人物 vs 可見立繪）；唔好淨快進。
- 開 issue 前搜重複；誤開 duplicate 即自關並指向保留票。
- 文案問題交九把刀；engine 交 Paddy；美術群聊 @梵高。

## 語言

Helic 用中文／粵語時回中文；用英文時回英文。
