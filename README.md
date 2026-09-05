# Open Literature Map

針對使用者自己匯入文獻庫的開源關係地圖。地圖與關係計算完全使用本地字串、集合與 TF-IDF 運算，不呼叫 LLM。

## 搜尋頁

執行 `node server.mjs` 後開啟 `http://127.0.0.1:8770/`。首頁可選擇任何包含 PDF 的資料夾，不限 Academic Codex V4 專案。使用者另行輸入研究題目，再勾選要納入的本地論文以及其中的種子論文。PDF 文字由瀏覽器內的本地 PDF.js 擷取；Groq 僅負責有限度整理與擴展關鍵字。沒有 Groq Key 時會自動使用本機詞頻方法。

將 `.env.example` 複製為 `.env` 後可填入 `GROQ_API_KEY` 與選用的 `IEEE_XPLORE_API_KEY`；`.env` 已列入 `.gitignore`。外部搜尋結果可勾選後連同本地論文匯入同一張地圖。

## 第一階段

1. `node scripts/fetch-openalex.mjs --query "color vision deficiency augmented reality" --count 40`
2. `node scripts/fetch-arxiv.mjs --query "color vision augmented reality" --count 25`
3. （選用）先設定 `IEEE_XPLORE_API_KEY`，再執行 `node scripts/fetch-ieee.mjs --query "color vision deficiency augmented reality" --count 40`
4. `node scripts/merge-sources.mjs`
5. `node scripts/build-graph.mjs`
6. 依序執行 `node tests/validate-graph.mjs`、`node tests/validate-filters.mjs`、`node tests/validate-library.mjs` 與 `node tests/audit-requirements.mjs`
7. 以任意靜態 HTTP 伺服器開啟專案根目錄，例如 `python -m http.server 8770`。

OpenAlex、arXiv 與選用的 IEEE Xplore 原始回應分別正規化至 `data/openalex.json`、`data/arxiv.json`、`data/ieee.json`，合併去重後存於 `data/works.json`；引用、共同主題與文字相似度邊一次性計算後存於 `data/graph.json`。開啟地圖不會重新呼叫 API，也不會重新計算整批關係。

IEEE Xplore Metadata API 每次查詢都需要個人 API Key。金鑰僅從程序環境變數 `IEEE_XPLORE_API_KEY` 讀取，不寫入前端、原始碼或快取檔。VPN／學校網路只負責機構訂閱全文的正常開啟權限，不能取代 API Key。

`metadataProvider` 表示 metadata 由 OpenAlex 或 arXiv 取得；`sourceType` 表示實際來源，因此 OpenAlex 收錄的 arXiv 論文也會在介面中歸入 arXiv。

在關係佈局模式下可直接拖曳單一節點；拖曳空白區域仍是平移整張地圖。「重新整理佈局」會還原所有節點的預設位置。

## 第二階段

介面提供參考文獻、種子文獻、搜尋結果及全部文獻檢視；可依題名／摘要／主題關鍵詞、出版年份、資料來源、引用數與開放取用狀態組合篩選。X 軸、Y 軸與節點大小可切換為關係佈局、出版年份、引用數、參考文獻數、主題重疊度或資料來源。所有操作只處理已快取的 `graph.json`。

## 第三階段

在論文詳情中可加入或移出「我的文獻庫」。收藏 ID 儲存在瀏覽器 `localStorage` 的 `open-literature-map.library.v1`，不依賴外部帳號或舊專案資料。文獻庫中的任一論文都能設為種子，地圖會顯示該論文及其一階引用、共同主題與文字相似關係。

目前刻意不包含 SJR 分區、期刊 H-index、文章風險指標與全網即時相似度搜尋。
