import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';

const root = path.resolve(import.meta.dirname);
try {
  const envText = await fs.readFile(path.join(root,'.env'),'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const match=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
  }
} catch (error) { if (error.code!=='ENOENT') throw error; }
const port = Number(process.env.PORT || 8770);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const json = (res,status,body) => { res.writeHead(status,{'content-type':'application/json; charset=utf-8'}); res.end(JSON.stringify(body)); };
const body = req => new Promise((resolve,reject)=>{ let value='',settled=false; req.on('data',c=>{ if(settled)return; value+=c; if(value.length>25_000_000){settled=true;reject(new Error('匯入內容超過 25 MB，請減少勾選篇數後分批匯入'));req.destroy();} }); req.on('end',()=>{if(!settled)resolve(JSON.parse(value||'{}'));}); req.on('error',error=>{if(!settled)reject(error);}); });
const clean = text => String(text||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const words = text => clean(text).toLowerCase().match(/[a-z][a-z-]{2,}|[\u3400-\u9fff]{2,}/g)||[];
const stop = new Set('the and for with from this that these those using based study method results analysis paper into between were have has are was color vision'.split(' '));
function localKeywords(papers){ const counts=new Map(); for(const p of papers) for(const w of words(`${p.name} ${p.text||''}`)) if(!stop.has(w)) counts.set(w,(counts.get(w)||0)+1); return [...counts].sort((a,b)=>b[1]-a[1]).slice(0,24).map(x=>x[0]); }

async function expandKeywords(papers,topic=''){
  const local=localKeywords(papers), key=process.env.GROQ_API_KEY;
  if(!key) return {keywords:local,expanded:[],method:'local'};
  const primary=process.env.GROQ_PRIMARY_MODEL||'qwen/qwen3.6-27b';
  const fallback=process.env.GROQ_FALLBACK_MODEL||'openai/gpt-oss-20b';
  const prompt=`研究主題：${topic}\n核心關鍵字：${local.slice(0,16).join('、')}\n請以研究主題為主軸，產生最多 8 個可用於尋找相鄰方法、應用或理論的中英文衍生搜尋詞。衍生詞不可只是重複核心詞，也不可離開主題。只輸出 JSON：{"expanded":[]}。`;
  const request=async(model,jsonMode)=>fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:.1,...(jsonMode?{response_format:{type:'json_object'}}:{}),messages:[{role:'user',content:prompt}]})});
  let model=primary, response=await request(model,true);
  if(response.status===400) response=await request(model,false);
  if(!response.ok && fallback!==primary){model=fallback;response=await request(model,true);if(response.status===400)response=await request(model,false);}
  if(!response.ok) return {keywords:local,expanded:[],method:`local-fallback-${response.status}`};
  const payload=await response.json();
  try { const raw=payload.choices?.[0]?.message?.content||'{}'; const match=raw.match(/\{[\s\S]*\}/); const parsed=JSON.parse(match?.[0]||'{}'); return {keywords:local,expanded:parsed.expanded||[],method:`groq:${model}`}; }
  catch {
    const textPrompt=`Research topic: ${topic}\nCore keywords:\n${local.slice(0,16).join('\n')}\nReturn at most 8 derived academic search terms that expand toward adjacent methods, applications, or theories while staying on topic. One term per line, no numbering and no explanation.`;
    const textResponse=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model:fallback,temperature:.1,messages:[{role:'user',content:textPrompt}]})});
    if(!textResponse.ok) return {keywords:local,expanded:[],method:`local-fallback-${textResponse.status}`};
    const textPayload=await textResponse.json();
    const expanded=String(textPayload.choices?.[0]?.message?.content||'').split(/\r?\n|,/).map(x=>x.replace(/^[-*\d.()\s]+/,'').trim()).filter(x=>x&&x.length<100).slice(0,8);
    return expanded.length?{keywords:local,expanded,method:`groq:${fallback}:text`}:{keywords:local,expanded:[],method:'local-fallback-format'};
  }
}

