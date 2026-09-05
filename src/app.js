import { matchesNode, nodesForView } from './filters.js';
import { readLibrary, writeLibrary, toggleLibrary, seedNetwork } from './library.js';
import { getLocalPdf } from './local-files.js';
import { savePaperAnnotation, restorePaperAnnotations } from './paper-annotations.js';
import { renderClusterView } from './cluster-view.js';
import * as pdfjs from '../vendor/pdfjs/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '../vendor/pdfjs/pdf.worker.mjs';

const canvas = document.getElementById('map-canvas');
const wrap = document.getElementById('canvas-wrap');
const detail = document.getElementById('detail-panel');
const tooltip = document.getElementById('tooltip');
const meta = document.getElementById('dataset-meta');
const resetButton = document.getElementById('reset-view');
const filterCount = document.getElementById('filter-count');
const keywordFilter = document.getElementById('keyword-filter');
const yearMin = document.getElementById('year-min');
const yearMax = document.getElementById('year-max');
const citeMin = document.getElementById('cite-min');
const citeMax = document.getElementById('cite-max');
const oaFilter = document.getElementById('oa-filter');
const topicOptions = document.getElementById('topic-options');
const sourceOptions = document.getElementById('source-options');
const xMetric = document.getElementById('x-metric');
const yMetric = document.getElementById('y-metric');
const sizeMetric = document.getElementById('size-metric');
const toggleClustersButton = document.getElementById('toggle-clusters');
const clusterProgressDialog = document.getElementById('cluster-progress-dialog');
const clusterProgressSummary = document.getElementById('cluster-progress-summary');
const clusterProgressBar = document.getElementById('cluster-progress-bar');
const clusterProgressDetail = document.getElementById('cluster-progress-detail');
const clusterViewContainer = document.getElementById('cluster-view');
const clusterDetailNav = document.getElementById('cluster-detail-nav');
const clusterDetailTitle = document.getElementById('cluster-detail-title');
const returnClusterOverviewButton = document.getElementById('return-cluster-overview');
const returnMapOverviewButton = document.getElementById('return-map-overview');
const mapSection = document.getElementById('map-section');
const searchSection = document.getElementById('search-section');
const mapLayout = document.querySelector('.map-layout');
const leftResizer = document.getElementById('left-resizer');
const rightResizer = document.getElementById('right-resizer');
const librarySection = document.getElementById('library-section');
const libraryList = document.getElementById('library-list');
const libraryCount = document.getElementById('library-count');
const librarySummary = document.getElementById('library-summary');
const seedNetworkView = document.getElementById('seed-network-view');
const backupSelect = document.getElementById('backup-select');
const restoreBackupButton = document.getElementById('restore-backup');
const statsMode = document.getElementById('stats-mode');
const returnLiveButton = document.getElementById('return-live');
const tagDialog = document.getElementById('tag-dialog');
const tagForm = document.getElementById('tag-form');
const tagPaperTitle = document.getElementById('tag-paper-title');
const tagOptions = document.getElementById('tag-options');
const tagOptionsLegend = document.getElementById('tag-options-legend');
const tagColors = document.getElementById('tag-colors');
const tagColorsField = document.getElementById('tag-colors-field');
const tagSave = document.getElementById('tag-save');
const newTagLabel = document.getElementById('new-tag-label');
const newTag = document.getElementById('new-tag');
const TAG_KEY = 'open-literature-map.system-tags.v1';
const TAG_COLORS = [
  { key: 'default', name: '來源色' },
  { key: 'blue', name: '藍色' },
  { key: 'teal', name: '青綠色' },
  { key: 'green', name: '綠色' },
  { key: 'amber', name: '琥珀色' },
  { key: 'red', name: '紅色' },
  { key: 'violet', name: '紫色' },
  { key: 'pink', name: '粉紅色' }
];
function renderTagColors(selected = 'default') {
  if (!tagColors) return;
  tagColors.innerHTML = TAG_COLORS.map(color => `<label class="tag-color-option ${color.key}" title="${color.name}"><input type="radio" name="paper-marker-color" value="${color.key}" ${selected === color.key ? 'checked' : ''}><span style="--tag-color:var(--tag-${color.key})"></span><span class="sr-only">${color.name}</span></label>`).join('');
}
const readTags = () => { try { const value = JSON.parse(localStorage.getItem(TAG_KEY) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; } catch { return []; } };
const writeTags = tags => localStorage.setItem(TAG_KEY, JSON.stringify([...new Set(tags)].sort()));
let tagTarget = null;
let tagMode = 'add';
function renderTagOptions(tags, selected, inputType) { tagOptions.innerHTML = tags.length ? tags.map(tag => `<label><input type="${inputType}" name="${inputType === 'radio' ? 'map-tag' : 'library-tags'}" value="${escapeHtml(tag)}" ${selected.has(tag) ? 'checked' : ''}>${escapeHtml(tag)}</label>`).join('') : '<span class="empty-state">尚未建立系統標籤</span>'; }
function openMapTagEditor(node, mode = 'add') { tagTarget = node; tagMode = mode; tagDialog.dataset.owner = 'map'; tagPaperTitle.textContent = node.title; const selected = new Set([node.mapTag || node.tags?.[0]].filter(Boolean)); renderTagOptions(readTags(), selected, 'radio'); tagOptionsLegend.textContent = '地圖標籤（擇一）'; tagColorsField.hidden = false; newTagLabel.firstChild.textContent = '新增地圖標籤'; renderTagColors(node.projectId === currentProjectId ? (node.markerColor || 'default') : 'default'); if (tagSave) tagSave.textContent = mode === 'edit' ? '儲存地圖標記' : '加入文獻庫並儲存地圖標記'; newTag.value = ''; tagDialog.showModal(); }
function openLibraryTagEditor(node) { tagTarget = node; tagMode = 'library'; tagDialog.dataset.owner = 'library'; tagPaperTitle.textContent = node.title; renderTagOptions(readTags(), new Set(node.libraryTags || []), 'checkbox'); tagOptionsLegend.textContent = '文獻庫標籤（可複選）'; tagColorsField.hidden = true; newTagLabel.firstChild.textContent = '新增文獻庫標籤'; if (tagSave) tagSave.textContent = '儲存文獻庫標籤'; newTag.value = ''; tagDialog.showModal(); }
tagForm?.addEventListener('submit', async event => { event.preventDefault(); if (!tagTarget) return; const added = newTag.value.trim() ? [newTag.value.trim().slice(0, 40)] : [], selected = [...tagOptions.querySelectorAll('input:checked')].map(input => input.value); writeTags([...readTags(), ...added]); if (tagDialog.dataset.owner === 'map') { const mapTag = added[0] || selected[0] || ''; tagTarget.mapTag = mapTag; tagTarget.tags = mapTag ? [mapTag] : []; tagTarget.markerColor = tagColors?.querySelector('input:checked')?.value || 'default'; tagTarget.markerProjectId = currentProjectId; tagTarget.projectId = currentProjectId; if (tagMode === 'add') persistLibrary(new Set([...libraryIds, tagTarget.id])); scheduleMapStateSave(); } else if (tagDialog.dataset.owner === 'library') { tagTarget.libraryTags = [...new Set([...selected, ...added])]; tagTarget.projectId = currentProjectId; } else return; savePaperAnnotation(currentProjectId, tagTarget); tagDialog.close(); renderLibrary(); showDetail(tagTarget); if (tagDialog.dataset.owner === 'map') try { await fetch('/api/autosave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ works: [tagTarget], projectId: currentProjectId }) }); } catch {} });
document.getElementById('tag-cancel')?.addEventListener('click', () => tagDialog.close());
const ctx = canvas.getContext('2d');

  const response = await fetch('data/graph.json');
if (!response.ok) throw new Error(`無法讀取圖資料：${response.status}`);
const graph = await response.json();
const storedProjectId = localStorage.getItem('open-literature-map.current-project.v1');
const currentProjectId = graph.projectId && graph.projectId !== 'default' ? graph.projectId : (storedProjectId || graph.projectId || 'default');
restorePaperAnnotations(currentProjectId, graph.nodes);
const byId = new Map(graph.nodes.map(node => [node.id, node]));
try {
  const stateResponse = await fetch('data/session-state.json', { cache: 'no-store' });
  if (stateResponse.ok) {
    const savedState = await stateResponse.json();
    for (const node of graph.nodes) {
      const saved = savedState.positions?.[node.id];
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) { node.x = saved.x; node.y = saved.y; }
    }
  }
} catch { /* 尚未有背景保存檔時使用圖譜原始佈局 */ }
let stateSaveTimer = 0;
function scheduleMapStateSave() {
  clearTimeout(stateSaveTimer);
  stateSaveTimer = setTimeout(async () => {
    const positions = Object.fromEntries(graph.nodes.map(node => [node.id, { x: node.x, y: node.y }]));
    try {
      await fetch('/api/save-state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nodes: graph.nodes, positions }) });
    } catch { /* 背景保存失敗不影響目前圖譜操作 */ }
  }, 800);
}
for (const node of graph.nodes) {
  node.initialX = node.x;
  node.initialY = node.y;
  node.topicOverlap = graph.edges.filter(edge => edge.type === 'shared-topic' && (edge.source === node.id || edge.target === node.id)).reduce((sum, edge) => sum + edge.weight, 0);
}

let dpr = 1;
let scale = 1;
let offsetX = 0;
let offsetY = 0;
let selected = null;
const localLookupRequests = new Map();
const localPdfWindows = new Map();
const removedNodeIds = new Set();
let hovered = null;
let dragging = false;
let draggingNode = null;
let moved = false;
let start = null;
let viewMode = 'all';
let visibleNodes = [];
let visibleEdges = [];
let visibleIds = new Set();
let clustersEnabled = false;
let canvasMode = 'overview';
let selectedClusterId = null;
let selectedClusterNodeIds = null;
let visibleClusters = [];
let clusterByNodeId = new Map();
let libraryIds = readLibrary(localStorage);
let activeSeedId = null;
let statsViewMode = 'live';
let previewingBackupId = null;
function graphStats(value) { const edges = value.edges || []; return { literatureCount: (value.nodes || []).length, relationCount: edges.length, citationCount: edges.filter(edge => edge.type === 'citation').length }; }
function setStats(stats, mode = 'live', backupLabel = '') { statsViewMode = mode; previewingBackupId = mode === 'backupPreview' ? backupLabel : null; meta.textContent = `${stats.literatureCount} 篇文獻 · ${stats.relationCount} 條關係 · 引用 ${stats.citationCount}`; statsMode.textContent = mode === 'backupPreview' ? `正在檢視備份：${backupLabel}` : '即時檢視'; statsMode.classList.toggle('is-backup', mode === 'backupPreview'); returnLiveButton.hidden = mode !== 'backupPreview'; }
setStats(graphStats(graph));
async function refreshLiveStats() { if (statsViewMode !== 'live') return; try { const response = await fetch(`data/graph.json?stats=${Date.now()}`, { cache: 'no-store' }); if (response.ok) setStats(graphStats(await response.json())); } catch {} }
setInterval(refreshLiveStats, 5000);
const filters = { keyword:'', topics:new Set(), yearMin:null, yearMax:null, sources:null, citeMin:null, citeMax:null, oa:'all' };

const columnSizes = JSON.parse(localStorage.getItem('literature-map-column-sizes') || '{}');
let filterWidth = Number(columnSizes.filter) || 240;
let detailWidth = Number(columnSizes.detail) || 340;
function applyColumnSizes() {
  mapLayout.style.setProperty('--filter-width', `${filterWidth}px`);
  mapLayout.style.setProperty('--detail-width', `${detailWidth}px`);
}
function persistColumnSizes() {
  localStorage.setItem('literature-map-column-sizes', JSON.stringify({ filter: filterWidth, detail: detailWidth }));
}
function setupColumnResizer(handle, side) {
  handle.addEventListener('pointerdown', event => {
    const startX = event.clientX;
    const startWidth = side === 'left' ? filterWidth : detailWidth;
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-resizing');
    document.body.classList.add('is-resizing-columns');
    const move = next => {
      const delta = next.clientX - startX;
      if (side === 'left') filterWidth = Math.max(190, Math.min(460, startWidth + delta));
      else detailWidth = Math.max(280, Math.min(720, startWidth - delta));
      applyColumnSizes();
    };
    const stop = () => {
      handle.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing-columns');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      persistColumnSizes();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
  handle.addEventListener('dblclick', () => {
    if (side === 'left') filterWidth = 240; else detailWidth = 340;
    applyColumnSizes(); persistColumnSizes();
  });
}
applyColumnSizes();
setupColumnResizer(leftResizer, 'left');
setupColumnResizer(rightResizer, 'right');

const color = name => {
  const probe = document.createElement('span');
  probe.style.color = `var(${name})`;
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return resolved;
};
const palette = () => ({
  bg: color('--surface'), text: color('--text'), muted: color('--muted'),
  seed: color('--seed'), local: color('--local'), result: color('--result'), citation: color('--citation'),
  topic: color('--topic'), similarity: color('--similarity'), marker: Object.fromEntries(TAG_COLORS.filter(item => item.key !== 'default').map(item => [item.key, color(`--tag-${item.key}`)]))
});

function fit() {
  if (!visibleNodes.length) { draw(); return; }
  const xs = visibleNodes.map(n => displayX(n));
  const ys = visibleNodes.map(n => displayY(n));
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  scale = Math.min((wrap.clientWidth - 100) / Math.max(spanX,1), (wrap.clientHeight - 100) / Math.max(spanY,1));
  offsetX = wrap.clientWidth / 2 - (Math.min(...xs) + Math.max(...xs)) * scale / 2;
  offsetY = wrap.clientHeight / 2 - (Math.min(...ys) + Math.max(...ys)) * scale / 2;
  draw();
}

function metricValue(node, metric, axis) {
  if (metric === 'layout') return axis === 'x' ? node.x : node.y;
  if (metric === 'sourceType') return [...new Set(graph.nodes.map(n => n.sourceType))].sort().indexOf(node.sourceType) * 180;
  return Number(node[metric] || 0) * (metric === 'year' ? 10 : metric === 'topicOverlap' ? 80 : 4);
}
const displayX = node => metricValue(node, xMetric.value, 'x');
const displayY = node => -metricValue(node, yMetric.value, 'y');
const sx = node => displayX(node) * scale + offsetX;
const sy = node => displayY(node) * scale + offsetY;
function radiusFor(node) {
  if (sizeMetric.value === 'fixed') return 7;
  return 5 + Math.min(12, Math.log10(Number(node[sizeMetric.value] || 0) + 1) * 3.2);
}

function rebuildClusters() {
  clusterByNodeId = new Map();
  if (canvasMode === 'overview' || visibleNodes.length < 2) { visibleClusters = []; return; }
  // 已儲存的分群採用 version: 2；未分群文獻不應使整個檢視退回到前端臨時計算。
  const savedClusters = visibleNodes.filter(node => node.cluster?.version === 2 && node.cluster.id !== 'unclustered');
  if (savedClusters.length) {
    const groups = new Map();
    for (const node of savedClusters) {
      if (node.cluster.id === 'unclustered') continue;
      const isFallback = node.cluster.label === '未形成明確研究主題' && node.cluster.reviewStatus === 'no_shared_topic';
      // fallback 是保留分類，不是實際研究主題；畫面只保留一張卡片，避免同名卡片重複出現。
      const groupId = isFallback ? 'unresolved' : node.cluster.id;
      if (!groups.has(groupId)) groups.set(groupId, isFallback
        ? { id: groupId, label: '未形成明確研究主題', summary: '以下文獻未形成足以獨立命名的共同研究方向。', parentSource: '', isFallback: true, nodes: [] }
        : { id: groupId, label: node.cluster.label, summary: node.cluster.summary, parentSource: node.cluster.parentSource, isFallback: false, nodes: [] });
      groups.get(groupId).nodes.push(node);
    }
    visibleClusters = [...groups.values()].filter(cluster => cluster.nodes.length >= 2).sort((a, b) => b.nodes.length - a.nodes.length || a.label.localeCompare(b.label)).map((cluster, index) => ({ ...cluster, colorVar: `--cluster-${index % 6 + 1}` }));
    for (const cluster of visibleClusters) for (const node of cluster.nodes) clusterByNodeId.set(node.id, cluster);
    return;
  }
  const ids = new Set(visibleNodes.map(node => node.id));
  const neighbors = new Map(visibleNodes.map(node => [node.id, new Map()]));
  for (const edge of visibleEdges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const eligible = edge.type === 'citation' || (edge.type === 'shared-topic' && edge.weight >= .4) || (edge.type === 'similarity' && edge.weight >= .35);
    if (!eligible) continue;
    const weight = Number(edge.weight || 0) * (edge.type === 'citation' ? 2 : edge.type === 'shared-topic' ? 1.2 : 1);
    neighbors.get(edge.source).set(edge.target, weight);
    neighbors.get(edge.target).set(edge.source, weight);
  }
  const labels = new Map(visibleNodes.map(node => [node.id, node.id]));
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const node of [...visibleNodes].sort((a, b) => a.id.localeCompare(b.id))) {
      const votes = new Map();
      for (const [neighbor, weight] of neighbors.get(node.id)) {
        const label = labels.get(neighbor);
        votes.set(label, (votes.get(label) || 0) + weight);
      }
      const winner = [...votes.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0];
      if (winner && winner !== labels.get(node.id)) { labels.set(node.id, winner); changed = true; }
    }
    if (!changed) break;
  }
  const groups = new Map();
  for (const node of visibleNodes) {
    const label = labels.get(node.id);
    if (!neighbors.get(node.id).size) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(node);
  }
  visibleClusters = [...groups.values()].filter(nodes => nodes.length >= 2).sort((a, b) => b.length - a.length || a[0].title.localeCompare(b[0].title)).map((nodes, index) => ({ label: `群集 ${String.fromCharCode(65 + index)}`, nodes, colorVar: `--cluster-${index % 6 + 1}` }));
  for (const cluster of visibleClusters) for (const node of cluster.nodes) clusterByNodeId.set(node.id, cluster);
}

function renderClusterSmallMultiples() {
  if (canvasMode !== 'clusterOverview') return;
  if (!visibleClusters.length) {
    clusterViewContainer.innerHTML = '<p class="empty-state">目前篩選條件下沒有至少兩篇文獻組成的集群。</p>';
    return;
  }
  renderClusterView(clusterViewContainer, {
    clusters: visibleClusters,
    edges: visibleEdges,
    onNodeClick: node => { selected = node; showDetail(node); },
    onNodeFocus: node => { selected = node; showDetail(node); },
    onClusterOpen: openClusterDetail
  });
}

function draw() {
  const p = palette();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  ctx.lineCap = 'round';
  for (const edge of visibleEdges) {
    const a = byId.get(edge.source), b = byId.get(edge.target);
    const active = selected && (edge.source === selected.id || edge.target === selected.id);
    ctx.beginPath(); ctx.moveTo(sx(a), sy(a)); ctx.lineTo(sx(b), sy(b));
    ctx.strokeStyle = p[edge.type === 'shared-topic' ? 'topic' : edge.type];
    ctx.globalAlpha = active ? .95 : .2 + edge.weight * .38;
    ctx.lineWidth = active ? 2.6 : .7 + edge.weight * 1.8;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const node of visibleNodes) {
    const radius = radiusFor(node);
    ctx.beginPath(); ctx.arc(sx(node), sy(node), radius, 0, Math.PI * 2);
    ctx.fillStyle = node.projectId === currentProjectId && node.markerProjectId === currentProjectId && node.markerColor && node.markerColor !== 'default' && p.marker[node.markerColor] ? p.marker[node.markerColor] : node.role === 'search-input' ? p.seed : node.origin === 'local' ? p.local : p.result;
    ctx.globalAlpha = node === selected || node === hovered ? 1 : .82;
    ctx.fill();
    if (node === selected || node === hovered) {
      ctx.strokeStyle = p.text; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = p.text; ctx.font = '12px system-ui'; ctx.textBaseline = 'middle';
  const labels = visibleNodes.filter(n => n.role === 'search-input' || n === selected || n === hovered);
  for (const node of labels) {
    const label = node.title.length > 52 ? `${node.title.slice(0, 49)}…` : node.title;
    ctx.fillText(label, sx(node) + 13, sy(node), 300);
  }
}

function resize() {
  const rect = wrap.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  fit();
}

function hit(x, y) {
  let result = null, distance = 20;
  for (const node of visibleNodes) {
    const next = Math.hypot(sx(node) - x, sy(node) - y);
    if (next < distance) { result = node; distance = next; }
  }
  return result;
}

const escapeHtml = value => {
  const element = document.createElement('div');
  element.textContent = String(value ?? '');
  return element.innerHTML;
};

function showDetail(node) {
  selected = node;
  if (!node) return;
  const related = visibleEdges.filter(edge => edge.source === node.id || edge.target === node.id);
  const shared = [...new Set(related.flatMap(edge => edge.sharedTopics || []))].slice(0, 8);
  const isLocal = node.origin === 'local';
  const titleLink = isLocal ? `<a class="title-link" href="#" data-open-local="${escapeHtml(node.id)}">${escapeHtml(node.title)}</a>` : `<a class="title-link" href="${escapeHtml(node.pdfUrl || node.landingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(node.title)}</a>`;
  const lookupNote = isLocal && node.metadataLookup?.status === 'found' ? `<p class="metadata-note">作者、年份、引用與參考文獻數已由 ${escapeHtml(node.metadataLookup.provider || '外部資料庫')} 補充${node.metadataLookup.titleSource === 'PDF 第一頁' ? '；題名已從 PDF 第一頁辨識。' : '。'}</p>` : isLocal && node.metadataLookup?.status === 'loading' ? `<p class="metadata-note">正在${looksLikeIdentifier(node.title) ? '讀取 PDF 第一頁並' : ''}查詢 OpenAlex 與 arXiv 書目資料…</p>` : isLocal && node.metadataLookup?.status === 'not-found' ? '<p class="metadata-note">找不到可信的書目比對結果，可重新查詢或確認 PDF 第一頁是否包含題名。</p>' : isLocal && node.metadataLookup?.status === 'error' ? `<p class="metadata-note">書目查詢失敗：${escapeHtml(node.metadataLookup.message || '請稍後再試。')}</p>` : '';
  detail.innerHTML = `
    <p class="eyebrow">${node.role === 'search-input' ? '種子文獻' : '搜尋結果'} · ${escapeHtml(node.sourceType)}</p>
    <h2>${titleLink}</h2>
    <dl class="meta-grid">
      <dt>作者</dt><dd>${escapeHtml(node.authors.join('、') || '未提供')}</dd>
      <dt>出版年份</dt><dd>${escapeHtml(node.year || '未提供')}</dd>
      <dt>出版來源</dt><dd>${escapeHtml(node.venue)}</dd>
      <dt>引用數</dt><dd>${node.citedByCount.toLocaleString('zh-TW')}</dd>
      <dt>參考文獻數</dt><dd>${node.referenceCount.toLocaleString('zh-TW')}</dd>
      <dt>圖內關係</dt><dd>${related.length} 條</dd>
      ${clustersEnabled && clusterByNodeId.has(node.id) ? `<dt>所屬集群</dt><dd>${escapeHtml(clusterByNodeId.get(node.id).label)}（${clusterByNodeId.get(node.id).nodes.length} 篇）</dd>` : ''}
      <dt>開放取用</dt><dd>${node.isOpenAccess ? '是' : '否／未確認'}</dd>
      ${node.tags?.length ? `<dt>論文標籤</dt><dd>${node.tags.map(escapeHtml).join('、')}</dd>` : ''}
    </dl>
    <p class="eyebrow">命中的共同主題</p>
    <div class="topics">${(shared.length ? shared : node.concepts.slice(0, 6)).map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div>
    <p class="eyebrow">摘要</p>
    ${lookupNote}<p class="abstract">${escapeHtml(node.abstract || '尚未提供摘要。')}</p>
    <div class="links">
      ${isLocal ? `<a href="#" data-open-local="${escapeHtml(node.id)}">開啟本機 PDF</a>` : `<a href="${escapeHtml(node.landingUrl)}" target="_blank" rel="noopener noreferrer">開啟來源頁面</a>`}
      ${!isLocal && node.pdfUrl ? `<a href="${escapeHtml(node.pdfUrl)}" target="_blank" rel="noopener noreferrer">開啟 PDF</a>` : ''}
      ${isLocal && node.metadataLookup?.landingUrl ? `<a href="${escapeHtml(node.metadataLookup.landingUrl)}" target="_blank" rel="noopener noreferrer">查看 ${escapeHtml(node.metadataLookup.provider || '外部')} 書目</a>` : ''}
      ${isLocal && node.metadataLookup?.status !== 'found' && node.metadataLookup?.status !== 'loading' ? `<button type="button" data-lookup-local="${escapeHtml(node.id)}">${node.metadataLookup?.status ? '重新查詢書目資料' : '查詢作者、年份與引用資料'}</button>` : ''}
      <button type="button" class="danger-action" data-remove-work="${escapeHtml(node.id)}">從目前地圖移除</button>
      <button type="button" data-map-tag="${escapeHtml(node.id)}">設定地圖標記</button>
      ${libraryIds.has(node.id) ? `<button type="button" data-library-toggle="${escapeHtml(node.id)}">編輯文獻庫標籤</button>` : `<button type="button" data-library-add="${escapeHtml(node.id)}">加入文獻庫並設定地圖標記</button>`}
      <button type="button" data-library-remove="${escapeHtml(node.id)}" ${libraryIds.has(node.id) ? '' : 'disabled'}>移除文獻庫</button>
      ${libraryIds.has(node.id) ? `<button type="button" data-seed="${escapeHtml(node.id)}">以此為種子展開</button>` : ''}
    </div>`;
  draw();
  if (isLocal && !node.metadataLookup?.status) lookupLocalMetadata(node);
}

async function openLocalPdf(node) {
  const popup = window.open('about:blank', '_blank');
  if (!popup) { alert('瀏覽器封鎖了新視窗，請允許此網站開啟分頁後再試。'); return; }
  popup.document.title = '正在開啟本機 PDF…';
  try {
    const stored = await getLocalPdf(node.id);
    if (!stored?.blob) throw new Error('找不到本機 PDF，請回到「文獻搜尋」重新選擇原始資料夾。');
    const url = URL.createObjectURL(stored.blob);
    localPdfWindows.set(node.id, url);
    popup.location.href = url;
  } catch (error) { popup.close(); alert(`無法開啟本機 PDF：${error.message}`); }
}

async function lookupLocalMetadata(node) {
  if (localLookupRequests.has(node.id)) return localLookupRequests.get(node.id);
  const request = (async () => {
    node.metadataLookup = { status: 'loading' };
    showDetail(node);
    try {
      const firstPageText = looksLikeIdentifier(node.title) ? await extractFirstPageText(node) : '';
      const response = await fetch('/api/lookup-work', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: node.title, authors: node.authors || [], year: node.year || null, firstPageText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const match = data.work;
      if (!match) { node.metadataLookup = { status: 'not-found', provider: data.provider || 'OpenAlex' }; showDetail(node); return; }
      node.title = match.title || node.title;
      node.authors = match.authors || node.authors || [];
      node.year = match.year || node.year;
      node.venue = match.venue || node.venue;
      node.citedByCount = Number(match.citedByCount || 0);
      node.referenceCount = Number(match.referenceCount || 0);
      node.referencedWorks = match.referencedWorks || [];
      node.metadataLookup = { status: 'found', provider: data.provider || 'OpenAlex', landingUrl: match.landingUrl || '', matchScore: match.matchScore, titleSource: data.titleSource || '檔名' };
      node.externalMetadataId = match.id;
      if (removedNodeIds.has(node.id)) return;
      showDetail(node);
      fetch('/api/autosave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ works: [node] }) }).catch(() => {});
    } catch (error) { node.metadataLookup = { status: 'error', message: error.message }; showDetail(node); }
  })().finally(() => localLookupRequests.delete(node.id));
  localLookupRequests.set(node.id, request);
  return request;
}

function looksLikeIdentifier(title) {
  const value = String(title || '').trim();
  return /^(?:\d{4}\.\d{4,5}(?:v\d+)?|\d+(?:\.\d+)?e[+-]?\d+|[a-z]+-\d+(?:-\d+)+|[\d._-]+)$/i.test(value);
}

async function extractFirstPageText(node) {
  const stored = await getLocalPdf(node.id);
  if (!stored?.blob) throw new Error('找不到本機 PDF，請回到「文獻搜尋」重新選擇原始資料夾。');
  const document = await pdfjs.getDocument({ data: await stored.blob.arrayBuffer(), verbosity: pdfjs.VerbosityLevel?.ERRORS ?? 0 }).promise;
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  const rows = [];
  for (const item of content.items.filter(item => item.str?.trim())) {
    const y = Math.round((item.transform?.[5] || 0) / 3) * 3;
    const row = rows.find(entry => Math.abs(entry.y - y) <= 3);
    if (row) row.items.push(item); else rows.push({ y, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => row.items.sort((a, b) => (a.transform?.[4] || 0) - (b.transform?.[4] || 0)).map(item => item.str).join(' ')).join('\n').slice(0, 5000);
}

async function removeWorkFromMap(node) {
  if (!node || removedNodeIds.has(node.id)) return;
  if (!confirm(`確定要從目前文獻地圖移除「${node.title}」嗎？\n移除後會一併刪除它在圖中的關係；若要再次使用，需重新匯入。`)) return;
  removedNodeIds.add(node.id);
  try {
    const response = await fetch('/api/remove-work', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: node.id, title: node.title }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    sessionStorage.setItem('literature-map-next-section', 'map');
    location.reload();
  } catch (error) { removedNodeIds.delete(node.id); alert(`移除失敗：${error.message}`); }
}

function readNullableNumber(input) {
  return input.value === '' ? null : Number(input.value);
}

function applyFilters({ refit = true } = {}) {
  filters.keyword = keywordFilter.value;
  filters.yearMin = readNullableNumber(yearMin);
  filters.yearMax = readNullableNumber(yearMax);
  filters.citeMin = readNullableNumber(citeMin);
  filters.citeMax = readNullableNumber(citeMax);
  filters.oa = oaFilter.value;
  filters.sources = new Set([...sourceOptions.querySelectorAll('input:checked')].map(input => input.value));
  const selectedId = selected?.id || graph.edges.find(edge => edge.type === 'citation')?.source || graph.nodes.find(node => node.role === 'search-input')?.id;
  const viewNodes = viewMode === 'seed-network' ? seedNetwork(graph.nodes, graph.edges, activeSeedId) : nodesForView(graph.nodes, graph.edges, viewMode, selectedId);
  visibleNodes = viewNodes.filter(node => matchesNode(node, filters) && (!selectedClusterNodeIds || selectedClusterNodeIds.has(node.id)));
  visibleIds = new Set(visibleNodes.map(node => node.id));
  visibleEdges = graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  rebuildClusters();
  renderClusterSmallMultiples();
  if (selected && !visibleIds.has(selected.id)) selected = null;
  filterCount.textContent = `顯示 ${visibleNodes.length}／${graph.nodes.length} 篇文獻，${visibleEdges.length} 條關係`;
  if (canvasMode === 'clusterOverview') return;
  if (refit) fit(); else draw();
}

function renderLibraryTags(node) {
  const tags = [...new Set([node.mapTag, ...(node.libraryTags || [])].filter(Boolean))];
  if (!tags.length) return '尚未設定，可新增標籤';
  return tags.map(tag => `${tag === node.mapTag && node.markerColor && node.markerColor !== 'default' ? `<span class="node-color-dot" style="--tag-color:var(--tag-${escapeHtml(node.markerColor)})"></span>` : ''}${escapeHtml(tag)}`).join('、');
}

function renderLibrary() {
  restorePaperAnnotations(currentProjectId, graph.nodes);
  const saved = graph.nodes.filter(node => libraryIds.has(node.id));
  libraryCount.textContent = String(saved.length);
  librarySummary.textContent = saved.length ? `已收藏 ${saved.length} 篇論文，可選擇任一篇作為地圖種子。` : '尚未收藏論文';
  libraryList.innerHTML = saved.length ? saved.map(node => `
    <article class="library-item">
      <div>
        <h3>${node.origin === 'local' ? `<a href="#" data-open-local="${escapeHtml(node.id)}">${escapeHtml(node.title)}</a>` : `<a href="${escapeHtml(node.pdfUrl || node.landingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(node.title)}</a>`}</h3>
        <p>${escapeHtml(node.authors.slice(0,4).join('、') || '作者未提供')} · ${escapeHtml(node.year || '年份未提供')} · ${escapeHtml(node.venue)}</p>
        <p>引用 ${node.citedByCount.toLocaleString('zh-TW')} · 參考文獻 ${node.referenceCount.toLocaleString('zh-TW')} · ${node.isOpenAccess ? '開放取用' : '非開放／未確認'}</p>
        <p class="paper-tags">標籤：${renderLibraryTags(node)}</p>
      </div>
      <div class="library-actions">
        <button type="button" data-seed="${escapeHtml(node.id)}">以此為種子展開</button>
        <button type="button" data-library-toggle="${escapeHtml(node.id)}">${node.libraryTags?.length ? '編輯文獻庫標籤' : '新增文獻庫標籤'}</button>
        <button type="button" data-library-remove="${escapeHtml(node.id)}">移除收藏</button>
      </div>
    </article>`).join('') : '<p class="empty-state">在地圖中點選一篇論文，再按「加入文獻庫」。收藏資料只保存在此瀏覽器的本機儲存空間。</p>';
}

function switchSection(name) {
  searchSection.hidden = name !== 'search';
  mapSection.hidden = name !== 'map';
  librarySection.hidden = name !== 'library';
  document.querySelectorAll('[data-section]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.section === name)));
  if (name === 'library') renderLibrary();
  else if (name === 'map') resize();
}

function setSeed(id) {
  const node = byId.get(id);
  if (!node) return;
  activeSeedId = id;
  selected = node;
  viewMode = 'seed-network';
  seedNetworkView.hidden = false;
  document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === 'seed-network')));
  switchSection('map');
  applyFilters();
  showDetail(node);
}

function persistLibrary(next) {
  libraryIds = next;
  writeLibrary(localStorage, libraryIds);
  renderLibrary();
  if (selected) showDetail(selected);
}

function setupFilterOptions() {
  const years = graph.nodes.map(node => node.year).filter(Boolean);
  yearMin.placeholder = String(Math.min(...years));
  yearMax.placeholder = String(Math.max(...years));
  const sources = [...new Set(graph.nodes.map(node => node.sourceType))].sort();
  sourceOptions.innerHTML = sources.map(source => `<label><input type="checkbox" value="${escapeHtml(source)}" checked>${escapeHtml(source)}</label>`).join('');
  const topicCounts = new Map();
  graph.nodes.flatMap(node => node.concepts).forEach(topic => topicCounts.set(topic.toLowerCase(), (topicCounts.get(topic.toLowerCase()) || 0) + 1));
  const topics = [...topicCounts.entries()].sort((a,b) => b[1] - a[1]).slice(0, 8);
  topicOptions.innerHTML = topics.map(([topic, count]) => `<button type="button" data-topic="${escapeHtml(topic)}" aria-pressed="false">${escapeHtml(topic)} · ${count}</button>`).join('');
}

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = event.clientX - rect.left, my = event.clientY - rect.top;
  const wx = (mx - offsetX) / scale, wy = (my - offsetY) / scale;
  const next = Math.max(.15, Math.min(4, scale * Math.exp(-event.deltaY * .0012)));
  offsetX = mx - wx * next; offsetY = my - wy * next; scale = next; draw();
}, { passive: false });
canvas.addEventListener('pointerdown', event => {
  const rect = canvas.getBoundingClientRect();
  const candidate = hit(event.clientX - rect.left, event.clientY - rect.top);
  draggingNode = xMetric.value === 'layout' && yMetric.value === 'layout' ? candidate : null;
  dragging = !draggingNode; moved = false; start = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY };
  if (draggingNode) selected = draggingNode;
  canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', event => {
  const rect = canvas.getBoundingClientRect();
  if (draggingNode) {
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    draggingNode.x = (event.clientX - rect.left - offsetX) / scale;
    // displayY() negates layout Y before projecting it to the canvas, so the
    // inverse pointer transform must negate it as well.
    draggingNode.y = -(event.clientY - rect.top - offsetY) / scale;
    tooltip.hidden = true; draw(); return;
  }
  if (dragging) {
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    moved ||= Math.abs(dx) + Math.abs(dy) > 3;
    offsetX = start.ox + dx; offsetY = start.oy + dy; draw(); return;
  }
  hovered = hit(event.clientX - rect.left, event.clientY - rect.top);
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
  tooltip.hidden = !hovered;
  if (hovered) {
    tooltip.textContent = hovered.title;
    tooltip.style.left = `${Math.min(wrap.clientWidth - 290, event.clientX - rect.left + 14)}px`;
    tooltip.style.top = `${Math.max(8, event.clientY - rect.top + 14)}px`;
  }
  draw();
});
canvas.addEventListener('pointerup', event => {
  canvas.classList.remove('dragging');
  if (draggingNode) {
    showDetail(draggingNode);
  } else if (!moved) {
    const rect = canvas.getBoundingClientRect();
    showDetail(hit(event.clientX - rect.left, event.clientY - rect.top));
  }
  dragging = false; draggingNode = null;
  scheduleMapStateSave();
});
canvas.addEventListener('pointerleave', () => { if (!dragging && !draggingNode) { hovered = null; tooltip.hidden = true; draw(); } });
resetButton.addEventListener('click', () => {
  graph.nodes.forEach(node => { node.x = node.initialX; node.y = node.initialY; });
  fit();
  scheduleMapStateSave();
});
const setClusterToggleLabel = () => {
  const isOverview = canvasMode === 'overview';
  toggleClustersButton.setAttribute('aria-pressed', String(!isOverview));
  toggleClustersButton.textContent = isOverview ? '分群小圖' : '切回全覽';
};
function showClusterOverview() {
  canvasMode = 'clusterOverview'; clustersEnabled = true; selectedClusterId = null; selectedClusterNodeIds = null;
  clusterDetailNav.hidden = true; wrap.hidden = true; clusterViewContainer.hidden = false;
  setClusterToggleLabel(); applyFilters();
}
function showMapOverview() {
  canvasMode = 'overview'; clustersEnabled = false; selectedClusterId = null; selectedClusterNodeIds = null;
  clusterDetailNav.hidden = true; wrap.hidden = false; clusterViewContainer.hidden = true; clusterViewContainer.replaceChildren();
  setClusterToggleLabel(); applyFilters();
}
function openClusterDetail(cluster) {
  canvasMode = 'clusterDetail'; clustersEnabled = true; selectedClusterId = cluster.id;
  selectedClusterNodeIds = new Set(cluster.nodes.map(node => node.id));
  clusterDetailTitle.textContent = `${cluster.label} · ${cluster.nodes.length} 篇｜群內互動關係圖`;
  clusterDetailNav.hidden = false; wrap.hidden = false; clusterViewContainer.hidden = true;
  setClusterToggleLabel(); applyFilters({ refit: true });
}
returnClusterOverviewButton?.addEventListener('click', showClusterOverview);
returnMapOverviewButton?.addEventListener('click', showMapOverview);
toggleClustersButton?.addEventListener('click', () => {
  const hasClusterQualityIssue = node => { if (node.cluster?.id === 'unclustered') return false; const label = String(node.cluster?.label || '').trim(), longLatinWords = label.match(/[a-z]{4,}/ig) || []; return node.cluster?.version !== 2 || (label === '未形成明確研究主題' && node.cluster?.reviewStatus !== 'no_shared_topic') || label === '命名處理失敗（待重試）' || !node.cluster?.reviewStatus || longLatinWords.length >= 2 || /^(?:群集|集群|cluster)\s*[a-z\d]+$/i.test(label) || /(?:\d+\s*(?:至|-|~)\s*\d+\s*字|繁體中文.*(?:群集|集群).*名稱|實際(?:研究)?主題|群集名稱|集群名稱|字數|格式)/i.test(label); };
  if (canvasMode === 'overview') {
    if (graph.nodes.some(hasClusterQualityIssue)) { startSavedClusterJob(); return; }
    showClusterOverview();
  } else showMapOverview();
  if (selected) showDetail(selected);
});

async function startSavedClusterJob() {
  try {
    const response = await fetch('/api/cluster-jobs', { method: 'POST' });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error || `HTTP ${response.status}`);
    await watchClusterJob(job);
  } catch (error) { alert(`無法開始群集處理：${error.message}`); }
}

async function watchClusterJob(job) {
  if (job.status === 'ready') { location.reload(); return; }
  clusterProgressBar.max = Math.max(1, job.total || 1); clusterProgressBar.value = job.processed || 0;
  clusterProgressSummary.textContent = `共 ${job.total || 0} 篇文獻，正在建立群集。`;
  clusterProgressDetail.textContent = 'Ollama 正在為各群集整理主題，完成後會自動儲存並重新整理頁面。';
  if (!clusterProgressDialog.open) clusterProgressDialog.showModal();
  while (true) {
    const response = await fetch(`/api/cluster-jobs?id=${encodeURIComponent(job.id)}`, { cache: 'no-store' });
    const state = await response.json();
    if (!response.ok || state.status === 'error') throw new Error(state.error || '群集處理失敗');
    clusterProgressBar.value = state.processed || 0;
    clusterProgressSummary.textContent = `共 ${state.total || 0} 篇文獻，已處理 ${state.processed || 0} 篇。`;
    clusterProgressDetail.textContent = state.detail || '正在建立群集…';
    if (state.status === 'done') { clusterProgressDialog.close(); location.reload(); return; }
    await new Promise(resolve => setTimeout(resolve, 700));
  }
}
window.watchClusterJob = async job => {
  try { await watchClusterJob(job); }
  catch (error) { if (clusterProgressDialog.open) clusterProgressDialog.close(); alert(`建立群集失敗：${error.message}`); }
};
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  viewMode = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  applyFilters();
}));
document.querySelectorAll('[data-section]').forEach(button => button.addEventListener('click', () => switchSection(button.dataset.section)));
async function loadBackupOptions() {
  if (!backupSelect) return;
  try {
    const response = await fetch('/api/backups', { cache: 'no-store' });
    const data = await response.json();
    backupSelect.innerHTML = data.backups?.length ? data.backups.map(item => `<option value="${item.name}">${new Date(item.modifiedAt).toLocaleString('zh-TW')}（${Math.round(item.size / 1024)} KB）</option>`).join('') : '<option value="">尚無備份</option>';
  } catch { backupSelect.innerHTML = '<option value="">備份讀取失敗</option>'; }
}
backupSelect?.addEventListener('change', async () => { const name = backupSelect.value; if (!name) { setStats(graphStats(graph)); return; } try { const response = await fetch(`/api/backup-preview?name=${encodeURIComponent(name)}`, { cache: 'no-store' }), data = await response.json(); if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`); const stamp = data.savedAt ? new Date(data.savedAt).toLocaleString('zh-TW') : name; setStats(data.stats, 'backupPreview', stamp); } catch (error) { statsMode.textContent = `備份預覽失敗：${error.message}`; } });
returnLiveButton?.addEventListener('click', () => { backupSelect.value = ''; setStats(graphStats(graph)); });
restoreBackupButton?.addEventListener('click', async () => {
  const name = backupSelect?.value;
  if (!name || !confirm('恢復前會先保留目前資料，確定要載入這份備份嗎？')) return;
  restoreBackupButton.disabled = true;
  try {
    const response = await fetch('/api/restore-backup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    sessionStorage.setItem('literature-map-next-section', 'map');
    location.reload();
  } catch (error) { alert(`恢復失敗：${error.message}`); restoreBackupButton.disabled = false; }
});
loadBackupOptions();
document.addEventListener('click', event => {
  const openLocal = event.target.closest('[data-open-local]');
  const lookupLocal = event.target.closest('[data-lookup-local]');
  const removeWork = event.target.closest('[data-remove-work]');
  const mapTag = event.target.closest('[data-map-tag]');
  const add = event.target.closest('[data-library-add]');
  const toggle = event.target.closest('[data-library-toggle]');
  const remove = event.target.closest('[data-library-remove]');
  const seed = event.target.closest('[data-seed]');
  if (openLocal) { event.preventDefault(); const node = byId.get(openLocal.dataset.openLocal); if (node) openLocalPdf(node); }
  else if (lookupLocal) { event.preventDefault(); const node = byId.get(lookupLocal.dataset.lookupLocal); if (node) lookupLocalMetadata(node); }
  else if (removeWork) { event.preventDefault(); const node = byId.get(removeWork.dataset.removeWork); if (node) removeWorkFromMap(node); }
  else if (mapTag) { const node = byId.get(mapTag.dataset.mapTag); if (node) openMapTagEditor(node, 'edit'); }
  else if (add) { const node = byId.get(add.dataset.libraryAdd); if (node) openMapTagEditor(node); }
  else if (toggle) { const node = byId.get(toggle.dataset.libraryToggle); if (node) openLibraryTagEditor(node); }
  else if (remove) persistLibrary(toggleLibrary(libraryIds, remove.dataset.libraryRemove));
  else if (seed) setSeed(seed.dataset.seed);
});
[keywordFilter, yearMin, yearMax, citeMin, citeMax].forEach(input => input.addEventListener('input', () => applyFilters()));
[oaFilter, sourceOptions].forEach(input => input.addEventListener('change', () => applyFilters()));
topicOptions.addEventListener('click', event => {
  const button = event.target.closest('[data-topic]');
  if (!button) return;
  const active = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(active));
  if (active) filters.topics.add(button.dataset.topic); else filters.topics.delete(button.dataset.topic);
  applyFilters();
});
[xMetric, yMetric, sizeMetric].forEach(select => select.addEventListener('change', () => fit()));
document.getElementById('clear-filters').addEventListener('click', () => {
  keywordFilter.value = ''; yearMin.value = ''; yearMax.value = ''; citeMin.value = ''; citeMax.value = ''; oaFilter.value = 'all';
  filters.topics.clear(); topicOptions.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed','false'));
  sourceOptions.querySelectorAll('input').forEach(input => { input.checked = true; });
  applyFilters();
});
new ResizeObserver(resize).observe(wrap);

const counts = Object.groupBy(graph.edges, edge => edge.type);
meta.textContent = `${graph.nodes.length} 篇文獻 · ${graph.edges.length} 條關係 · 引用 ${counts.citation?.length || 0} · 共同主題 ${counts['shared-topic']?.length || 0} · 相似度 ${counts.similarity?.length || 0}`;
setupFilterOptions();
renderLibrary();
applyFilters({ refit:false });
const initialSection = sessionStorage.getItem('literature-map-next-section') || 'search';
sessionStorage.removeItem('literature-map-next-section');
switchSection(initialSection);
