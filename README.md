# Open Literature Map

本專案是一個本機執行的學術文獻整理與關係視覺化工具，協助使用者瀏覽、整理及探索自己的文獻資料。

## 使用方式

需要先安裝 [Node.js](https://nodejs.org/)。在專案目錄執行：

```bash
node server.mjs
```

接著使用瀏覽器開啟：

```text
http://127.0.0.1:8770/
```

## 主要功能

- 匯入及整理本機文獻資料
- 以關係圖檢視文獻
- 搜尋結果整理與基本篩選
- 文獻收藏、標記及備份
- 支援在本機環境執行

## 設定

若需要額外的服務設定，請參考 `.env.example` 建立本機 `.env` 檔案。請勿將 `.env` 或任何私人金鑰提交至版本控制系統。

## 專案結構

```text
src/       前端程式
scripts/   資料處理工具
tests/     基本驗證腳本
vendor/    本機使用的第三方資源
```

## 開發檢查

```bash
node --check src/app.js
node --check src/search.js
node --check server.mjs
```

本專案為開源、持續開發中的工具。實際資料與本機設定不包含在公開版本中。