async function groqJson(prompt,preferredModels=[]){
  const key=process.env.GROQ_API_KEY;if(!key)throw new Error('尚未設定 GROQ_API_KEY');
  const defaults=[process.env.GROQ_PRIMARY_MODEL||'qwen/qwen3.8-27b',process.env.GROQ_FALLBACK_MODEL||'openai/gpt-oss-20b'],models=[...new Set(preferredModels.length?[...preferredModels,process.env.GROQ_FALLBACK_MODEL||'openai/gpt-oss-20b']:defaults)],errors=[];
  for(const model of models){for(let attempt=1;attempt<=3;attempt++){try{const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({model,temperature:0,response_format:{type:'json_object'},messages:[{role:'user',content:prompt}]})});if(!response.ok){const detail=clean((await response.json().catch(()=>({})))?.error?.message).slice(0,240),wait=Math.min(20000,Number(response.headers.get('retry-after')||0)*1000||attempt*5000);errors.push(`${model} HTTP ${response.status}${detail?`：${detail}`:''}`);if(response.status===429&&attempt<3){await new Promise(resolve=>setTimeout(resolve,wait));continue;}break;}const payload=await response.json(),raw=payload.choices?.[0]?.message?.content||'{}',match=raw.match(/\{[\s\S]*\}/);try{return{data:JSON.parse(match?.[0]||'{}'),model};}catch{errors.push(`${model} 回傳格式無法解析`);break;}}catch(error){errors.push(`${model} 連線失敗：${error.message}`);if(attempt<3)await new Promise(resolve=>setTimeout(resolve,attempt*3000));}}}
  throw new Error(`Groq 呼叫失敗：${errors.slice(-4).join('；')}`);
}

async function buildRubric(topic){
  const prompt=`你是研究方法顧問。請把使用者的研究題目轉換成一份可重複使用的文獻初篩評分表。本次題目：${topic}\n固定權重與計算方式：研究目標一致性30分、目標對象或應用場景20分、方法與技術可轉移性20分、實驗或評估證據價值20分、對專案直接可用性10分，總分為五項相加，60分以上建議納入。請依本次題目為每個維度寫出具體判準，並列出3至8個必要條件、可接受的延伸方向及應排除的離題方向。只輸出JSON：{"dimensions":[{"key":"objective","name":"研究目標","weight":30,"criterion":"..."}],"mustHave":[],"adjacent":[],"exclusions":[]}。不得更改五項名稱與權重。`;
  const relevanceModels=[process.env.GROQ_RELEVANCE_MODEL||'qwen/qwen3.8-27b','openai/gpt-oss-120b','openai/gpt-oss-20b'];
  const {data,model}=await groqJson(prompt,relevanceModels);return{...data,topic,method:`groq:${model}`,formula:'總分＝研究目標＋場景對象＋方法技術＋實證價值＋專案可用性；滿分100，60分以上納入'};
}

async function buildIEEEQueries(topic,core,expanded){
  const prompt=`你是學術資料庫檢索專家。研究題目：${topic}\n核心詞：${core.slice(0,24).join('、')}\n衍生詞：${expanded.slice(0,16).join('、')}\n請建立恰好3組互補、可直接送入IEEE Xplore queryText的英文布林查詢式。每組必須用AND連接2至4個必要概念群組，每個概念群組可用OR包含同義詞並加括號；避免過長、避免三組重複。三組方向依序為：核心問題與對象、技術方法與系統、應用場景與評估。只輸出JSON：{"queries":["(...) AND (...)","(...) AND (...)","(...) AND (...)"]}。`;
  try{const{data,model}=await groqJson(prompt,[process.env.GROQ_PRIMARY_MODEL||'qwen/qwen3.6-27b','qwen/qwen3.8-27b','openai/gpt-oss-20b']);const queries=(data.queries||[]).map(q=>clean(q)).filter(Boolean).slice(0,3);if(queries.length===3)return{queries,method:`groq:${model}`};}catch{}
  const terms=[...new Set([...core,...expanded])].filter(Boolean),quoted=t=>`"${String(t).replace(/"/g,'')}"`;return{queries:[terms.slice(0,3),terms.slice(3,6),terms.slice(6,9)].map((group,i)=>group.length?group.map(quoted).join(' AND '):quoted(topic)+(i?` AND ${quoted(['system','evaluation'][i-1])}`:'')),method:'local-fallback'};
}

