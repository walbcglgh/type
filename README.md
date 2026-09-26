# 打字練習場

純靜態的線上打字練習／測試網頁，無框架、無建置步驟、無相依套件。
中英文共用同一套逐字比對邏輯，中文可直接用注音／倉頡等輸入法打字。

## 功能

- **限時模式**：15 / 30 / 60 / 120 秒，時間到自動結算
- **練習模式**：20 / 50 / 100 / 200（英文算單字、中文算字數），打完自動結算
- 即時 WPM、精確度、連擊；換行時文字與游標一起位移
- 失焦暫停計時，點一下即可接回；`Tab` 重新開始
- 手機可用螢幕鍵盤輸入，含輸入法未上屏的字（composition）顯示

## 本地預覽

任意靜態伺服器即可，例如：

```bash
python3 -m http.server 8000
```

或直接雙擊 `index.html`。

## 部署：GitHub Pages

1. 到 repo 的 **Settings → Pages**
2. Source 選 **Deploy from a branch**，Branch 選 `main` / `/ (root)`，Save
3. 約一分鐘後開 `https://<使用者名稱>.github.io/type/`

不需要 `_config.yml`，也不需要 build command。

## 部署：Vercel（可選）

直接 **Import Git Repository**，Framework Preset 選 **Other**，
Build Command 與 Output Directory 都留空即可——內容本身就是可直接服務的靜態檔。
之後改用 GitHub Pages 或兩者並行都不衝突。

## 檔案

| 檔 | 用途 |
| --- | --- |
| `index.html` | 結構 |
| `styles.css` | 版面與配色 |
| `app.js` | 題目文字、比對、計時、統計 |

想換自己的練習材料，改 `app.js` 裡的 `PASSAGES.en` / `PASSAGES.zh` 即可。
