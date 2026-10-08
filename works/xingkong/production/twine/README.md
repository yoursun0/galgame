# 編譯《星空情緣》

工具在倉庫裡，不在暫存目錄：`/workspace/IT/galgame/tools/tweego/`。

- Tweego **2.1.1**（`2.1.1+81d1d71`，2020-02-25）。官方釋出檔 `tweego-2.1.1-linux-x64.zip`，解壓到上面那個目錄。
- Harlowe **3.3.9**。Tweego 原包自帶的是 Harlowe 3.1.0。已用 Twine 2.10.0 附帶的官方 story format 覆寫：`storyformats/harlowe-3/format.js`（來源 `twinejs` 的 `public/story-formats/harlowe-3.3.9/format.js`）。

在本目錄執行：

```
../../../../tools/tweego/tweego -f harlowe-3 -o xingkong.html xingkong.twee
```

產出 `xingkong.html`。用瀏覽器打開這個檔就可以玩，不必安裝 Twine 桌面版。
