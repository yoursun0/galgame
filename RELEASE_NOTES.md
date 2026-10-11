# Release Notes

## v1.28 2026-10-11 12:24:18

- Player：雙人 near／far 同場時兩邊立繪都明顯可見（近收左半、遠抬到右半）（#93）。

## v1.27 2026-10-11 12:22:33

- Player：DEBUG MODE ON 時鑑賞解鎖全部 CG + BGM（可點睇／播）；結局卡仍跟進度，唔洩密（#86）。

## v1.26 2026-10-11 12:00:54

- 文案／演出：掛全頁 CG——`ch11-saw` 擁抱高潮 `cg show cg-witness-orion`；`ch12-alone` 結局前 `cg show ending-ch12-alone`（#83／#88；資產來自 #91）。

## v1.25 2026-10-11 11:57:24

- 美術：新增全頁 CG `cg-witness-orion`（草原獵戶座目擊，#83）＋結局 CG `ending-ch12-alone`（凌晨孤獨摺埋，#88）；已入 manifest。story `cg show` 仍交九把刀掛。

## v1.23 2026-10-11 11:52:40

- 文案／演出：`ch12-alone` 結局前清芷君笑臉——短暫 `05-tearsmile` 後 hide；凌晨 `04-cold` 再 hide 留空舞台（孤獨摺埋）；結局 CG 仍缺，等梵高 `ending-ch12-alone`（#88）。

## v1.22 2026-10-11 11:51:32

- 文案：`ch11-saw` 重寫目擊張力／心痛節拍（沙沙→關燈→誤認→擁抱→「是素婷」）；BGM 換 `bgm-10-i-swear-i-saw-it`；**草原獵戶座目擊 CG 仍缺**——`cg-suting-orion` 係沙灘擁抱（s4b 用），唔接錯場；等梵高補檔後再 `cg show`（#83）。

## v1.21 2026-10-11 11:50:33

- 文案：`ch07-plain` 旁白英文漏字「Quiet」刪去重複句，保留「靜了一下」（#84）。

## v1.20 2026-10-11 11:47:01

- Player：dialogue auto-expr 新說話人改佔空的近／遠槽（左／右分開），唔再一律 near 疊圖；已在場只改表情（#77）。

## v1.19 2026-10-11 11:45:30

- 文案：`ch05-circle` 芷君 `show near` 撞仍在場的凌晨 → 改 `far`（#77 UAT 清單 script 雙 near）。

## v1.18 2026-10-11 11:41:19

- Player：DEBUG MODE ON 時「回想」改為全劇分支樹（choice／set／ending）＋一鍵跳轉套用路徑變數；OFF 維持舊回想、唔洩全圖（#74）。

## v1.17 2026-10-11 11:36:53

- 文案：#78 第七話——去除全部綺珊↔凌晨對白（ch07-frame／dodge／plain 改順敘旁白＋candor 選擇保留）；coffee 雙人場 lingchen near／zhijun far（late／ask／stars／tea）。

## v1.16 2026-10-11 11:34:36

- 文案：#73 首五章節奏——長城兩線（陪素婷／追上去）在問芷君名字前必經借零錢相遇（新場 `wall_coin`→`wall_mister`）；懸空寺 `temple1`／`temple2` 補寫壯觀石、綺珊拿相機、芷君喝停、寺上介紹；`bus1`／`wall1`／合流銜接微補。

## v1.15 2026-10-11 11:30:05

- Player：鑑賞加強——已解鎖 CG 全頁重溫（關閉／點空白回鑑賞）；已解鎖音樂即換 BGM；結局顯示 `work.json` `endingTitles` 中文標題，撳已解鎖跳該結局場重播；鎖住格唔洩密（#72）。

## v1.14 2026-10-11 11:19:40

- Player：HUD 快存寫入快速槽後顯示「快速存檔成功」，唔再開存檔頁（#69）；讀檔「自動｜快速」同手動槽同寬（6 欄佔前兩格；手機 2 欄唔爆）（#70）。

## v1.13 2026-10-11 11:09:30

- Player：讀檔「自動｜快速」獨立第一行；手動槽 1–6／7–12 各成一行；存／讀槽顯示 stage 縮圖＋日期＋短文（空槽「空」、無圖 fallback）（#67）。

## v1.12 2026-10-11 11:00:39

- 文案／演出：#61 圖文不符——HIGH 12 場旁白多人錯立繪、MED 39 條主語與立繪錯位；`temple_name2` 芷君 `05-tearsmile`→`02-hips`（Helic）。

## v1.11 2026-10-11 10:59:56