async function scoreBatch(topic,rubric,papers){
  const compact=papers.slice(0,8).map((p,index)=>({index,title:clean(p.title).slice(0,400),abstract:clean(p.abstract).slice(0,1800),concepts:(p.concepts||[]).slice(0,10),year:p.year,venue:clean(p.venue).slice(0,240)}));
  const prompt=`你是研究文獻初篩員。研究題目：${topic}\n以下是本次已確定、所有論文必須共用的評分表：${JSON.stringify(rubric)}\n請逐篇互相獨立評分。固定機器欄位及上限：objective 30、context 20、method 20、evidence 20、usability 10。score必須等於這五項相加。只有關鍵字重疊但研究目標不同者不得高分。缺少摘要時evidence最多5分，總分原則上不得超過55。只輸出JSON：{"evaluations":[{"index":0,"dimensions":{"objective":0,"context":0,"method":0,"evidence":0,"usability":0},"verdict":"納入|邊界參考|排除","reason":"繁體中文具體理由"}]}。文獻：${JSON.stringify(compact)}`;
  const relevanceModels=[process.env.GROQ_RELEVANCE_MODEL||'groq/compound-mini','qwen/qwen3.8-27b','openai/gpt-oss-20b'];
  const {data,model}=await groqJson(prompt,relevanceModels),limits={objective:30,context:20,method:20,evidence:20,usability:10},labels={objective:'研究目標',context:'場景對象',method:'方法技術',evidence:'實證價值',usability:'專案可用性'};
  const evaluations=(data.evaluations||[]).map(e=>{const dimensions={};for(const [key,max] of Object.entries(limits))dimensions[labels[key]]=Math.max(0,Math.min(max,Number(e.dimensions?.[key])||0));const score=Object.values(dimensions).reduce((a,b)=>a+b,0);return{index:Number(e.index),score,dimensions,verdict:clean(e.verdict),reason:clean(e.reason)};});return{evaluations,method:`groq:${model}`};
}

function normalizeEvaluations(items=[]){const limits={objective:30,context:20,method:20,evidence:20,usability:10},labels={objective:'研究目標',context:'場景對象',method:'方法技術',evidence:'實證價值',usability:'專案可用性'};return items.map(e=>{const dimensions={};for(const [key,max] of Object.entries(limits))dimensions[labels[key]]=Math.max(0,Math.min(max,Number(e.dimensions?.[key])||0));return{index:Number(e.index),score:Object.values(dimensions).reduce((a,b)=>a+b,0),dimensions,verdict:clean(e.verdict),reason:clean(e.reason)};});}

