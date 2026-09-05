const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const hash = value => [...String(value)].reduce((sum, char) => ((sum * 33) ^ char.charCodeAt(0)) >>> 0, 5381);

function miniLayout(nodes, width = 420, height = 190) {
  const centreX = width / 2, centreY = height / 2, radius = Math.min(width, height) * .34;
  return new Map([...nodes].sort((a, b) => String(a.id).localeCompare(String(b.id))).map((node, index, list) => {
    const angle = (Math.PI * 2 * index / Math.max(1, list.length)) + (hash(node.id) % 100) / 1000;
    const distance = radius * (.55 + (hash(`${node.id}:distance`) % 38) / 100);
    return [node.id, { x: centreX + Math.cos(angle) * distance, y: centreY + Math.sin(angle) * distance }];
  }));
}

/** ClusterCard props: { cluster, edges, onNodeClick(node), onNodeFocus(node), onClusterOpen(cluster) } */
export function ClusterCard({ cluster, edges, onNodeClick, onNodeFocus, onClusterOpen }) {
  const card = document.createElement('article');
  card.className = 'cluster-card';
  const positions = miniLayout(cluster.nodes);
  const ids = new Set(cluster.nodes.map(node => node.id));
  // 保留分類是多個無法命名子群的彙整，省略其內部連線以免把不相關群集畫成一團。
  const internalEdges = cluster.isFallback ? [] : edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
  card.innerHTML = `
    <header class="cluster-card-heading">
      <button type="button" class="cluster-badge cluster-title-button" style="--cluster-color:var(${cluster.colorVar})" aria-label="開啟「${escapeHtml(cluster.label)}」的互動關係圖">${escapeHtml(cluster.label)}</button>
      <strong>${cluster.nodes.length} 篇</strong>
    </header>
    ${cluster.parentSource ? `<p class="cluster-origin">${escapeHtml(cluster.parentSource)}</p>` : ''}
    ${cluster.summary ? `<p class="cluster-summary">${escapeHtml(cluster.summary)}</p>` : ''}
    <svg class="cluster-mini-map" viewBox="0 0 420 190" role="img" aria-label="${escapeHtml(cluster.label)}，${cluster.nodes.length} 篇文獻的關係圖"></svg>`;
  const svg = card.querySelector('svg');
  card.querySelector('.cluster-title-button').addEventListener('click', () => onClusterOpen?.(cluster));
  for (const edge of internalEdges) {
    const source = positions.get(edge.source), target = positions.get(edge.target);
    if (!source || !target) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', source.x); line.setAttribute('y1', source.y); line.setAttribute('x2', target.x); line.setAttribute('y2', target.y);
    line.setAttribute('class', `mini-edge mini-edge-${edge.type || 'similarity'}`); svg.append(line);
  }
  for (const node of cluster.nodes) {
    const point = positions.get(node.id), button = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    button.setAttribute('cx', point.x); button.setAttribute('cy', point.y); button.setAttribute('r', String(5 + Math.min(5, Math.log10(Number(node.citedByCount || 0) + 1) * 2)));
    button.setAttribute('class', 'mini-node'); button.style.setProperty('--cluster-color', `var(${cluster.colorVar})`);
    button.setAttribute('tabindex', '0'); button.setAttribute('role', 'button'); button.setAttribute('aria-label', node.title || '文獻節點');
    const select = () => onNodeClick?.(node);
    button.addEventListener('click', select); button.addEventListener('focus', () => onNodeFocus?.(node));
    button.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
    svg.append(button);
  }
  return card;
}

/** ClusterGrid props: { clusters, edges, onNodeClick, onNodeFocus, onClusterOpen } */
export function ClusterGrid({ clusters, edges, onNodeClick, onNodeFocus, onClusterOpen }) {
  const grid = document.createElement('section');
  grid.className = 'cluster-grid';
  grid.setAttribute('aria-label', '依主題分群的文獻小圖');
  for (const cluster of clusters) grid.append(ClusterCard({ cluster, edges, onNodeClick, onNodeFocus, onClusterOpen }));
  return grid;
}

/** CrossClusterList props: { relations, onNodeClick } */
export function CrossClusterList({ relations, onNodeClick }) {
  const section = document.createElement('section');
  section.className = 'cross-cluster-card';
  section.innerHTML = `<header><div><p class="eyebrow">CROSS-CLUSTER LINKS</p><h2>跨類別關聯 · ${relations.length} 組</h2></div><p>僅列出不同集群之間的關係；點選文獻可查看詳情。</p></header>`;
  const list = document.createElement('ol'); list.className = 'cross-cluster-list';
  for (const relation of relations) {
    const item = document.createElement('li');
    item.innerHTML = `<span class="cluster-badge" style="--cluster-color:var(${relation.sourceCluster.colorVar})">${escapeHtml(relation.sourceCluster.label)}</span><button type="button">${escapeHtml(relation.source.title)}</button><span class="cross-arrow" aria-hidden="true">→</span><span class="cluster-badge" style="--cluster-color:var(${relation.targetCluster.colorVar})">${escapeHtml(relation.targetCluster.label)}</span><button type="button">${escapeHtml(relation.target.title)}</button>`;
    const [sourceButton, targetButton] = item.querySelectorAll('button');
    sourceButton.addEventListener('click', () => onNodeClick?.(relation.source));
    targetButton.addEventListener('click', () => onNodeClick?.(relation.target));
    list.append(item);
  }
  if (!relations.length) list.innerHTML = '<li class="empty-state">目前篩選條件下沒有跨類別關聯。</li>';
  section.append(list);
  return section;
}

export function renderClusterView(container, { clusters, edges, onNodeClick, onNodeFocus, onClusterOpen }) {
  const clusterById = new Map(clusters.flatMap(cluster => cluster.nodes.map(node => [node.id, cluster])));
  const relations = edges.filter(edge => clusterById.has(edge.source) && clusterById.has(edge.target) && clusterById.get(edge.source) !== clusterById.get(edge.target)).map(edge => ({ ...edge, source: clusterById.get(edge.source).nodes.find(node => node.id === edge.source), target: clusterById.get(edge.target).nodes.find(node => node.id === edge.target), sourceCluster: clusterById.get(edge.source), targetCluster: clusterById.get(edge.target) }));
  container.replaceChildren(ClusterGrid({ clusters, edges, onNodeClick, onNodeFocus, onClusterOpen }), CrossClusterList({ relations, onNodeClick }));
}
