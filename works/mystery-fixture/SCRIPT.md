# mystery-fixture／晚班鑰匙

非戀愛短場（懸疑）：走廊缺鑰匙 → 三選一（上鎖／翻抽屜／問樓下）→ 結局 `stop`。

## 契約（給 player／測試）
- work id：`mystery-fixture`
- start：`corridor`
- ending id：`stop`
- 旗標：`locked`（boolean；僅「回去把門鎖上」路徑設為 true）
- 場景：`corridor` → `lock`｜`drawer`｜`ask` → `done`
- 走廊前兩句對白與三個 choice 文案勿改（`tests/reduce.test.ts` 鎖死）

## 作者
九把刀（繁中書面語 VN 口吻）。未改 `src/` 播放器。
