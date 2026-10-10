# Issue #28 gap report（Ch05→結局已接）

SoT: `works/xingkong/production/twine/xingkong.twee`（含 `Ch04-Leave`→`Ch05-Road` 斷鏈修復）。

## 已完成

1. **twee**：`Ch04-Leave` 改跳 `Ch05-Road`（不再指已刪 `Ch04-Poem`）。
2. **主線**：`star_stay`／`star_leave` → `ch05-road`（**不**經 `midcard` ending、**不**接 `branch` 原型線）。`midcard` 若進入亦續跳 Ch05。
3. **Ch05–Ch24 + Su-* + End-***：由 twee 轉寫為 `works/xingkong/story/ch*.json` 等（kebab-case id）。
4. **旗標**（`work.json`）：`qishanHonest`／`sutingWalk`／`zhijunName`／`courage`／`candor`／`ch4_faced`／`ch7_faced`／`ch21_ask`。
5. **斷鏈／孤兒補線**（不發明情節，只接回既有 passage）：
   - `Ch07-Late` → `Ch07-Frame` → Dodge/Plain → `Ch07-Ask`（接回 candor 閘）
   - `Ch15-Snap` → `Ch16-Frame` → Coat（接回 candor 閘）
   - `Ch21-Fake` → `Ch22-Corner`（原誤指 `Ch05-Ask`）
6. **可達結局**（BFS）：`ch10-bad-secret`、`ch12-alone`、`end-no-look-back`、`end-suting-early`、`end-zhijun-hankie`、`end-qishan-pinch`、`end-canon-dawn`。`End-Canon-Rain` 為中段節點，續入 Ch24。
7. **無** 《在天邊》／`star_poem`／`playtest-midcard` 主線收束。

## 刻意保留

- 早期 Ch01–Ch04 仍用已合 main 的 `open*`／`st*`／`wall*`／`temple*`／`star_*`（#29），未整段重寫。
- 原型 `branch`／`s_*`／`z_*`／`q_*` 檔案仍在 disk／manifest（測試仍宣告 ending ids），但主線 **不可達** `branch`。

## 已知限制（非阻擋）

- Ch05+ 台詞以 twee 為準直轉，立繪／BGM 為章節預設，未逐場精調演出。
- twee 內 Ch05／Ch08 candor 閘在 revise-plot 後本就不在可玩 spine；現靠 Ch07-Frame／Ch16-Frame 補線累加 candor。
- 轉換腳本：`tools/twee_to_xingkong_json.py`（可重跑；條件選項閘 `ch10-hand__*`／`ch22-table__*` 已手修）。

## 下一步（Puppy／Paddy）

- 測＋ Pages deploy（`bun run build`，base `/`）。
- 可選：退役原型 `branch`／`s_*`／`z_*`／`q_*`。
