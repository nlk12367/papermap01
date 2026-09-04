import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const args = Object.fromEntries(process.argv.slice(2).reduce((rows, value, index, all) => {
  if (value.startsWith('--')) rows.push([value.slice(2), all[index + 1]]);
  return rows;
}, []));
const query = args.query || 'color vision augmented reality';
const count = Math.max(5, Math.min(Number(args.count || 25), 100));
const root = path.resolve(import.meta.dirname, '..');
const searchQuery = query.trim().split(/\s+/).map(term => `all:${term.replace(/[^\p{L}\p{N}-]/gu, '')}`).filter(term => term !== 'all:').join(' AND ');
const endpoint = new URL('https://export.arxiv.org/api/query');
endpoint.searchParams.set('search_query', searchQuery);
endpoint.searchParams.set('start', '0');
endpoint.searchParams.set('max_results', String(count));
endpoint.searchParams.set('sortBy', 'relevance');
endpoint.searchParams.set('sortOrder', 'descending');

const decode = value => value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const text = (entry, tag) => decode((entry.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i')) || [,''])[1].replace(/\s+/g, ' ').trim());
const attrs = (entry, pattern) => [...entry.matchAll(pattern)].map(match => decode(match[1]));

const response = await fetch(endpoint, { headers: { 'User-Agent': 'OpenLiteratureMap/0.2 (local research tool; contact: open-literature-map@example.invalid)' } });
if (!response.ok) throw new Error(`arXiv 回應 ${response.status}: ${await response.text()}`);
const xml = await response.text();
const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map(match => match[1]);
const works = entries.map(entry => {
  const id = text(entry, 'id');
  const published = text(entry, 'published');
  const pdf = (entry.match(/<link[^>]+href="([^"]+)"[^>]+type="application\/pdf"/i) || [,''])[1] || id.replace('/abs/', '/pdf/');
  const doi = text(entry, 'arxiv:doi');
  return {
    id,
    title: text(entry, 'title'),
    authors: attrs(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi).map(name => name.replace(/\s+/g, ' ').trim()),
    year: published ? Number(published.slice(0,4)) : null,
    abstract: text(entry, 'summary'),
    concepts: attrs(entry, /<category[^>]+term="([^"]+)"/gi),
    citedByCount: 0,
    citedByApiUrl: '',
    referenceCount: 0,
    referencedWorks: [],
    metadataProvider: 'arXiv',
    sourceType: 'arXiv',
    venue: 'arXiv',
    isOpenAccess: true,
    pdfUrl: pdf,
    landingUrl: doi ? `https://doi.org/${doi}` : id,
    role: 'result'
  };
});
const output = { schemaVersion:1, provider:'arXiv', query, fetchedAt:new Date().toISOString(), works };
await fs.writeFile(path.join(root, 'data', 'arxiv.json'), JSON.stringify(output, null, 2), 'utf8');
console.log(`已快取 ${works.length} 篇 arXiv 文獻至 data/arxiv.json`);
