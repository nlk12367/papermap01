import assert from 'node:assert/strict';
import { LIBRARY_KEY, readLibrary, writeLibrary, toggleLibrary, seedNetwork } from '../src/library.js';

const memory = new Map();
const storage = { getItem:key => memory.get(key) || null, setItem:(key,value) => memory.set(key,value) };
let ids = readLibrary(storage);
ids = toggleLibrary(ids, 'a');
writeLibrary(storage, ids);
assert.deepEqual([...readLibrary(storage)], ['a']);
ids = toggleLibrary(ids, 'a');
assert.equal(ids.size, 0);
memory.set(LIBRARY_KEY, '{bad json');
assert.equal(readLibrary(storage).size, 0);
const nodes = [{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
const edges = [{source:'a',target:'b',type:'citation'},{source:'c',target:'a',type:'similarity'},{source:'b',target:'d',type:'shared-topic'}];
assert.deepEqual(seedNetwork(nodes, edges, 'a').map(x=>x.id), ['a','b','c']);
console.log('驗證通過：收藏持久化、切換與單篇種子網絡');
