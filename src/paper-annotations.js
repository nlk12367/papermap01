const STORAGE_KEY = 'open-literature-map.paper-annotations.v1';

function readAll() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
}

function writeAll(value) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* 儲存空間不足時仍不阻斷地圖 */ }
}

export function savePaperAnnotation(projectId, paper) {
  if (!projectId || !paper?.id) return;
  const all = readAll();
  const project = all[projectId] && typeof all[projectId] === 'object' ? all[projectId] : {};
  project[paper.id] = {
    tags: Array.isArray(paper.tags) ? [...new Set(paper.tags.filter(Boolean))] : [],
    markerColor: paper.markerColor || 'default',
    markerProjectId: projectId,
    savedAt: new Date().toISOString()
  };
  all[projectId] = project;
  writeAll(all);
}

export function restorePaperAnnotations(projectId, papers) {
  if (!projectId || !Array.isArray(papers)) return;
  const project = readAll()[projectId];
  if (!project || typeof project !== 'object') return;
  for (const paper of papers) {
    const annotation = project[paper.id];
    if (!annotation) continue;
    paper.tags = Array.isArray(annotation.tags) ? annotation.tags : [];
    paper.markerColor = annotation.markerColor || 'default';
    paper.markerProjectId = projectId;
    paper.projectId = projectId;
  }
}
