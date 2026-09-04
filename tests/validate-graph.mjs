import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const graph = JSON.parse(await fs.readFile(path.join(root, 'data', 'graph.json'), 'utf8'));
assert.ok(graph.nodes.length >= 5, '至少需要五個節點');
assert.ok(graph.edges.length > 0, '至少需要一條關係邊');
const ids = new Set(graph.nodes.map(n => n.id));
assert.equal(ids.size, graph.nodes.length, '節點 ID 必須唯一');
for (const node of graph.nodes) {
  for (const key of ['title','authors','year','abstract','concepts','citedByCount','citedByApiUrl','referenceCount','sourceType','isOpenAccess','role']) assert.ok(key in node, `節點缺少 ${key}`);
}
for (const edge of graph.edges) {
  assert.ok(ids.has(edge.source) && ids.has(edge.target), '邊端點必須存在');
  assert.ok(['citation','shared-topic','similarity'].includes(edge.type), '未知關係類型');
  assert.ok(edge.weight > 0 && edge.weight <= 1, '權重必須介於 0 與 1');
}
console.log(`驗證通過：${graph.nodes.length} 節點、${graph.edges.length} 邊，資料結構與端點完整`);
