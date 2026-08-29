(function(){
'use strict';

const CONFIG={
  version:'7.3.35-vector-audit-2-wasm',
  live_enabled:false,
  transformers_url:'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0',
  model:'Xenova/multilingual-e5-small',
  dtype:'q8',
  query_prefix:'query: ',
  texts_url:'./vector_service_texts.json',
  vectors_url:'./vector_service_vectors.json',
  audit_url:'./vector_audit_cases.json',
  embedding_dim:384,
  // Provisional only. Final values must be calibrated from the browser audit before live enable.
  min_score:0.86,
  min_margin:0.035,
  max_candidates:5
};

let modulePromise=null;
let extractorPromise=null;
let textsPromise=null;
let vectorsPromise=null;
let lastLoadInfo=null;

function now(){return typeof performance!=='undefined'?performance.now():Date.now();}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function normalizeText(x){return String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ');}

async function fetchJson(url,required=true){
  try{
    const res=await fetch(url+(url.includes('?')?'&':'?')+'v='+encodeURIComponent(CONFIG.version),{cache:'no-store'});
    if(!res.ok){if(!required)return null;throw new Error(`${url} HTTP ${res.status}`);}
    return await res.json();
  }catch(e){if(!required)return null;throw e;}
}

async function loadTransformers(){
  if(!modulePromise)modulePromise=import(CONFIG.transformers_url);
  return modulePromise;
}

async function createExtractor(){
  // Build/audit is intentionally WASM-only. WebGPU is an optional production
  // acceleration path and must never be required to generate/calibrate vectors.
  // This also avoids contaminating ONNX Runtime's backend init chain when a
  // browser exposes navigator.gpu but requestAdapter() still fails.
  const {pipeline,env}=await loadTransformers();
  try{
    if(env?.backends?.onnx?.wasm){
      // Prefer the broadly-compatible browser CPU backend for this one-time build.
      // Keep the CDN-hosted WASM binaries selected by Transformers.js itself.
      if('proxy' in env.backends.onnx.wasm) env.backends.onnx.wasm.proxy=false;
    }
  }catch(_){/* environment tuning is best-effort only */}

  const opts={device:'wasm',dtype:CONFIG.dtype};
  const t=now();
  try{
    const pipe=await pipeline('feature-extraction',CONFIG.model,opts);
    lastLoadInfo={model:CONFIG.model,backend:'wasm',opts,load_ms:Math.round(now()-t)};
    return pipe;
  }catch(e){
    const detail=String(e?.stack||e?.message||e);
    throw new Error('vector_wasm_model_load_failed: '+detail);
  }
}

async function getExtractor(){
  if(!extractorPromise)extractorPromise=createExtractor().catch(e=>{extractorPromise=null;throw e;});
  return extractorPromise;
}

async function loadTexts(){
  if(!textsPromise)textsPromise=fetchJson(CONFIG.texts_url,true).then(d=>{
    if(!d||!Array.isArray(d.services)||d.services.length!==413)throw new Error('vector_texts_invalid');
    return d;
  });
  return textsPromise;
}

function bytesToBase64(bytes){
  let out='';const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(out);
}
function base64ToBytes(s){
  const bin=atob(s);const out=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
function round6(x){return Math.round(x*1e6)/1e6;}

async function embedTexts(texts,{prefix=''}={}){
  const clean=(Array.isArray(texts)?texts:[texts]).map(x=>prefix+normalizeText(x));
  const extractor=await getExtractor();
  const output=await extractor(clean,{pooling:'mean',normalize:true});
  const dims=output.dims||[];
  const dim=dims[dims.length-1]||CONFIG.embedding_dim;
  const rows=dims.length>=2?dims[0]:1;
  const raw=output.data;
  const result=[];
  for(let r=0;r<rows;r++)result.push(Float32Array.from(raw.slice(r*dim,(r+1)*dim)));
  return result;
}

async function sha256Text(text){
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

async function buildStaticVectors({batch_size=12,on_progress=null}={}){
  const texts=await loadTexts();
  const rows=texts.services;
  const dim=CONFIG.embedding_dim;
  const packed=new Int8Array(rows.length*dim);
  const norms=new Float32Array(rows.length);
  const t0=now();
  for(let i=0;i<rows.length;i+=batch_size){
    const batch=rows.slice(i,i+batch_size);
    const vecs=await embedTexts(batch.map(x=>x.text));
    if(vecs.length!==batch.length)throw new Error('vector_batch_shape_mismatch');
    for(let j=0;j<vecs.length;j++){
      const v=vecs[j];if(v.length!==dim)throw new Error(`vector_dim_${v.length}`);
      let norm2=0;const base=(i+j)*dim;
      for(let k=0;k<dim;k++){
        const q=clamp(Math.round(v[k]*127),-127,127);
        packed[base+k]=q;const f=q/127;norm2+=f*f;
      }
      norms[i+j]=Math.sqrt(norm2)||1;
    }
    if(typeof on_progress==='function')on_progress({done:Math.min(i+batch.length,rows.length),total:rows.length,elapsed_ms:Math.round(now()-t0)});
    await new Promise(r=>setTimeout(r,0));
  }
  const sourceText=JSON.stringify(texts);
  return {
    schema_version:1,
    vector_version:CONFIG.version,
    created_at:new Date().toISOString(),
    model:CONFIG.model,
    dtype:CONFIG.dtype,
    pooling:'mean',
    normalized:true,
    quantization:'int8_per_component_scale_127',
    embedding_dim:dim,
    service_count:rows.length,
    service_ids:rows.map(x=>x.id),
    service_norms:[...norms].map(round6),
    vector_data_base64:bytesToBase64(new Uint8Array(packed.buffer)),
    source_texts_sha256:await sha256Text(sourceText),
    build_ms:Math.round(now()-t0),
    model_load:lastLoadInfo
  };
}

function decodeStaticVectors(doc){
  if(!doc||doc.embedding_dim!==CONFIG.embedding_dim||!Array.isArray(doc.service_ids)||!doc.vector_data_base64)throw new Error('vector_file_invalid');
  const bytes=base64ToBytes(doc.vector_data_base64);
  const packed=new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(packed.length!==doc.service_ids.length*doc.embedding_dim)throw new Error('vector_file_shape_mismatch');
  const norms=Float32Array.from(doc.service_norms||[]);
  if(norms.length!==doc.service_ids.length)throw new Error('vector_norm_shape_mismatch');
  return {...doc,packed,norms};
}

async function loadStaticVectors({required=false}={}){
  if(!vectorsPromise)vectorsPromise=fetchJson(CONFIG.vectors_url,required).then(d=>d?decodeStaticVectors(d):null).catch(e=>{vectorsPromise=null;if(required)throw e;return null;});
  return vectorsPromise;
}

function rankWithQueryVector(queryVector,store,{exclude_ids=[]}={}){
  const exclude=new Set(exclude_ids||[]);const dim=store.embedding_dim;const scored=[];
  for(let i=0;i<store.service_ids.length;i++){
    const id=store.service_ids[i];if(exclude.has(id))continue;
    const base=i*dim;let dot=0;
    for(let k=0;k<dim;k++)dot+=queryVector[k]*(store.packed[base+k]/127);
    const score=dot/(store.norms[i]||1);
    scored.push({id,score});
  }
  scored.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return scored.slice(0,CONFIG.max_candidates).map((x,i)=>({...x,rank:i+1}));
}

function decisionFromRanked(ranked){
  const first=ranked[0]||null,second=ranked[1]||null;
  const margin=first&&second?first.score-second.score:null;
  const accepted=Boolean(first&&first.score>=CONFIG.min_score&&(margin==null||margin>=CONFIG.min_margin));
  return {accepted,service_id:accepted?first.id:null,score:first?.score??null,margin,top:ranked};
}

async function rankQuery(query,{exclude_ids=[]}={}){
  const store=await loadStaticVectors({required:false});
  if(!store)return {available:false,reason:'static_vectors_unavailable',query,top:[]};
  const [qv]=await embedTexts([query],{prefix:CONFIG.query_prefix});
  const ranked=rankWithQueryVector(qv,store,{exclude_ids});
  return {available:true,query,...decisionFromRanked(ranked)};
}

async function resolveClauses(clauses,{locked_ids=[],max_add=5}={}){
  if(!CONFIG.live_enabled)return {available:false,reason:'vector_live_disabled',matches:[],unresolved_clauses:[...(clauses||[])]};
  const store=await loadStaticVectors({required:false});
  if(!store)return {available:false,reason:'static_vectors_unavailable',matches:[],unresolved_clauses:[...(clauses||[])]};
  const locked=new Set(locked_ids||[]);const matches=[];const unresolved=[];
  for(const raw of (clauses||[]).slice(0,5)){
    if(matches.length>=max_add){unresolved.push(raw);continue;}
    const query=normalizeText(raw);if(!query)continue;
    const [qv]=await embedTexts([query],{prefix:CONFIG.query_prefix});
    const ranked=rankWithQueryVector(qv,store,{exclude_ids:[...locked]});
    const d=decisionFromRanked(ranked);
    if(d.accepted&&d.service_id&&!locked.has(d.service_id)){
      locked.add(d.service_id);matches.push({clause:raw,service_id:d.service_id,score:d.score,margin:d.margin,top:d.top});
    }else unresolved.push(raw);
  }
  return {available:true,matches,unresolved_clauses:unresolved};
}

async function evaluateAudit({vectors_doc=null,on_progress=null}={}){
  const store=vectors_doc?decodeStaticVectors(vectors_doc):await loadStaticVectors({required:true});
  const audit=await fetchJson(CONFIG.audit_url,true);const cases=audit.cases||[];const results=[];const t0=now();
  for(let i=0;i<cases.length;i++){
    const c=cases[i];const [qv]=await embedTexts([c.query],{prefix:CONFIG.query_prefix});
    const top=rankWithQueryVector(qv,store,{});const d=decisionFromRanked(top);
    const top1=top[0]?.id||null;
    const expected=c.expected_id||null;
    const forbidden=(c.forbidden_ids||[]);
    results.push({...c,top,score:d.score,margin:d.margin,provisional_accepted:d.accepted,top1,top1_correct:expected?top1===expected:null,forbidden_top1:forbidden.includes(top1)});
    if(typeof on_progress==='function')on_progress({done:i+1,total:cases.length,elapsed_ms:Math.round(now()-t0),case_id:c.id});
    await new Promise(r=>setTimeout(r,0));
  }
  const positives=results.filter(x=>x.type==='positive');const abstain=results.filter(x=>x.type==='abstain');
  const sortedPosScores=positives.map(x=>x.score).filter(Number.isFinite).sort((a,b)=>a-b);
  const sortedMargins=positives.map(x=>x.margin).filter(Number.isFinite).sort((a,b)=>a-b);
  return {
    schema_version:1,vector_version:CONFIG.version,created_at:new Date().toISOString(),model:CONFIG.model,model_load:lastLoadInfo,
    provisional_thresholds:{min_score:CONFIG.min_score,min_margin:CONFIG.min_margin},
    summary:{
      total:results.length,positives:positives.length,abstain:abstain.length,
      positive_top1_correct:positives.filter(x=>x.top1_correct).length,
      positive_forbidden_top1:positives.filter(x=>x.forbidden_top1).length,
      positive_provisional_accept_correct:positives.filter(x=>x.provisional_accepted&&x.top1_correct).length,
      positive_provisional_accept_wrong:positives.filter(x=>x.provisional_accepted&&!x.top1_correct).length,
      abstain_provisional_rejected:abstain.filter(x=>!x.provisional_accepted).length,
      min_positive_score:sortedPosScores[0]??null,
      min_positive_margin:sortedMargins[0]??null
    },
    results
  };
}

function downloadJson(doc,filename){
  const blob=new Blob([JSON.stringify(doc)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}

function setLiveEnabled(value){CONFIG.live_enabled=Boolean(value);return CONFIG.live_enabled;}
function resetCaches(){extractorPromise=null;modulePromise=null;textsPromise=null;vectorsPromise=null;lastLoadInfo=null;}

globalThis.EodigaVector={
  config:CONFIG,
  get liveEnabled(){return CONFIG.live_enabled;},
  setLiveEnabled,
  rankQuery,
  resolveClauses,
  loadStaticVectors,
  buildStaticVectors,
  evaluateAudit,
  downloadJson,
  resetCaches,
  debug(){return {config:{...CONFIG},lastLoadInfo};}
};
})();
