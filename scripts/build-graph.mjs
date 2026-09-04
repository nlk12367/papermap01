import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const input = JSON.parse(await fs.readFile(path.join(root, 'data', 'works.json'), 'utf8'));
const works = input.works;

const stop = new Set('the a an and or of for to in on with from by using based study analysis approach method'.split(' '));
const tokens = text => (text || '').toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)?.filter(x => !stop.has(x)) || [];
const sets = works.map(w => new Set(tokens(`${w.title} ${w.abstract}`)));
const topicSets = works.map(w => new Set(w.concepts.map(x => x.toLowerCase())));
const documentFrequency = new Map();
sets.forEach(set => set.forEach(term => documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1)));

function jaccard(a, b) {
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

function tfidfCosine(a, b) {
  let dot = 0, aa = 0, bb = 0;
  const union = new Set([...a, ...b]);
  for (const term of union) {
    const idf = Math.log((works.length + 1) / ((documentFrequency.get(term) || 0) + 1)) + 1;
    const av = a.has(term) ? idf : 0;
    const bv = b.has(term) ? idf : 0;
    dot += av * bv; aa += av * av; bb += bv * bv;
  }
  return dot / Math.max(1e-9, Math.sqrt(aa * bb));
}

const known = new Map(works.map((work, index) => [work.id, index]));
const edgeMap = new Map();
function addEdge(source, target, type, weight, sharedTopics = []) {
  if (source === target) return;
  const [a, b] = type === 'citation' ? [source, target] : (source < target ? [source, target] : [target, source]);
  const key = `${a}|${b}|${type}`;
  edgeMap.set(key, { source: a, target: b, type, weight: Number(weight.toFixed(3)), sharedTopics });
}

for (const work of works) {
  for (const ref of work.referencedWorks) if (known.has(ref)) addEdge(work.id, ref, 'citation', 1);
}
for (let i = 0; i < works.length; i++) {
  const candidates = [];
  for (let j = i + 1; j < works.length; j++) {
    const shared = [...topicSets[i]].filter(x => topicSets[j].has(x));
    const topicScore = jaccard(topicSets[i], topicSets[j]);
    if (topicScore >= 0.16 && shared.length) addEdge(works[i].id, works[j].id, 'shared-topic', topicScore, shared.slice(0, 5));
    const similarity = tfidfCosine(sets[i], sets[j]);
    if (similarity >= 0.22) candidates.push({ j, similarity });
  }
  candidates.sort((a, b) => b.similarity - a.similarity).slice(0, 4)
    .forEach(({ j, similarity }) => addEdge(works[i].id, works[j].id, 'similarity', similarity));
}

const nodes = works.map((work, index) => ({
  ...work,
  x: Number((Math.cos(index * 2.39996) * (130 + 36 * Math.sqrt(index + 1))).toFixed(2)),
  y: Number((Math.sin(index * 2.39996) * (130 + 36 * Math.sqrt(index + 1))).toFixed(2))
}));
const graph = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  query: input.query,
  relationshipPolicy: { sharedTopicThreshold: 0.16, tfidfThreshold: 0.22, maxSimilarityEdgesPerNode: 4 },
  nodes,
  edges: [...edgeMap.values()]
};
await fs.writeFile(path.join(root, 'data', 'graph.json'), JSON.stringify(graph, null, 2), 'utf8');
console.log(`已建立 ${nodes.length} 個節點、${graph.edges.length} 條關係邊`);