async function scoreBatchOllama(topic,rubric,papers){const model=process.env.OLLAMA_RELEVANCE_MODEL||'qwen3:4b',compact=papers.slice(0,8).map((p,index)=>({index,title:clean(p.title).slice(0,400),abstract:clean(p.abstract).slice(0,1800),concepts:(p.concepts||[]).slice(0,10),year:p.year,venue:clean(p.venue).slice(0,240)})),prompt=`你是研究文獻初篩員。研究題目：${topic}\n共用評分表：${JSON.stringify(rubric)}\n逐篇獨立評分。dimensions 固定為 objective/30、context/20、method/20、evidence/20、usability/10，score 為五項相加。僅關鍵字重疊但目標不同不得高分；缺摘要時 evidence 最多5且總分原則不超過55。只輸出 JSON：{"evaluations":[{"index":0,"dimensions":{"objective":0,"context":0,"method":0,"evidence":0,"usability":0},"verdict":"納入|邊界參考|排除","reason":"繁體中文理由"}]}。文獻：${JSON.stringify(compact)}`,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),180000);try{const response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({model,stream:false,format:'json',think:false,keep_alive:'20m',options:{temperature:0,num_ctx:8192,num_predict:1800},messages:[{role:'user',content:prompt}]})});if(!response.ok)throw new Error(`Ollama ${model} HTTP ${response.status}：${clean(await response.text()).slice(0,240)}`);const payload=await response.json(),raw=payload.message?.content||'{}',data=JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]||'{}');return{evaluations:normalizeEvaluations(data.evaluations||[]),method:`ollama:${model}`};}catch(error){if(error.name==='AbortError')throw new Error(`Ollama ${model} 單批超過 180 秒`);throw error;}finally{clearTimeout(timer);}}