- Docs：重寫 `AGENTS.md`（角色、RELEASE_NOTES **日期＋時間**、dialogue＋expr、分支衛生、UAT 慢睇、SoT＝story JSON）；更新過時 `README.md`。
- RELEASE_NOTES：由本版起標題用 `YYYY-MM-DD HH:MM:SS`（HKT）。

## v1.10 2026-10-11

- Engine：`dialogue` 必填 `expr`（角色立繪）；reduce 按 speaker＋expr 自動 show／update；空 sprites 為電話 VO／無立繪可省略（#60）。
- Settings：DEBUG MODE ON/OFF（預設 OFF）；ON 時右上角顯示目前 `sceneId`（#62）。
- 結局頁加「回標題」按鈕，行為同標題／重新開始（#63）。

## v1.9 2026-10-11

- 文案：#56 麻雀線背景 `bg-soc`→`bg-canteen`；#57 `ch09-swallow` 錯出素婷→芷君；#58 立繪表情一 round 減少長時間卡在 01。

## v1.8 2026-10-11

- 美術：`cg-baofang-bus` 換「牌＋團刊」對題圖（#53）；綺珊 `05-wink`／芷君 `01-laugh`／凌晨 `05-fire` 重畫統一畫風（#54）。

## v1.7 2026-10-11

- PWA：每次 build bump shell cache 名；navigate／`index.html` network-first；新 SW `SKIP_WAITING`＋`controllerchange` 自動 reload（#50）。
- 叙事全頁 CG：點畫面繼續對白並保持 CG，直到 script `cg hide`／換圖——唔再一撳露出空背景（#51）。

## v1.6 2026-10-11

- 退役過時 Twine／Tweego 製作路徑：刪除 `works/xingkong/production/twine/`（含 `xingkong.twee`）與轉換腳本 `tools/twee_to_xingkong_json.py`。可玩 SoT 維持 `works/xingkong/story/*.json`（＋ `work.json`）；播放器 `src/` 不變。

## v1.5 2026-10-11

- 文案：對照原文第一身文風修正（`open1` 保留並加長碎唸；`ch10-secret` 拉回黑加侖子內心戲；`ch16-dare` 加「第十一回合，阿俊問綺珊」；`ch15-grill` 第一身；結局場去掉破第四牆線名標籤，收成第一身餘韻）。

## v1.4 2026-10-11

- 文案：凌晨第一批修正（`ch05-end` 簡繁、`ch24-dawn` 去掉作者筆記、`ch12-alone`／`end-no-look-back` 去掉破第四牆結局標籤、`ch15-grill` 改寫說明腔；附帶修好 `ch19-run` 游牧對白空字串）。

## v1.3 2026-10-11

- 手機直向（~375px）遊戲中 HUD：改為換行，唔再橫向捲動；快讀／回想／設定／標題可直接點（#38）。

## v1.2 2026-10-11

- `docs/UAT.md`：UAT 改跟 V1.0 **七結局**主線（revise-plot／#28 gap report）；原型 `branch`／舊 `s_*` `z_*` `q_*` 列為刻意唔驗。
- 對應 Helic 喺「星空情緣工作組」決定：唔接返舊三線 hub。

## v1.1 2026-10-11

- 新增／更新 `docs/UAT.md`：全書《星空情緣》＋三線結局納入驗收範圍；立繪必須對齊對白角色。
- README「驗收」一節只保留公開連結與 Ship then UAT 指引（唔寫內部人事分工）。
- 本檔由 `RELEASE_NOTE.md` 更名為 `RELEASE_NOTES.md`（若適用）。

## v1.0

Helic 宣告當時 `main` 為 V1.0（本筆記錄於 UAT 文件合併時補上標籤；細節見該時點 `main` 歷史）。

## v0.1 2026-10-02

一開始的prototype, 沒有背景沒有音樂，很差。

## v0.2 2026-10-03

paddy 和 puddy 和 梵高 接手後的星空情緣PROTOTYPE，有了基本的框架。有了人物立繪和音樂。
不過仍有一些錯漏，詳見 feedback folder

## v0.3 2026-10-03

Helic 試玩後評為及格。併入 main 的是 PR #2（`f6a2461`）。

相對 v0.2：劇情裡會出現全頁 CG；十二個結局各有一張結局圖；旁白不再掛名字，也不再寫「內蒙團團刊」；對話框不再顯示頁數；打字機聲去掉；背景音樂按場景氣氛換，只用 CC0；懸空寺一場是左大右細兩個立繪；選項可以是兩個或三個；中局改成故事裡的過渡，不再向玩家解釋分支；標題頁的金色圓圈已刪。

這仍是 prototype/，不是 v1.0 播放器。正式版設計見 tech_spec.md，未批准前不開工。

