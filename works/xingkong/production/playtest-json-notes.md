# 品質試玩 JSON 對齊備註（#8）

對照：`adaptation-plan.md`、`routes.md`、`twine/xingkong.twee`。  
分支：`agent/puppy/issue-8-playtest`。未改 player。

## 試玩路徑

`open1` → `open2` → `open3` → `st1`…`st5` → `qi_choice`（及 cool／honest 支）→ `zj1`…`zj4` → `bus1` → `wall1`…`wall_choice`（及 slow／run 支）→ `temple1`…`temple_choice`（及三支）→ `star1`…`star4` → **`star_choice`** → `star_leave`／`star_stay` → `star_poem` → **`midcard`**（`ending: playtest-midcard`）

**不進** `branch` 及之後三線。

## 旗標對齊（routes 正式名）

| 名 | 類型 | 初值 | 寫入 |
|----|------|------|------|
| `qishanHonest` | bool | false | `qi_choice__0`→false；`qi_choice__1`→true |
| `sutingWalk` | bool | false | `wall_choice__0`→true；`wall_choice__1`→false |
| `zhijunName` | bool | false | `temple_choice__1`→true；其餘 false |
| `courage` | number | 0 | `star_choice__1`→1（Ch04 留下；本段僅此一閘） |
| `ch4_faced` | bool | false | `star_choice__0`→false；`star_choice__1`→true |
| `candor` | number | 0 | 試玩段不寫入（僅宣告） |

## 舊→新／重用

| id | 說明 |
|----|------|
| `open1`–`open3` | 重寫為 SOC「話當年」→切入一年前（對齊 twee Ch01-Soc／Poster） |
| `star4` | jump 改為 `star_choice`（原→`star5`） |
| `star5` | 改為導向 `star_choice` 的薄轉接（保留 id） |
| `star_choice` 等 | **新增** Ch04 courage／`ch4_faced` 閘 |
| `star_leave`／`star_stay`／`star_poem` | **新增**；對白取自 twee Ch04-Leave／Stay／Poem（詩為節錄） |
| `midcard` | 收束＋感謝試玩；`ending playtest-midcard`；**不再** jump `branch` |

## 未動

- `branch` 及 `s*`／`z*`／`q*` 線結局檔仍在倉庫（完整版藍本），試玩路徑不進入。
- player 程式、tweego／html。
