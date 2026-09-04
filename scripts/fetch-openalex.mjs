import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1]]);
  return rows;
}, []));
const query = args.query || 'color vision deficiency augmented reality';
const count = Math.max(5, Math.min(Number(args.count || 40), 100));
const root = path.resolve(import.meta.dirname, '..');

function abstractFromIndex(index) {
  if (!index) return '';
  const words = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) words[position] = word;
  }
  return words.filter(Boolean).join(' ');
}

function sourceName(work) {
  return work.primary_location?.source?.display_name || 'OpenAlex';
}

const endpoint = new URL('https://api.openalex.org/works');
endpoint.searchParams.set('search', query);
endpoint.searchParams.set('per-page', String(count));
endpoint.searchParams.set('select', [
  'id','doi','display_name','publication_year','authorships','abstract_inverted_index',
  'cited_by_count','cited_by_api_url','referenced_works','concepts','keywords','primary_location','open_access'
].join(','));
endpoint.searchParams.set('mailto', 'open-literature-map@example.invalid');

const response = await fetch(endpoint, { headers: { 'User-Agent': 'OpenLiteratureMap/0.1 (local research tool)' } });
if (!response.ok) throw new Error(`OpenAlex 回應 ${response.status}: ${await response.text()}`);
const payload = await response.json();
const works = payload.results.map((work, index) => ({
  id: work.id,
  title: work.display_name || '未提供題名',
  authors: (work.authorships || []).map(item => item.author?.display_name).filter(Boolean),
  year: work.publication_year,
  abstract: abstractFromIndex(work.abstract_inverted_index),
  concepts: [...new Set([...(work.concepts || []).map(x => x.display_name), ...(work.keywords || []).map(x => x.display_name)].filter(Boolean))],
  citedByCount: work.cited_by_count || 0,
  citedByApiUrl: work.cited_by_api_url || `https://api.openalex.org/works?filter=cites:${work.id.split('/').pop()}`,
  referenceCount: (work.referenced_works || []).length,
  referencedWorks: work.referenced_works || [],
  metadataProvider: 'OpenAlex',
  sourceType: /arxiv/i.test(`${sourceName(work)} ${work.primary_location?.pdf_url || ''}`) ? 'arXiv' : 'OpenAlex',
  venue: sourceName(work),
  isOpenAccess: Boolean(work.open_access?.is_oa),
  pdfUrl: work.primary_location?.pdf_url || '',
  landingUrl: work.doi || work.primary_location?.landing_page_url || work.id,
  role: index < 3 ? 'search-input' : 'result'
}));

const output = {
  schemaVersion: 1,
  provider: 'OpenAlex',
  query,
  fetchedAt: new Date().toISOString(),
  works
};
await fs.writeFile(path.join(root, 'data', 'openalex.json'), JSON.stringify(output, null, 2), 'utf8');
console.log(`已快取 ${works.length} 篇 OpenAlex 文獻至 data/openalex.json`);
