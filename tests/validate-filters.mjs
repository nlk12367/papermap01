import assert from 'node:assert/strict';
import { matchesNode, nodesForView } from '../src/filters.js';

const nodes = [
  { id:'a', title:'Augmented reality', abstract:'color vision', concepts:['Optics'], year:2020, sourceType:'OpenAlex', citedByCount:10, isOpenAccess:true, role:'search-input' },
  { id:'b', title:'Traffic light', abstract:'recognition', concepts:['Computer vision'], year:2015, sourceType:'CORE', citedByCount:2, isOpenAccess:false, role:'result' }
];
const empty = { keyword:'', topics:new Set(), yearMin:null, yearMax:null, sources:null, citeMin:null, citeMax:null, oa:'all' };
assert.equal(nodes.filter(n => matchesNode(n, {...empty, keyword:'color'})).length, 1);
assert.equal(nodes.filter(n => matchesNode(n, {...empty, yearMin:2018})).length, 1);
assert.equal(nodes.filter(n => matchesNode(n, {...empty, sources:new Set(['CORE'])})).length, 1);
assert.equal(nodes.filter(n => matchesNode(n, {...empty, sources:new Set()})).length, 0);
assert.equal(nodes.filter(n => matchesNode(n, {...empty, citeMin:5})).length, 1);
assert.equal(nodes.filter(n => matchesNode(n, {...empty, oa:'yes'})).length, 1);
assert.equal(nodesForView(nodes, [], 'search-input').length, 1);
assert.equal(nodesForView(nodes, [{source:'a',target:'b',type:'citation'}], 'references', 'a').length, 2);
console.log('驗證通過：五類篩選與四種檢視模式');