async function searchOpenAlex(query,count){
  const u=new URL('https://api.openalex.org/works'); u.searchParams.set('search',query); u.searchParams.set('per-page',count); u.searchParams.set('select','id,doi,display_name,publication_year,authorships,abstract_inverted_index,cited_by_count,referenced_works,concepts,keywords,primary_location,open_access');
  const p=await (await fetch(u)).json();
  return (p.results||[]).map(w=>{ const a=[]; for(const [term,pos] of Object.entries(w.abstract_inverted_index||{})) for(const i of pos)a[i]=term; return {id:w.id,title:w.display_name,authors:(w.authorships||[]).map(x=>x.author?.display_name).filter(Boolean),year:w.publication_year,abstract:a.filter(Boolean).join(' '),concepts:[...(w.concepts||[]).map(x=>x.display_name),...(w.keywords||[]).map(x=>x.display_name)],citedByCount:w.cited_by_count||0,citedByApiUrl:'',referenceCount:(w.referenced_works||[]).length,referencedWorks:w.referenced_works||[],metadataProvider:'OpenAlex',metadataProviders:['OpenAlex'],sourceType:'OpenAlex',origin:'external',venue:w.primary_location?.source?.display_name||'OpenAlex',isOpenAccess:Boolean(w.open_access?.is_oa),pdfUrl:w.primary_location?.pdf_url||'',landingUrl:w.doi||w.primary_location?.landing_page_url||w.id,role:'result'}; });
}
function titleSimilarity(a,b){const tokens=value=>new Set(clean(value).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)||[]),left=tokens(a),right=tokens(b);if(!left.size||!right.size)return 0;let overlap=0;for(const token of left)if(right.has(token))overlap++;return overlap/Math.max(left.size,right.size);}
async function lookupOpenAlex(title,authors=[],year=null){
  const candidates=await searchOpenAlex(title,10);
  const authorText=authors.join(' ').toLowerCase();
  return candidates.map(work=>{const authorOverlap=authorText&&work.authors.some(author=>authorText.includes(author.toLowerCase().split(' ').pop())) ? 0.15 : 0;const yearBonus=year&&work.year&&Math.abs(Number(year)-Number(work.year))<=1 ? 0.1 : 0;return {...work,matchScore:Math.min(1,titleSimilarity(title,work.title)+authorOverlap+yearBonus)};}).sort((a,b)=>b.matchScore-a.matchScore)[0]||null;
}
async function searchArxiv(query,count){
  const u=new URL('https://export.arxiv.org/api/query'); u.searchParams.set('search_query',`all:${query.replace(/\s+/g,' AND all:')}`); u.searchParams.set('max_results',count);
  const xml=await (await fetch(u)).text(); const entries=[...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(x=>x[1]); const tag=(x,n)=>clean((x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`))||[])[1]);
  return entries.map(x=>{const id=tag(x,'id'),authors=[...x.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)].map(a=>clean(a[1])); return {id,title:tag(x,'title'),authors,year:Number(tag(x,'published').slice(0,4)),abstract:tag(x,'summary'),concepts:[...x.matchAll(/<category[^>]+term="([^"]+)"/g)].map(a=>a[1]),citedByCount:0,citedByApiUrl:'',referenceCount:0,referencedWorks:[],metadataProvider:'arXiv',metadataProviders:['arXiv'],sourceType:'arXiv',origin:'external',venue:'arXiv',isOpenAccess:true,pdfUrl:id.replace('/abs/','/pdf/'),landingUrl:id,role:'result'};});
}
async function importWorks(incoming){ const file=path.join(root,'data','works.json'), data=JSON.parse(await fs.readFile(file,'utf8')); const key=w=>(w.landingUrl?.match(/10\.\d{4,9}\/[\w.()/:;-]+/i)||[])[0]?.toLowerCase()||String(w.title||'').toLowerCase().replace(/\W/g,''); const map=new Map(data.works.map(w=>[key(w),w])); incoming.filter(w=>w&&w.title).forEach(w=>{const k=key(w),old=map.get(k);map.set(k,old?{...old,...w,abstract:w.abstract||old.abstract,concepts:[...new Set([...(old.concepts||[]),...(w.concepts||[])])]}:w);}); data.works=[...map.values()]; data.mergedAt=new Date().toISOString(); await fs.copyFile(file,`${file}.bak`).catch(()=>{}); await fs.writeFile(file,JSON.stringify(data,null,2)); await new Promise((resolve,reject)=>{ const p=spawn(process.execPath,['scripts/build-graph.mjs'],{cwd:root}); let stderr='';p.stderr?.on('data',chunk=>stderr+=chunk);p.on('error',reject);p.on('exit',c=>c?reject(new Error(`重新建圖失敗（代碼 ${c}）：${clean(stderr).slice(0,300)}`)):resolve()); }); return data.works.length; }

const server=http.createServer(async(req,res)=>{ try{
  if(req.method==='POST'&&req.url==='/api/keywords'){const b=await body(req);return json(res,200,await expandKeywords(b.papers||[],b.topic||''));}
  if(req.method==='POST'&&req.url==='/api/lookup-work'){const b=await body(req),title=clean(b.title);if(!title)return json(res,400,{error:'缺少論文標題'});const work=await lookupOpenAlex(title,Array.isArray(b.authors)?b.authors:[],b.year);return json(res,200,{work:work&&work.matchScore>=.28?work:null,provider:'OpenAlex'});}
  if(req.method==='POST'&&req.url==='/api/relevance-rubric'){const b=await body(req);if(!clean(b.topic))return json(res,400,{error:'缺少研究題目'});return json(res,200,await buildRubric(clean(b.topic)));}
  if(req.method==='POST'&&req.url==='/api/relevance-score'){const b=await body(req);if(!clean(b.topic)||!b.rubric)return json(res,400,{error:'缺少研究題目或評分表'});return json(res,200,await scoreBatch(clean(b.topic),b.rubric,b.papers||[]));}
  if(req.method==='POST'&&req.url==='/api/relevance-score-local'){const b=await body(req);if(!clean(b.topic)||!b.rubric)return json(res,400,{error:'缺少研究題目或評分表'});return json(res,200,await scoreBatchOllama(clean(b.topic),b.rubric,b.papers||[]));}
  if(req.method==='POST'&&req.url==='/api/ieee-queries'){const b=await body(req);if(!clean(b.topic))return json(res,400,{error:'缺少研究題目'});return json(res,200,await buildIEEEQueries(clean(b.topic),b.core||[],b.expanded||[]));}
  if(req.method==='POST'&&req.url==='/api/search'){ const b=await body(req), q=b.query||'', n=String(Math.min(Number(b.count)||20,50)); const tasks=[]; if(b.sources?.includes('OpenAlex'))tasks.push(searchOpenAlex(q,n)); if(b.sources?.includes('arXiv'))tasks.push(searchArxiv(q,n)); return json(res,200,{works:(await Promise.all(tasks)).flat()}); }
  if(req.method==='POST'&&req.url==='/api/import') return json(res,200,{total:await importWorks((await body(req)).works||[])});
  if(req.method==='POST'&&req.url==='/api/autosave'){const b=await body(req),works=Array.isArray(b.works)?b.works:[];if(!works.length)return json(res,200,{saved:0});return json(res,200,{saved:await importWorks(works),count:works.length});}
  if(req.method==='POST'&&req.url==='/api/save-state'){const b=await body(req);await fs.writeFile(path.join(root,'data','session-state.json'),JSON.stringify({savedAt:new Date().toISOString(),topic:clean(b.topic),nodes:Array.isArray(b.nodes)?b.nodes:[],positions:b.positions||{}},null,2));return json(res,200,{saved:true,nodes:Array.isArray(b.nodes)?b.nodes.length:0});}
  if(req.method==='GET'&&req.url==='/api/backups'){const dir=path.join(root,'backups');const names=await fs.readdir(dir).catch(()=>[]);const files=[];for(const name of names.filter(x=>/^literature-map-backup-.*\.json$/i.test(x))){const stat=await fs.stat(path.join(dir,name));files.push({name,modifiedAt:stat.mtime.toISOString(),size:stat.size});}return json(res,200,{backups:files.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt))});}
  if(req.method==='GET'&&new URL(req.url,'http://local').pathname==='/api/backup-preview'){const name=path.basename(new URL(req.url,'http://local').searchParams.get('name')||'');if(!/^literature-map-backup-.*\.json$/i.test(name))return json(res,400,{error:'備份檔名稱無效'});const backup=JSON.parse(await fs.readFile(path.join(root,'backups',name),'utf8')),graph=backup.graph||{},edges=graph.edges||[];return json(res,200,{name,savedAt:backup.savedAt||null,stats:{literatureCount:(graph.nodes||[]).length,relationCount:edges.length,citationCount:edges.filter(edge=>edge.type==='citation').length}});}
  if(req.method==='POST'&&req.url==='/api/restore-backup'){const b=await body(req),name=path.basename(String(b.name||''));if(!/^literature-map-backup-.*\.json$/i.test(name))return json(res,400,{error:'備份檔名稱無效'});const backup=JSON.parse(await fs.readFile(path.join(root,'backups',name),'utf8'));if(!backup.works?.works||!backup.graph?.nodes)return json(res,400,{error:'備份內容不完整'});const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dir=path.join(root,'backups');await fs.mkdir(dir,{recursive:true});await fs.copyFile(path.join(root,'data','works.json'),path.join(dir,`literature-map-before-restore-${stamp}.json`)).catch(()=>{});await fs.writeFile(path.join(root,'data','works.json'),JSON.stringify(backup.works,null,2));await fs.writeFile(path.join(root,'data','graph.json'),JSON.stringify(backup.graph,null,2));if(backup.sessionState)await fs.writeFile(path.join(root,'data','session-state.json'),JSON.stringify(backup.sessionState,null,2));return json(res,200,{restored:name,nodes:backup.graph.nodes.length,works:backup.works.works.length});}
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname); const target=path.resolve(root,pathname==='/'?'index.html':`.${pathname}`); if(!target.startsWith(root))return json(res,403,{error:'forbidden'}); const data=await fs.readFile(target); res.writeHead(200,{'content-type':mime[path.extname(target)]||'application/octet-stream','cache-control':'no-store'}); res.end(data);
 }catch(error){ if(error.code==='ENOENT')return json(res,404,{error:'找不到資源'}); json(res,500,{error:error.message}); }});
server.listen(port,'127.0.0.1',()=>console.log(`文脈圖譜：http://127.0.0.1:${port}/`));
