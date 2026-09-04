import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceFiles = ['openalex.json','arxiv.json','ieee.json'];
const sources = [];
for (const file of sourceFiles) {
  try { sources.push(JSON.parse(await fs.readFile(path.join(root, 'data', file), 'utf8'))); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!sources.length) throw new Error('找不到任何來源快取');

const normalizedTitle = title => (title || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const doiKey = work => (work.landingUrl?.match(/10\.\d{4,9}\/[\w.()/:;-]+/i) || [])[0]?.toLowerCase();
const merged = new Map();
for (const source of sources) {
  for (const work of source.works) {
    const key = doiKey(work) || normalizedTitle(work.title);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...work, metadataProviders:[work.metadataProvider] });
      continue;
    }
    existing.metadataProviders = [...new Set([...existing.metadataProviders, work.metadataProvider])];
    existing.concepts = [...new Set([...existing.concepts, ...work.concepts])];
    if ((work.abstract || '').length > (existing.abstract || '').length) existing.abstract = work.abstract;
    if (work.pdfUrl && !existing.pdfUrl) existing.pdfUrl = work.pdfUrl;
    existing.isOpenAccess ||= work.isOpenAccess;
    existing.citedByCount = Math.max(existing.citedByCount, work.citedByCount);
    existing.referenceCount = Math.max(existing.referenceCount, work.referenceCount);
    if (work.sourceType === 'arXiv') existing.sourceType = 'arXiv';
  }
}
const output = {
  schemaVersion:1,
  providers:sources.map(source => source.provider),
  query:sources.map(source => `${source.provider}:${source.query}`).join(' + '),
  queries:Object.fromEntries(sources.map(source => [source.provider, source.query])),
  mergedAt:new Date().toISOString(),
  works:[...merged.values()]
};
await fs.writeFile(path.join(root, 'data', 'works.json'), JSON.stringify(output, null, 2), 'utf8');
console.log(`已合併 ${sources.length} 個來源：${sources.reduce((n,s)=>n+s.works.length,0)} 筆 → ${output.works.length} 篇去重文獻`);
