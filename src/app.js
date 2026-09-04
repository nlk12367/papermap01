import { matchesNode, nodesForView } from './filters.js';
import { readLibrary, writeLibrary, toggleLibrary, seedNetwork } from './library.js';

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
const newTag = document.getElementById('new-tag');
const TAG_KEY = 'open-literature-map.system-tags.v1';
const readTags = () => { try { const value = JSON.parse(localStorage.getItem(TAG_KEY) || '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; } catch { return []; } };
const writeTags = tags => localStorage.setItem(TAG_KEY, JSON.stringify([...new Set(tags)].sort()));
let tagTarget = null;
function openTagEditor(node) { tagTarget = node; tagPaperTitle.textContent = node.title; const tags = readTags(), selected = new Set(node.tags || []); tagOptions.innerHTML = tags.length ? tags.map(tag => `<label><input type="checkbox" value="${escapeHtml(tag)}" ${selected.has(tag) ? 'checked' : ''}>${escapeHtml(tag)}</label>`).join('') : '<span class="empty-state">尚未建立系統標籤</span>'; newTag.value = ''; tagDialog.showModal(); }
tagForm?.addEventListener('submit', async event => { event.preventDefault(); if (!tagTarget) return; const added = newTag.value.trim() ? [newTag.value.trim().slice(0, 40)] : [], finalTags = [...new Set([...tagOptions.querySelectorAll('input:checked')].map(input => input.value), ...added)]; writeTags([...readTags(), ...added]); tagTarget.tags = finalTags; persistLibrary(new Set([...libraryIds, tagTarget.id])); scheduleMapStateSave(); try { await fetch('/api/autosave', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ works: [tagTarget] }) }); } catch {} tagDialog.close(); showDetail(tagTarget); });
document.getElementById('tag-cancel')?.addEventListener('click', () => tagDialog.close());
const ctx = canvas.getContext('2d');

const response = await fetch('data/graph.json');
if (!response.ok) throw new Error(`無法讀取圖資料：${response.status}`);
const graph = await response.json();
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
let hovered = null;
let dragging = false;
let draggingNode = null;
let moved = false;
let start = null;
let viewMode = 'all';
let visibleNodes = [];
let visibleEdges = [];
let visibleIds = new Set();
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
  topic: color('--topic'), similarity: color('--similarity')
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
    ctx.fillStyle = node.role === 'search-input' ? p.seed : node.origin === 'local' ? p.local : p.result;
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
  detail.innerHTML = `
    <p class="eyebrow">${node.role === 'search-input' ? '種子文獻' : '搜尋結果'} · ${escapeHtml(node.sourceType)}</p>
    <h2><a class="title-link" href="${escapeHtml(node.landingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(node.title)}</a></h2>
    <dl class="meta-grid">
      <dt>作者</dt><dd>${escapeHtml(node.authors.join('、') || '未提供')}</dd>
      <dt>出版年份</dt><dd>${escapeHtml(node.year || '未提供')}</dd>
      <dt>出版來源</dt><dd>${escapeHtml(node.venue)}</dd>
      <dt>引用數</dt><dd>${node.citedByCount.toLocaleString('zh-TW')}</dd>
      <dt>參考文獻數</dt><dd>${node.referenceCount.toLocaleString('zh-TW')}</dd>
      <dt>圖內關係</dt><dd>${related.length} 條</dd>
      <dt>開放取用</dt><dd>${node.isOpenAccess ? '是' : '否／未確認'}</dd>
      ${node.tags?.length ? `<dt>論文標籤</dt><dd>${node.tags.map(escapeHtml).join('、')}</dd>` : ''}
    </dl>
    <p class="eyebrow">命中的共同主題</p>
    <div class="topics">${(shared.length ? shared : node.concepts.slice(0, 6)).map(x => `<span>${escapeHtml(x)}</span>`).join('')}</div>
    <p class="eyebrow">摘要</p>
    <p class="abstract">${escapeHtml(node.abstract || 'OpenAlex 未提供摘要。')}</p>
    <div class="links">
      <a href="${escapeHtml(node.landingUrl)}" target="_blank" rel="noopener noreferrer">開啟來源頁面</a>
      ${node.pdfUrl ? `<a href="${escapeHtml(node.pdfUrl)}" target="_blank" rel="noopener noreferrer">開啟 PDF</a>` : ''}
      <button type="button" data-library-add="${escapeHtml(node.id)}" ${libraryIds.has(node.id) ? 'disabled' : ''}>加入文獻庫</button>
      <button type="button" data-library-remove="${escapeHtml(node.id)}" ${libraryIds.has(node.id) ? '' : 'disabled'}>移除文獻庫</button>
      ${libraryIds.has(node.id) ? `<button type="button" data-seed="${escapeHtml(node.id)}">以此為種子展開</button>` : ''}
    </div>`;
  draw();
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
  visibleNodes = viewNodes.filter(node => matchesNode(node, filters));
  visibleIds = new Set(visibleNodes.map(node => node.id));
  visibleEdges = graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  if (selected && !visibleIds.has(selected.id)) selected = null;
  filterCount.textContent = `顯示 ${visibleNodes.length}／${graph.nodes.length} 篇文獻，${visibleEdges.length} 條關係`;
  if (refit) fit(); else draw();
}

function renderLibrary() {
  const saved = graph.nodes.filter(node => libraryIds.has(node.id));
  libraryCount.textContent = String(saved.length);
  librarySummary.textContent = saved.length ? `已收藏 ${saved.length} 篇論文，可選擇任一篇作為地圖種子。` : '尚未收藏論文';
  libraryList.innerHTML = saved.length ? saved.map(node => `
    <article class="library-item">
      <div>
        <h3><a href="${escapeHtml(node.landingUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(node.title)}</a></h3>
        <p>${escapeHtml(node.authors.slice(0,4).join('、') || '作者未提供')} · ${escapeHtml(node.year || '年份未提供')} · ${escapeHtml(node.venue)}</p>
        <p>引用 ${node.citedByCount.toLocaleString('zh-TW')} · 參考文獻 ${node.referenceCount.toLocaleString('zh-TW')} · ${node.isOpenAccess ? '開放取用' : '非開放／未確認'}</p>
        ${node.tags?.length ? `<p>標籤：${node.tags.map(escapeHtml).join('、')}</p>` : ''}
      </div>
      <div class="library-actions">
        <button type="button" data-seed="${escapeHtml(node.id)}">以此為種子展開</button>
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
  const add = event.target.closest('[data-library-add]');
  const toggle = event.target.closest('[data-library-toggle]');
  const remove = event.target.closest('[data-library-remove]');
  const seed = event.target.closest('[data-seed]');
  if (add) { const node = byId.get(add.dataset.libraryAdd); if (node) openTagEditor(node); }
  else if (toggle) { const node = byId.get(toggle.dataset.libraryToggle); if (node) openTagEditor(node); }
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
