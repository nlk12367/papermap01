import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const baseUrl = process.env.MAP_URL || 'http://127.0.0.1:8770';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(root, 'backups');

async function readCurrent(relativePath) {
  const response = await fetch(`${baseUrl}/${relativePath}`, { method: 'GET', cache: 'no-store' });
  if (!response.ok) throw new Error(`${relativePath} HTTP ${response.status}`);
  return response.json();
}

async function readOptional(relativePath) {
  try { return await readCurrent(relativePath); } catch { return null; }
}

await fs.mkdir(backupDir, { recursive: true });
const [graph, works, state] = await Promise.all([
  readCurrent('data/graph.json'),
  readCurrent('data/works.json'),
  readOptional('data/session-state.json')
]);
const backup = {
  schemaVersion: 1,
  savedAt: new Date().toISOString(),
  source: baseUrl,
  graph,
  works,
  sessionState: state
};
const target = path.join(backupDir, `literature-map-backup-${stamp}.json`);
await fs.writeFile(target, JSON.stringify(backup, null, 2), 'utf8');
console.log(`備份完成：${target}`);
console.log(`論文 ${works.works?.length ?? 0} 篇、節點 ${graph.nodes?.length ?? 0} 個、連線 ${graph.edges?.length ?? 0} 條`);
console.log(`來源頁面未被修改：${baseUrl}`);
