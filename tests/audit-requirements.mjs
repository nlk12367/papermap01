import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFile(path.join(root, file), 'utf8');
const [html, styles, app, search, server, filters, library, fetcher, arxivFetcher, ieeeFetcher, merger, builder, license] = await Promise.all([
  read('index.html'), read('styles.css'), read('src/app.js'), read('src/search.js'), read('server.mjs'), read('src/filters.js'), read('src/library.js'),
  read('scripts/fetch-openalex.mjs'), read('scripts/fetch-arxiv.mjs'), read('scripts/fetch-ieee.mjs'), read('scripts/merge-sources.mjs'), read('scripts/build-graph.mjs'), read('LICENSE')
]);
const graph = JSON.parse(await read('data/graph.json'));

for (const type of ['citation','shared-topic','similarity']) assert.ok(graph.edges.some(edge => edge.type === type), `缺少 ${type} 關係`);
for (const field of ['citedByCount','citedByApiUrl','referencedWorks','concepts','abstract','sourceType','isOpenAccess']) assert.ok(graph.nodes.every(node => field in node), `缺少 ${field} metadata`);
for (const id of ['keyword-filter','year-min','year-max','source-options','cite-min','cite-max','oa-filter','x-metric','y-metric','size-metric']) assert.ok(html.includes(`id="${id}"`), `缺少控制項 ${id}`);
for (const view of ['references','search-input','result']) assert.ok(html.includes(`data-view="${view}"`), `缺少檢視 ${view}`);
assert.match(app, /data-library-toggle/);
assert.match(app, /data-seed/);
assert.match(library, /localStorage|storage/);
assert.match(library, /seedNetwork/);
assert.match(fetcher, /api\.openalex\.org/);
assert.match(arxivFetcher, /export\.arxiv\.org\/api\/query/);
assert.match(ieeeFetcher, /ieeexploreapi\.ieee\.org\/api\/v1\/search\/articles/);
assert.match(ieeeFetcher, /IEEE_XPLORE_API_KEY/);
assert.match(merger, /ieee\.json/);
assert.match(merger, /metadataProviders/);
assert.match(builder, /tfidfCosine/);
assert.match(builder, /jaccard/);
assert.match(license, /MIT License/);

const runtime = `${html}\n${app}\n${filters}\n${library}`.toLowerCase();
for (const forbidden of ['sjr quartile','journal h-index','article risk indicator','retraction filter']) assert.ok(!runtime.includes(forbidden), `介面不應包含 ${forbidden}`);
for (const llm of ['openai.com','anthropic.com','generativelanguage.googleapis.com','chat/completions']) assert.ok(!runtime.includes(llm), `地圖核心不應呼叫 ${llm}`);
assert.ok(!runtime.includes('researchrabbit'), '不得複製第三方商標文字');
assert.ok(graph.nodes.some(node => node.sourceType === 'arXiv'), '合併圖資料必須包含 arXiv 來源');
assert.match(app, /draggingNode\.x/);
assert.match(app, /draggingNode\.y\s*=\s*-\(event\.clientY - rect\.top - offsetY\) \/ scale/);
assert.match(styles, /grid-template-columns:\s*var\(--filter-width\) 10px minmax\(520px, 1fr\) 10px var\(--detail-width\)/);
assert.doesNotMatch(styles, /\.detail-panel\s*\{\s*grid-column:\s*1\s*\/\s*-1/);
assert.match(html, /id="left-resizer"/);
assert.match(html, /id="right-resizer"/);
assert.match(app, /setupColumnResizer/);
assert.match(app, /literature-map-column-sizes/);
for (const id of ['search-section','research-topic','paper-folder','paper-list','keyword-editor','external-results','import-results']) assert.ok(html.includes(`id="${id}"`), `缺少搜尋頁控制項 ${id}`);
assert.match(search, /webkitRelativePath/);
assert.match(search, /pdfjs\.getDocument/);
assert.match(server, /GROQ_API_KEY/);
assert.match(server, /api\.groq\.com\/openai\/v1\/chat\/completions/);
assert.match(server, /searchOpenAlex/);
assert.match(server, /searchArxiv/);
assert.match(server, /function buildIEEEQueries/);
assert.match(server, /api\/ieee-queries/);
assert.match(search, /api\/ieee-queries/);

console.log('完成稽核通過：資料、關係、檢視、篩選、收藏、種子網絡、效率與授權要求皆有對應實作');
