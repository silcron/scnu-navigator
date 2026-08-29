(function(){
'use strict';

const CONFIG={
  version:'7.3.35-vector-audit-6-boundary-precedence',
  live_enabled:false,
  transformers_url:'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0',
  model:'Xenova/multilingual-e5-small',
  dtype:'q8',
  query_prefix:'query: ',
  prototypes_url:'./vector_service_prototypes.json',
  vectors_url:'./vector_service_vectors_v6.json',
  audit_url:'./vector_audit_cases_v6.json',
  embedding_dim:384,
  // Still provisional. v3 changes the score function, so final thresholds must
  // be selected from the new audit rather than copied from v2.
  min_score:0.92,
  min_margin:0.01,
  max_candidates:5,
  required_group_bonus:0.012,
  excluded_kinds:['organization_registry','academic_directory','academic_directory_general'],
  kind_bias:{workflow:0.004,official_route:0.0,department_route:-0.003}
};

let modulePromise=null;
let extractorPromise=null;
let prototypesPromise=null;
let vectorsPromise=null;
let lastLoadInfo=null;

function now(){return typeof performance!=='undefined'?performance.now():Date.now();}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function normalizeText(x){return String(x||'').normalize('NFKC').trim().replace(/\s+/g,' ');}
function normLower(x){return normalizeText(x).toLocaleLowerCase('ko-KR');}
function round6(x){return Math.round(x*1e6)/1e6;}

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
  const {pipeline,env}=await loadTransformers();
  try{
    if(env?.backends?.onnx?.wasm && 'proxy' in env.backends.onnx.wasm) env.backends.onnx.wasm.proxy=false;
  }catch(_){}
  const opts={device:'wasm',dtype:CONFIG.dtype};
  const t=now();
  try{
    const pipe=await pipeline('feature-extraction',CONFIG.model,opts);
    lastLoadInfo={model:CONFIG.model,backend:'wasm',opts,load_ms:Math.round(now()-t)};
    return pipe;
  }catch(e){
    throw new Error('vector_wasm_model_load_failed: '+String(e?.stack||e?.message||e));
  }
}
async function getExtractor(){
  if(!extractorPromise)extractorPromise=createExtractor().catch(e=>{extractorPromise=null;throw e;});
  return extractorPromise;
}
async function loadPrototypes(){
  if(!prototypesPromise)prototypesPromise=fetchJson(CONFIG.prototypes_url,true).then(d=>{
    if(!d||!Array.isArray(d.services)||d.services.length!==413)throw new Error('vector_prototypes_invalid');
    if(!Number.isInteger(d.prototype_count)||d.prototype_count<413)throw new Error('vector_prototype_count_invalid');
    return d;
  });
  return prototypesPromise;
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

async function buildStaticVectors({batch_size=16,on_progress=null}={}){
  const doc=await loadPrototypes();
  const serviceIds=doc.services.map(x=>x.id);
  const flat=[];
  doc.services.forEach((s,serviceIndex)=>{
    (s.prototypes||[]).forEach(p=>flat.push({
      service_index:serviceIndex,
      service_id:s.id,
      type:p.type||'prototype',
      weight:Number.isFinite(+p.weight)?+p.weight:1,
      text:p.text
    }));
  });
  if(flat.length!==doc.prototype_count)throw new Error(`prototype_count_mismatch_${flat.length}_${doc.prototype_count}`);
  const dim=CONFIG.embedding_dim;
  const packed=new Int8Array(flat.length*dim);
  const norms=new Float32Array(flat.length);
  const protoServiceIndices=new Uint16Array(flat.length);
  const protoWeights=new Float32Array(flat.length);
  const protoTypes=[];
  const t0=now();

  for(let i=0;i<flat.length;i+=batch_size){
    const batch=flat.slice(i,i+batch_size);
    const vecs=await embedTexts(batch.map(x=>x.text));
    if(vecs.length!==batch.length)throw new Error('vector_batch_shape_mismatch');
    for(let j=0;j<vecs.length;j++){
      const idx=i+j,v=vecs[j]; if(v.length!==dim)throw new Error(`vector_dim_${v.length}`);
      let norm2=0; const base=idx*dim;
      for(let k=0;k<dim;k++){
        const q=clamp(Math.round(v[k]*127),-127,127);
        packed[base+k]=q; const f=q/127; norm2+=f*f;
      }
      norms[idx]=Math.sqrt(norm2)||1;
      protoServiceIndices[idx]=batch[j].service_index;
      protoWeights[idx]=batch[j].weight;
      protoTypes[idx]=batch[j].type;
    }
    if(typeof on_progress==='function')on_progress({
      done:Math.min(i+batch.length,flat.length),total:flat.length,
      services:serviceIds.length,elapsed_ms:Math.round(now()-t0)
    });
    await new Promise(r=>setTimeout(r,0));
  }

  return {
    schema_version:2,
    vector_version:CONFIG.version,
    created_at:new Date().toISOString(),
    model:CONFIG.model,dtype:CONFIG.dtype,pooling:'mean',normalized:true,
    quantization:'int8_per_component_scale_127',
    embedding_dim:dim,
    service_count:serviceIds.length,
    prototype_count:flat.length,
    service_ids:serviceIds,
    service_kinds:doc.services.map(x=>x.kind||''),
    service_policies:doc.services.map(x=>x.policy||{}),
    prototype_service_indices:[...protoServiceIndices],
    prototype_weights:[...protoWeights].map(round6),
    prototype_types:protoTypes,
    prototype_norms:[...norms].map(round6),
    vector_data_base64:bytesToBase64(new Uint8Array(packed.buffer)),
    source_prototypes_sha256:await sha256Text(JSON.stringify(doc)),
    build_ms:Math.round(now()-t0),
    model_load:lastLoadInfo
  };
}

function decodeStaticVectors(doc){
  if(!doc||!Number.isInteger(doc.schema_version)||doc.schema_version<2||doc.embedding_dim!==CONFIG.embedding_dim||
     !Array.isArray(doc.service_ids)||!Array.isArray(doc.prototype_service_indices)||
     !doc.vector_data_base64) throw new Error('vector_file_invalid');
  const bytes=base64ToBytes(doc.vector_data_base64);
  const packed=new Int8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(packed.length!==doc.prototype_count*doc.embedding_dim)throw new Error('vector_file_shape_mismatch');
  const norms=Float32Array.from(doc.prototype_norms||[]);
  const weights=Float32Array.from(doc.prototype_weights||[]);
  if(norms.length!==doc.prototype_count||weights.length!==doc.prototype_count)throw new Error('vector_proto_meta_shape_mismatch');
  if(doc.prototype_service_indices.length!==doc.prototype_count)throw new Error('vector_proto_index_shape_mismatch');
  return {...doc,packed,norms,weights};
}
async function loadStaticVectors({required=false}={}){
  if(!vectorsPromise)vectorsPromise=fetchJson(CONFIG.vectors_url,required)
    .then(d=>d?decodeStaticVectors(d):null)
    .catch(e=>{vectorsPromise=null;if(required)throw e;return null;});
  return vectorsPromise;
}

function includesAny(q,terms){
  return (terms||[]).some(t=>q.includes(normLower(t)));
}
function candidateAllowed(queryNorm,serviceIndex,store){
  const kind=store.service_kinds?.[serviceIndex]||'';
  if(CONFIG.excluded_kinds.includes(kind))return false;
  const p=store.service_policies?.[serviceIndex]||{};
  if(Array.isArray(p.required_any)&&p.required_any.length&&!includesAny(queryNorm,p.required_any))return false;
  if(Array.isArray(p.required_groups)&&p.required_groups.length){
    for(const group of p.required_groups){
      if(Array.isArray(group)&&group.length&&!includesAny(queryNorm,group))return false;
    }
  }
  if(Array.isArray(p.forbidden_any)&&p.forbidden_any.length&&includesAny(queryNorm,p.forbidden_any))return false;
  return true;
}
function policyMatchBonus(queryNorm,serviceIndex,store){
  const p=store.service_policies?.[serviceIndex]||{};
  let bonus=0;
  if(Array.isArray(p.required_groups)&&p.required_groups.length){
    let matched=0;
    for(const group of p.required_groups){
      if(Array.isArray(group)&&group.length&&includesAny(queryNorm,group))matched++;
    }
    bonus+=matched*CONFIG.required_group_bonus;
  }
  if(Array.isArray(p.conditional_groups)&&p.conditional_groups.length){
    const allMatched=p.conditional_groups.every(group=>Array.isArray(group)&&group.length&&includesAny(queryNorm,group));
    if(allMatched)bonus+=Number.isFinite(+p.conditional_bonus)?+p.conditional_bonus:0;
  }
  return bonus;
}
function kindBias(kind){
  const x=CONFIG.kind_bias?.[kind];
  return Number.isFinite(x)?x:0;
}

function rankWithQueryVector(query,queryVector,store,{exclude_ids=[]}={}){
  const exclude=new Set(exclude_ids||[]);
  const q=normLower(query);
  const dim=store.embedding_dim;
  const best=new Map();

  for(let pi=0;pi<store.prototype_count;pi++){
    const si=store.prototype_service_indices[pi];
    const sourceId=store.service_ids[si];
    if(!candidateAllowed(q,si,store))continue;
    const policy=store.service_policies?.[si]||{};
    const targetId=policy.redirect_to||sourceId;
    if(exclude.has(targetId))continue;

    const base=pi*dim;let dot=0;
    for(let k=0;k<dim;k++)dot+=queryVector[k]*(store.packed[base+k]/127);
    const raw=dot/(store.norms[pi]||1);
    const weighted=raw*(store.weights[pi]||1);
    const adjusted=weighted+kindBias(store.service_kinds?.[si]||'')+policyMatchBonus(q,si,store);

    const prev=best.get(targetId);
    if(!prev||adjusted>prev.score){
      best.set(targetId,{
        id:targetId,score:adjusted,raw_score:raw,
        prototype_weight:store.weights[pi]||1,
        prototype_type:store.prototype_types?.[pi]||null,
        source_service_id:sourceId
      });
    }
  }
  const scored=[...best.values()];
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
  const ranked=rankWithQueryVector(query,qv,store,{exclude_ids});
  return {available:true,query,...decisionFromRanked(ranked)};
}
async function resolveClauses(clauses,{locked_ids=[],max_add=5}={}){
  if(!CONFIG.live_enabled)return {available:false,reason:'vector_live_disabled',matches:[],unresolved_clauses:[...(clauses||[])]};
  const store=await loadStaticVectors({required:false});
  if(!store)return {available:false,reason:'static_vectors_unavailable',matches:[],unresolved_clauses:[...(clauses||[])]};
  const locked=new Set(locked_ids||[]),matches=[],unresolved=[];
  for(const raw of (clauses||[]).slice(0,5)){
    if(matches.length>=max_add){unresolved.push(raw);continue;}
    const query=normalizeText(raw); if(!query)continue;
    const [qv]=await embedTexts([query],{prefix:CONFIG.query_prefix});
    const ranked=rankWithQueryVector(query,qv,store,{exclude_ids:[...locked]});
    const d=decisionFromRanked(ranked);
    if(d.accepted&&d.service_id&&!locked.has(d.service_id)){
      locked.add(d.service_id);
      matches.push({clause:raw,service_id:d.service_id,score:d.score,margin:d.margin,top:d.top});
    }else unresolved.push(raw);
  }
  return {available:true,matches,unresolved_clauses:unresolved};
}

function summarize(results){
  const positives=results.filter(x=>x.type==='positive'), abstain=results.filter(x=>x.type==='abstain');
  const top1=positives.filter(x=>x.top1_correct).length;
  const expectedInTop5=positives.filter(x=>x.expected_rank!=null).length;
  const forbidden=positives.filter(x=>x.forbidden_top1).length;
  return {
    total:results.length,positives:positives.length,abstain:abstain.length,
    positive_top1_correct:top1,
    positive_expected_in_top5:expectedInTop5,
    positive_forbidden_top1:forbidden,
    positive_provisional_accept_correct:positives.filter(x=>x.provisional_accepted&&x.top1_correct).length,
    positive_provisional_accept_wrong:positives.filter(x=>x.provisional_accepted&&!x.top1_correct).length,
    abstain_provisional_rejected:abstain.filter(x=>!x.provisional_accepted).length,
    min_positive_score:positives.length?Math.min(...positives.map(x=>x.score).filter(Number.isFinite)):null,
    min_positive_margin:positives.length?Math.min(...positives.map(x=>x.margin).filter(Number.isFinite)):null
  };
}

function thresholdReport(results,score,margin){
  const accepted=results.filter(x=>Number.isFinite(x.score)&&x.score>=score&&(x.margin==null||x.margin>=margin));
  const correct=accepted.filter(x=>x.type==='positive'&&x.top1_correct).length;
  const wrongPositive=accepted.filter(x=>x.type==='positive'&&!x.top1_correct).length;
  const wrongAbstain=accepted.filter(x=>x.type==='abstain').length;
  return {min_score:score,min_margin:margin,accepted:accepted.length,correct,wrong_positive:wrongPositive,wrong_abstain:wrongAbstain};
}
function thresholdSweep(results){
  return [
    thresholdReport(results,0.86,0.035),
    thresholdReport(results,0.92,0.01),
    thresholdReport(results,0.925,0.01),
    thresholdReport(results,0.93,0.0),
    thresholdReport(results,0.94,0.0)
  ];
}

async function evaluateAudit({vectors_doc=null,on_progress=null}={}){
  const store=vectors_doc?decodeStaticVectors(vectors_doc):await loadStaticVectors({required:true});
  const audit=await fetchJson(CONFIG.audit_url,true);
  const cases=audit.cases||[],results=[],t0=now();
  for(let i=0;i<cases.length;i++){
    const c=cases[i],[qv]=await embedTexts([c.query],{prefix:CONFIG.query_prefix});
    const top=rankWithQueryVector(c.query,qv,store,{});
    const d=decisionFromRanked(top),top1=top[0]?.id||null,expected=c.expected_id||null;
    const expectedRank=expected?(top.find(x=>x.id===expected)?.rank??null):null;
    results.push({...c,top,score:d.score,margin:d.margin,provisional_accepted:d.accepted,top1,
      expected_rank:expectedRank,top1_correct:expected?top1===expected:null,
      forbidden_top1:(c.forbidden_ids||[]).includes(top1)});
    if(typeof on_progress==='function')on_progress({done:i+1,total:cases.length,elapsed_ms:Math.round(now()-t0),case_id:c.id});
    await new Promise(r=>setTimeout(r,0));
  }
  const n0=Number(audit.original_case_count||0);
  const nV3=Number(audit.v3_case_count||0);
  const nV4=Number(audit.v4_case_count||0);
  const nV5=Number(audit.v5_case_count||0);
  return {
    schema_version:6,vector_version:CONFIG.version,created_at:new Date().toISOString(),model:CONFIG.model,model_load:lastLoadInfo,
    provisional_thresholds:{min_score:CONFIG.min_score,min_margin:CONFIG.min_margin,required_group_bonus:CONFIG.required_group_bonus},
    summary:summarize(results),
    original_39_summary:n0?summarize(results.slice(0,n0)):null,
    v3_72_summary:nV3?summarize(results.slice(0,nV3)):null,
    v4_104_summary:nV4?summarize(results.slice(0,nV4)):null,
    v5_122_summary:nV5?summarize(results.slice(0,nV5)):null,
    v6_stress_summary:nV5?summarize(results.slice(nV5)):null,
    threshold_sweep:thresholdSweep(results),
    results
  };
}
function downloadJson(doc,filename){
  const blob=new Blob([JSON.stringify(doc)],{type:'application/json'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=filename;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);
}
function setLiveEnabled(value){CONFIG.live_enabled=Boolean(value);return CONFIG.live_enabled;}
function resetCaches(){extractorPromise=null;modulePromise=null;prototypesPromise=null;vectorsPromise=null;lastLoadInfo=null;}

globalThis.EodigaVector={
  config:CONFIG,get liveEnabled(){return CONFIG.live_enabled;},setLiveEnabled,
  rankQuery,resolveClauses,loadStaticVectors,buildStaticVectors,evaluateAudit,downloadJson,resetCaches,
  debug(){return {config:{...CONFIG},lastLoadInfo};}
};
})();