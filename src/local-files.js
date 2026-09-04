const DB_NAME = 'open-literature-map.local-files.v1';
const STORE_NAME = 'pdfs';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('此瀏覽器不支援本機 PDF 儲存'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('無法開啟本機 PDF 儲存區'));
  });
}

function transaction(mode, operation) {
  return openDatabase().then(db => new Promise((resolve, reject) => {
    const request = operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本機 PDF 儲存失敗'));
  }));
}

export function saveLocalPdf(id, file, relativePath = '') {
  return transaction('readwrite', store => store.put({
    id,
    name: file.name,
    relativePath,
    type: file.type || 'application/pdf',
    blob: file,
    savedAt: new Date().toISOString()
  }));
}

export function getLocalPdf(id) {
  return transaction('readonly', store => store.get(id));
}
