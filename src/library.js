export const LIBRARY_KEY = 'open-literature-map.library.v1';

export function readLibrary(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(LIBRARY_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function writeLibrary(storage, ids) {
  try {
    storage.setItem(LIBRARY_KEY, JSON.stringify([...ids]));
    return true;
  } catch {
    return false;
  }
}

export function toggleLibrary(ids, id) {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function seedNetwork(nodes, edges, seedId) {
  if (!seedId) return [];
  const related = new Set([seedId]);
  for (const edge of edges) {
    if (edge.source === seedId) related.add(edge.target);
    if (edge.target === seedId) related.add(edge.source);
  }
  return nodes.filter(node => related.has(node.id));
}
