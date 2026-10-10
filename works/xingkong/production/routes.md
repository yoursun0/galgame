# 《星空情緣》路線與旗標細表

附屬於 [`adaptation-plan.md`](adaptation-plan.md)。給製作／檢查用；**不要**把 TRUE／GOOD／BAD 字樣做進對白。

---

## 1. 變數對照（現況 → 建議正式）

| 建議正式名 | 類型 | 初值 | 現況來源 | 寫入閘（試玩或全文） |
|------------|------|------|----------|----------------------|
| `qishanHonest` | bool | false | `work.json`；`qi_choice__1`→true、`__0`→false | 車站團刊 |
| `sutingWalk` | bool | false | `wall_choice__0`→true、`__1`→false | 長城陡坡 |
| `zhijunName` | bool | false | `temple_choice__1`→true；其餘 false | 懸空寺 |
| `courage` | number | 0 | twee `$courage`；**JSON 尚未有** | 見下表；cap 5 |
| `candor` | number | 0 | twee `$candor`；**JSON 尚未有** | coffee 誠實閘；cap 4 |
| `ch4_faced` | bool | false | twee | Ch04 留下講完 |
| `ch7_faced` | bool | false | twee | Ch07 走過去坐 |
| `ch21_ask` | bool | false | twee | Ch21 認真去問 |

**命名衝突說明：** twee 團刊閘目前未 set `qishanHonest`；JSON 未實作 courage／candor。正式試玩劇本應對齊上表。**對齊工作屬 #8，本 PR 只記錄。**

預留 boolean（實作前依 twee 閘口定名，不先發明情節）：

- 是否前往 re-union（與 Ch12 閘對應）  
- 是否引開狗（與 Ch19 閘對應）  
- 是否追 MMW 天台（與綺珊結局閘對應）  
- （可選）團刊「強塞」與否——若與 `qishanHonest` 可合併則不另開

合計 boolean 目標約 **8–10**，符合方法丙。

---

## 2. Courage／Candor 增量（已批准）

### Courage（0–5）

| 話／閘 | 選項（摘要） | +1 條件 |
|--------|--------------|---------|
| Ch04 | 留下，把話講完 | 是；並 `ch4_faced=true` |
| Ch07 | 走過去，坐到素婷另一邊 | 是；並 `ch7_faced=true` |
| Ch11 | 回頭看 | 是 |
| Ch12 | 聽她的，去 re-union | 是 |
| Ch19 | 引開那兩頭狗 | 是 |

### Candor（0–4）

| 話／閘 | 選項（摘要） |
|--------|--------------|
| Ch05／收束後 coffee | 說，我放不下素婷 |
| Ch07 coffee | 照直說，我是為了素婷才沒走 |
| Ch08 | 把那三點說清楚 |
| Ch16 | 照直說 |

（結構：多段 coffee 誠實可收成離美前一次；次數仍累加 candor。）

---

## 3. 共同段流程（含試玩）

```
open1–open3 / Ch01-Soc…Poster
  → st1–st5 / Ch01-Station…
  → qi_choice（qishanHonest）
  → bus1
  → wall1–3 → wall_choice（sutingWalk）
  → temple1–2 → temple_choice（zhijunName）
  → star1–5 → midcard          ← 品質試玩建議停此
  → branch（完整版：三向剝離）
```

`midcard` 現有旁白已用故事口吻點三旗標，不解釋結局類型——正式稿應保留此原則。

---

## 4. 結局條件（內部；對應 adaptation-plan §3.3）

| 結局代號 | 必要條件（邏輯） | 企劃標籤 |
|----------|------------------|----------|
| `End-Canon-Rain` | 走到 canon 收束支 | 原著 TRUE 錨 |
| `Ch10-BadEnd` | Ch10 守密閘失敗支 | BAD |
| `Ch12-Alone` | Ch12 選「連她的話也不聽」 | BAD |
| `End-No-Look-Back` | Ch19 選「自己跑回去求救」等已定失敗支 | BAD |
| `End-Suting-Early` | `ch4_faced` ∧ `ch7_faced`（及 twee 既有到達條件） | GOOD |
| `End-Zhijun-Hankie` | `ch21_ask` ∧ `courage >= 3` | TRUE／GOOD |
| `End-Qishan-Pinch` | `candor >= 2` ∧ 選追上 MMW 天台 | TRUE／GOOD |

v0.3 JSON 線末條件（原型，僅供對照）：

| 線 | TRUE 條件（原型） | GOOD | BAD |
|----|-------------------|------|-----|
| 素婷 | `sutingWalk` | 無該旗 | leave／rip |
| 芷君 | `zhijunName` | 無該旗 | shield／bridge |
| 綺珊 | `qishanHonest` | 無該旗 | setup／cool |

→ 正式版結局以 twee 表為準；原型條件可吸收為**早期旗標對後來解鎖的加權**，但不得與已批准結局條件衝突。**待確認。**

---

## 5. 梯式剝離原則（給編劇）

1. 共同段事件盡量人人都會經歷（內蒙團前段）。  
2. 閘口選項只改變「有沒有踏出那一步」，不改變他人既定性格。  
3. 剝離後仍可在後段共同事件重逢（同學會、天台等）。  
4. 結局閘只讀旗標與計量，不讀隱藏「好感度條」。
