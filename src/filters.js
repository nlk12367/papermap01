export function matchesNode(node, filters) {
  const haystack = `${node.title} ${node.abstract} ${node.concepts.join(' ')}`.toLowerCase();
  const keyword = filters.keyword.trim().toLowerCase();
  if (keyword && !haystack.includes(keyword)) return false;
  if (filters.topics.size && !node.concepts.some(topic => filters.topics.has(topic.toLowerCase()))) return false;
  if (filters.yearMin !== null && (node.year || 0) < filters.yearMin) return false;
  if (filters.yearMax !== null && (node.year || 0) > filters.yearMax) return false;
  if (filters.sources !== null && !filters.sources.has(node.sourceType)) return false;
  if (filters.citeMin !== null && node.citedByCount < filters.citeMin) return false;
  if (filters.citeMax !== null && node.citedByCount > filters.citeMax) return false;
  if (filters.oa === 'yes' && !node.isOpenAccess) return false;
  if (filters.oa === 'no' && node.isOpenAccess) return false;
  return true;
}

export function nodesForView(nodes, edges, view, selectedId) {
  if (view === 'all') return nodes;
  if (view === 'search-input') return nodes.filter(node => node.role === 'search-input');
  if (view === 'result') return nodes.filter(node => node.role === 'result');
  if (view === 'references') {
    if (!selectedId) return [];
    const referenced = new Set(edges.filter(edge => edge.type === 'citation' && edge.source === selectedId).map(edge => edge.target));
    referenced.add(selectedId);
    return nodes.filter(node => referenced.has(node.id));
  }
  return nodes;
}
