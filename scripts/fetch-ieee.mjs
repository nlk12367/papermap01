import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1]]);
  return rows;
}, []));
const query = args.query || 'color vision deficiency augmented reality';
const count = Math.max(5, Math.min(Number(args.count || 40), 200));
const apiKey = process.env.IEEE_XPLORE_API_KEY;
if (!apiKey) throw new Error('缺少 IEEE_XPLORE_API_KEY。請先向 IEEE Xplore API Portal 申請並設為環境變數。');

const endpoint = new URL('https://ieeexploreapi.ieee.org/api/v1/search/articles');
endpoint.searchParams.set('apikey', apiKey);
endpoint.searchParams.set('format', 'json');
endpoint.searchParams.set('max_records', String(count));
endpoint.searchParams.set('start_record', '1');
endpoint.searchParams.set('sort_order', 'desc');
endpoint.searchParams.set('sort_field', 'article_title');
endpoint.searchParams.set('querytext', query);

const response = await fetch(endpoint, { headers:{ 'User-Agent':'OpenLiteratureMap/0.1 (local research tool)' } });
if (!response.ok) throw new Error(`IEEE Xplore 回應 ${response.status}: ${await response.text()}`);
const payload = await response.json();
const termValues = value => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(termValues);
  if (typeof value === 'string') return [value];
  return termValues(value.terms || value.term || []);
};
const works = (payload.articles || []).map((article, index) => {
  const articleNumber = String(article.article_number || '');
  const landingUrl = article.abstract_url || (articleNumber ? `https://ieeexplore.ieee.org/document/${articleNumber}` : article.doi ? `https://doi.org/${article.doi}` : 'https://ieeexplore.ieee.org');
  return {
    id: articleNumber ? `ieee:${articleNumber}` : `ieee:${article.doi || index}`,
    title: article.title || '未提供題名',
    authors: (article.authors?.authors || []).map(author => author.full_name).filter(Boolean),
    year: Number(article.publication_year) || null,
    abstract: article.abstract || '',
    concepts: [...new Set([...termValues(article.author_terms), ...termValues(article.ieee_terms), ...termValues(article.index_terms)].filter(Boolean))],
    citedByCount: Number(article.citing_paper_count) || 0,
    citedByApiUrl: '',
    referenceCount: 0,
    referencedWorks: [],
    metadataProvider: 'IEEE Xplore',
    sourceType: 'IEEE Xplore',
    venue: article.publication_title || article.publisher || 'IEEE Xplore',
    isOpenAccess: ['open access','ephemera'].includes(String(article.access_type || article.accessType || '').toLowerCase()),
    pdfUrl: article.pdf_url || '',
    landingUrl,
    role: index < 3 ? 'search-input' : 'result'
  };
});
const output = { schemaVersion:1, provider:'IEEE Xplore', query, fetchedAt:new Date().toISOString(), totalFound:Number(payload.total_records || payload.totalfound || works.length), works };
await fs.writeFile(path.resolve(import.meta.dirname, '..', 'data', 'ieee.json'), JSON.stringify(output, null, 2), 'utf8');
console.log(`已快取 ${works.length} 篇 IEEE Xplore 文獻至 data/ieee.json`);
