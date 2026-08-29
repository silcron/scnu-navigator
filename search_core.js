(function(root){
'use strict';
const N=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,'');
const S=s=>String(s||'').normalize('NFKC').toLowerCase();
const has=(q,...xs)=>xs.some(x=>N(q).includes(N(x)));
const svc=(services,id)=>services.find(s=>s.id===id)||null;
const answer=(services,ids,reason='p0_resolver',meta={})=>{
 const raw=ids.map((id,i)=>({service:svc(services,id),score:10000-i})).filter(x=>x.service);
 const out=[],groupIndex=new Map();
 for(const item of raw){
   const s=item.service,group=s.canonical_id||s.intent_group||s.id;
   if(!groupIndex.has(group)){groupIndex.set(group,out.length);out.push(item);continue;}
   // If two catalog records represent the same administrative intent, keep one card.
   // Prefer the record whose id is the canonical group id when it is present.
   const idx=groupIndex.get(group),prev=out[idx];
   if(s.id===group&&prev?.service?.id!==group)out[idx]={...item,score:prev.score};
 }
 return {status:'answer',items:out,reason,...meta};
};
const multiAnswer=(services,ids,reason='multi_intent',meta={})=>{const unique=[...new Set(ids.filter(Boolean))];const shown=unique.slice(0,5);return answer(services,shown,reason,{total_intents:unique.length,truncated_count:Math.max(0,unique.length-shown.length),...meta});};
const unknown=(reason='ambiguous')=>({status:'unknown',items:[],reason});

function outsideScnu(q){
  const x=N(q);
  if(!x.includes('전남대')) return false;
  if(x.includes('전남대에서순천대로')) return false;
  if(x.includes('전남대학생인데순천대')) return false;
  return x.includes('전남대휴학')||x.includes('순천대말고전남대')||x.includes('순천대에서전남대로');
}
function highRiskSingle(q,services){
  const n=N(q), raw=S(q);
  if(outsideScnu(q)) return unknown('out_of_scope_other_university');
  if((has(q,'한국인')&&!has(q,'외국인'))&&has(q,'비자')) return unknown('role_mismatch');
  if(has(q,'교직원')&&has(q,'재직증명서')) return unknown('role_mismatch');
  if(has(q,'휴학')&&has(q,'국가장학금')&&(has(q,'하면','받을수','받을 수'))) return unknown('unresolved_relation');
  if((n==='인터넷안돼요'||n==='인터넷안돼'||/인터넷안돼/.test(n))&&!(/학교\s*인터넷|교내|강의실|기숙사|생활관/.test(S(q)))) return unknown('ambiguous_location');
  if((n==='프린터안돼요'||n==='프린터안돼'||/프린터안돼/.test(n))&&!(/학교\s*프린터|교내|강의실|기숙사|생활관/.test(S(q)))) return unknown('ambiguous_location');
  if(n==='회계담당자'||n==='사회복지지원') return unknown('ambiguous_term');
  if(n==='우산대여'||n==='노트북대여') return unknown('unsupported_item');
  if(has(q,'연애상담')&&!has(q,'학교상담센터','학생상담센터')) return unknown('out_of_scope_general_advice');
  if((has(q,'자소서')&&has(q,'써줘'))||(has(q,'면접')&&has(q,'답변')&&has(q,'만들어'))) return unknown('generation_not_routing');
  if(has(q,'등록금')&&has(q,'비싸')) return unknown('no_action');
  if(has(q,'성적')&&has(q,'잘받는법','잘 받는 법')) return unknown('no_action');
  if(has(q,'시험')&&has(q,'어려')) return unknown('no_action');
  if(has(q,'맛집')) return unknown('out_of_scope');
  if(has(q,'빛나는별')) return unknown('out_of_scope');

  const rules=[
    ['dorm_emergency_guide', q=>has(q,'기숙사','생활관')&&has(q,'화재','불났','연기')],
    ['health_emergency', q=>has(q,'심정지','의식을잃','의식잃','쓰러졌','쓰러짐')],
    ['personal_counsel', q=>has(q,'자살생각','죽는생각','죽고싶','목숨끊')],
    ['health_clinic', q=>has(q,'보건소')&&!has(q,'순천시보건소','시청보건소')],
    ['health_clinic', q=>has(q,'보건실','보건진료실')&&has(q,'아파','아프','머리')],
    ['cert_leave', q=>has(q,'휴학증명서','휴학증명')],
    ['cert_course_list', q=>has(q,'수강신청')&&has(q,'내역','확인서')&&has(q,'발급','증명')],
    ['seasonal_fee', q=>has(q,'계절학기')&&has(q,'수강료','돈','납부','내고')],
    ['grade_correction_period', q=>has(q,'성적')&&has(q,'이의','정정','잘못')],
    ['leave_extension', q=>has(q,'휴학')&&has(q,'연장','늘리','더쉬','더 쉬','기간더')],
    ['leave_course_registration_effect', q=>has(q,'휴학')&&has(q,'수강신청')&&has(q,'어떻게돼','어떻게 돼','처리','과목')],
    ['return_course_before_status', q=>has(q,'복학')&&has(q,'수강신청')&&has(q,'전','전에','처리전','처리 전','먼저')],
    ['route_dorm_refund_card', q=>has(q,'기숙사비','생활관비','기숙사','생활관')&&has(q,'환불','반환')],
    ['double_major_cancel', q=>has(q,'복수전공','복전')&&has(q,'그만','포기','취소')],
    ['major_transfer_cancel', q=>has(q,'전과')&&has(q,'허가','승인','합격')&&has(q,'취소','되돌')],
    ['military_return', q=>has(q,'군휴학')&&has(q,'복학')&&!has(q,'전역전','제대전')],
    ['return', q=>has(q,'휴학했다가','휴학후','휴학 후')&&has(q,'복학')],
    ['military_leave_grade_recognition', q=>has(q,'군휴학')&&has(q,'성적','학점')],
    ['leave_military', q=>((has(q,'군대','입대','입영')&&(/학교(는|를|생활)?.{0,12}어떻게/.test(S(q)))&&!has(q,'일반휴학','휴학중','휴학 중'))||has(q,'군휴학','병역휴학'))],
    ['return_before_discharge', q=>has(q,'전역전','제대전','아직전역')&&has(q,'복학','학교복귀','학교 복귀')],
    ['leave_convert_to_military', q=>has(q,'일반휴학','휴학중','휴학 중')&&has(q,'입대','입영','군대')],
    ['graduation_while_on_leave', q=>has(q,'휴학')&&has(q,'졸업')],
    ['leave_proxy_application', q=>has(q,'부모님','보호자','대리')&&has(q,'휴학')],
    ['major_transfer_credit_requirement', q=>has(q,'전과')&&has(q,'몇학점','몇 학점','이수해야')],
    ['transfer_duplicate_course', q=>has(q,'편입','전적대')&&has(q,'인정')&&has(q,'재수강','중복')],
    ['student_loan', q=>has(q,'학자금대출')||((has(q,'등록금','학비')&&has(q,'빌리','대출','낼돈','낼 돈')))],
    ['teacher_cert_reissue', q=>has(q,'교원자격증','교사자격증')&&has(q,'잃어','분실','재발급')],
    ['route_it_network', q=>(has(q,'강의실','교내')||/학교\s*(인터넷|이메일)/.test(S(q)))&&has(q,'인터넷','이메일')&&has(q,'안돼','오류','로그인')],
    ['withdrawal', q=>has(q,'자퇴')&&has(q,'싶','신청')],
    ['dorm_hvac', q=>has(q,'기숙사','생활관','긱사')&&has(q,'온수','냉방','난방','에어컨')&&!has(q,'고장','안돼','문제','신고')&&has(q,'24시간','시간','언제','운영','나와','나오','켜','기간')],
    ['dorm_facility_report_board', q=>has(q,'기숙사','생활관','긱사')&&has(q,'에어컨','전기','시설','온수','난방')&&has(q,'고장','안돼','문제')],
    ['dorm_counsel', q=>has(q,'기숙사','생활관')&&has(q,'룸메','룸메이트')&&has(q,'상담','싸워')],
    ['health_loan', q=>has(q,'목발')&&has(q,'대여','빌리')],
    ['student_insurance', q=>has(q,'학교','교내')&&has(q,'다쳐','부상','사고')&&has(q,'보험','보상','청구')],
    ['office365', q=>has(q,'microsoft','ms365','office365','오피스365','엑셀무료','엑셀 무료')],
    ['google_workspace', q=>has(q,'googleworkspace','구글워크스페이스','구글드라이브','google drive')],
    ['student_email', q=>has(q,'학교이메일','학생이메일','학교 이메일','학생 이메일')&&has(q,'만들','생성','필요')],
    ['route_research_rcms', q=>has(q,'rcms')],
    ['research_rd_notice', q=>has(q,'r&d','연구개발')&&has(q,'사업','문의','공고')],
    ['ai_bootcamp_platforms', q=>has(q,'aura','a.u.r.a')],
    ['maker_3d_printer', q=>has(q,'3d프린터','3d 프린터')],
    ['ecampus', q=>has(q,'e-campus','ecampus','e캠','이캠')],
    ['route_intl_foreign_admission', q=>has(q,'gks')],
    ['route_admin_civil_defense', q=>has(q,'예비군','민방위')],
    ['route_fac_network_line', q=>has(q,'랜포트','랜선포트','lan포트')],
    ['route_fac_fire', q=>has(q,'소화기','소방시설')],
    ['school_vehicle', q=>has(q,'학교차량')||((has(q,'통학버스','버스')&&has(q,'빌리','대절','행사','견학')))],
    ['retake', q=>has(q,'재이수')&&!has(q,'폐지')],
    ['route_nonfaculty_recruitment', q=>has(q,'비전임교원')&&has(q,'채용')],
    ['route_faculty_recruitment', q=>has(q,'전임교원')&&has(q,'채용')&&!has(q,'비전임')],
    ['route_it_pc_printer', q=>(has(q,'교내','강의실')||/학교\s*프린터/.test(S(q)))&&has(q,'프린터')&&has(q,'안돼','고장','오류')],
    ['resume', q=>has(q,'자소서','자기소개서','이력서')&&has(q,'첨삭','검토','클리닉')],
    ['interview', q=>has(q,'면접')&&has(q,'연습','모의','코칭','클리닉')],
    ['student_id_reissue', q=>has(q,'학생증','신분증')&&has(q,'잃어','분실','재발급')],
    ['shuttle_reserve', q=>has(q,'통학버스','셔틀')&&has(q,'예약')],
    ['tuition_check', q=>has(q,'등록금')&&has(q,'냈는지','납부확인','납부 확인')],
    ['tuition_installment', q=>has(q,'등록금')&&has(q,'분납','분할납부')],
    ['cert_scholarship', q=>has(q,'장학금')&&has(q,'수혜')&&has(q,'확인서','증명')],
    ['dorm_room_assignment', q=>has(q,'기숙사','생활관')&&has(q,'호실','방배정','방 배정','호실선택','호실 선택')],
    ['dorm_meal_times', q=>has(q,'생활관','기숙사')&&has(q,'식사시간','식사 시간')],
    ['dorm_refrigerator', q=>has(q,'냉장고')&&has(q,'가져','개인')],
    ['dorm_internet', q=>has(q,'기숙사','생활관')&&has(q,'인터넷')&&!has(q,'괜찮')],
    ['double_major', q=>has(q,'복전','복수전공')&&has(q,'하고싶','하고 싶','신청')&&!has(q,'포기','취소','그만')],
    ['career_center_general', q=>n==='취업지원'||(has(q,'취업')&&has(q,'지원')&&!has(q,'창업'))],
    ['startup_center_general', q=>has(q,'창업')&&has(q,'지원')],
    // "동아리" is the ordinary student term for general club information. Keep specialized
    // club intents (창업/취업/동아리연합회) separate; when no such qualifier exists, route the
    // generic concept to the central-club guide so students do not need the official term "중앙동아리".
    ['central_club_info', q=>has(q,'동아리')&&!has(q,'창업','취업','동아리연합회')],
    ['route_dorm_general', q=>has(q,'학생생활관','생활관')&&has(q,'행정실','어디','위치')],
    ['tuition_zero', q=>has(q,'등록금')&&has(q,'0원','영원','제로')&&has(q,'등록처리','등록 처리')],
    ['classification_fix', q=>has(q,'이수구분')&&has(q,'잘못','오류')||has(q,'전공')&&has(q,'교양')&&has(q,'표시')],
    ['record_idnum', q=>has(q,'주민번호','주민등록번호')&&has(q,'학적','학적부')],
    ['parking_extend', q=>has(q,'주차','정기권')&&has(q,'연장','늘리','기간')],
    ['dorm_apply', q=>has(q,'긱사','기숙사','생활관')&&has(q,'신청','입사')],
    ['sch_work', q=>has(q,'국근','국가근로')&&has(q,'신청')],
    ['admission_transfer_v4', q=>has(q,'전남대에서순천대로')&&has(q,'편입')],
    ['route_library_general', q=>has(q,'전남대학생')&&has(q,'순천대도서관')],
    ['route_intl_visa', q=>has(q,'외국인','유학생')&&has(q,'비자')&&has(q,'연장')],
    ['disability_course', q=>has(q,'장애학생')&&has(q,'수강신청')],
    ['library_holiday_reservation', q=>has(q,'공휴일')&&has(q,'도서관','도서','책')&&has(q,'대출','빌릴','빌리')],
    ['rotc_application', q=>has(q,'rotc','학군단')&&has(q,'모집','지원','신청','언제')],
    ['ai_bootcamp_youth_program', q=>has(q,'청년도약')&&has(q,'ai','부트캠프')],
    ['route_it_sso', q=>has(q,'2차인증','2차 인증','otp','인증앱','인증 앱')],
  ];
  for(const [id,test] of rules){try{if(test(q))return answer(services,[id]);}catch(_){}}
  return null;
}


const DEPARTMENT_GENERAL_ALIASES=[
 ['route_academic_general',['교무학사과','학사민원','학사문의']],
 ['route_student_general',['학생지원과','학생처']],
 ['route_intl_general',['국제처','국제교류문의']],
 ['route_admin_general',['총무과','총무문의']],
 ['route_finance_general',['재무과','재무문의']],
 ['route_fac_general',['시설과','시설문의']],
 ['route_it_general',['정보전산원','전산원문의']],
 ['route_innov_general',['교육혁신본부']],
 ['route_career_general',['대학일자리플러스센터','취업센터']],
 ['route_library_general',['학술정보과','도서관문의']],
 ['route_dorm_general',['기숙사문의','생활관문의']],
 ['route_research_general',['연구산학협력과','산학협력단문의']],
 ['route_startup_general',['창업지원단','창업상담']],
 ['route_pr_general',['대외협력본부','대학홍보']],
 ['route_grad_general',['일반대학원','대학원행정']]
];
function departmentGeneral(q,services){
 const stripped=N(q).replace(/(전화번호|전화|연락처|위치|어디|담당|부서|문의|알려줘|알려주세요|궁금해요|궁금해|관련해서|관련|순천대|학교업무질문인데|학교업무|학교)/g,'').replace(/(인가요|인가|예요|에요|이야|야|요)$/,'');
 for(const [id,aliases] of DEPARTMENT_GENERAL_ALIASES){for(const a of aliases){if(stripped===N(a))return answer(services,[id],'department_general');}}
 return null;
}

const MULTI_DEFS=[
 ['course_registration',/(수강신청(?!(내역|확인서|취소|철회|변경|정정)))/g],
 ['leave_general',/(휴학(?!(증명|기간|연장|중|하면|했다가|후\s*복학)))/g],
 ['return',/(복학(?=(?:하고|하려|신청|[,.!?;]|\s|$)))/g],
 ['sch_national',/(국가장학금|국장(?!근))/g],
 ['student_loan',/(학자금대출|등록금\s*대출|등록금.*빌리)/g],
 ['student_id_reissue',/((학생증|신분증).{0,12}(재발급|잃어버|분실))/g],
 ['major_transfer',/(전과(?=(?:하고|하려|신청|[,.!?;]|\s|$)))/g],
 ['office365',/(microsoft\s*365|ms365|office\s*365|오피스365)/ig],
 ['student_email',/((학교|학생)\s*이메일.{0,12}(만들|필요|생성))/g],
 ['dorm_facility_report_board',/((기숙사|생활관).{0,15}(에어컨|전기|온수|난방).{0,10}(고장|안돼|문제))/g]
];
function splitExplicitClauses(q){
 const raw=S(q); const out=[]; let start=0; let i=0;
 const push=(end)=>{const text=raw.slice(start,end).trim();if(text)out.push(text);};
 const wordSeps=['뿐만 아니라','그리고','동시에','게다가','또한','또','및'];
 // Korean users often connect two complete requests with a predicate ending instead of
 // an explicit conjunction: “A가 궁금하고 B도 궁금해”. Keep the predicate stem on the
 // first clause so each side remains independently understandable (S09/S31).
 const predicateSeps=[
   ['궁금하고','궁금'],['궁금한데','궁금'],['필요하고','필요'],
   ['하고 싶고','하고 싶어'],['하고싶고','하고싶어'],
   ['가고 싶고','가고 싶어'],['가고싶고','가고싶어'],
   ['받고 싶고','받고 싶어'],['받고싶고','받고싶어'],
   ['알고싶고','알고싶어'],['알고 싶고','알고 싶어']
 ];
 while(i<raw.length){
   let predicate=null;
   for(const pair of predicateSeps){if(raw.startsWith(pair[0],i)){predicate=pair;break;}}
   if(predicate){
     const before=raw.slice(start,i).trim();
     if(before){out.push((raw.slice(start,i)+predicate[1]).trim());}
     i+=predicate[0].length;start=i;continue;
   }
   let matched='';
   for(const sep of wordSeps){
     if(!raw.startsWith(sep,i))continue;
     // Short conjunctions such as "또" and "및" must be standalone words;
     // never split inside real words such as "또래상담".
     if(sep==='또'||sep==='및'){
       const prev=i>0?raw[i-1]:'';const next=i+sep.length<raw.length?raw[i+sep.length]:'';
       if((prev&&!/\s|[.!?;,]/.test(prev))||(next&&!/\s|[.!?;,]/.test(next)))continue;
     }
     matched=sep;break;
   }
   if(matched){push(i);i+=matched.length;start=i;continue;}
   const ch=raw[i];
   // Users often omit punctuation between complete Korean requests:
   // "휴학하고 싶어요 국가장학금이 궁금해요". Treat a sentence-final ending
   // followed by whitespace as a soft boundary. If either side is not independently
   // resolvable, explicitClauseMulti() abstains and the richer app resolver gets the
   // untouched whole query, so this does not manufacture a partial answer.
   if(/\s/.test(ch)){
     const left=raw.slice(start,i).trim();const right=raw.slice(i).trim();
     if(left&&right&&/(?:요|니다|습니다|싶어|궁금해|필요해|알고싶어|알고 싶어|잃어버렸어|고장났어|했어|됐어|났어|렸어)$/.test(left)){
       out.push(left);while(i<raw.length&&/\s/.test(raw[i]))i++;start=i;continue;
     }
   }
   if(ch===','||ch===';'||ch==='\n'||ch==='?'||ch==='!'){
     push(i);i++;start=i;continue;
   }
   if(ch==='.'){
     const prev=i>0?raw[i-1]:''; const next=i+1<raw.length?raw[i+1]:'';
     // Preserve dotted abbreviations/versions/decimals such as A.U.R.A, 3.0.
     if(/[A-Za-z0-9]/.test(prev)&&/[A-Za-z0-9]/.test(next)){i++;continue;}
     push(i);i++;start=i;continue;
   }
   i++;
 }
 push(raw.length);
 return out;
}
function isGenericClauseFiller(text){
 const n=N(text);if(!n)return true;
 const stripped=n.replace(/그냥|관련해서|관련|문의할게요|문의할께요|문의합니다|문의드립니다|문의드려요|문의|질문할게요|질문|알려주세요|알려줘|궁금합니다|궁금해요|궁금해|싶어요|싶어/g,'');
 return stripped.length===0;
}
function explicitClauseMulti(q,services){
 const clauses=splitExplicitClauses(q);
 if(clauses.length<2)return null;
 const ids=[]; let unresolvedMeaningful=0;
 for(const clause of clauses){
   const r=resolve(clause,services);
   let clauseIds=(r&&r.status==='answer'&&Array.isArray(r.items))?r.items.map(it=>it&&it.service&&it.service.id).filter(Boolean):[];
   // Some intentionally terse student expressions (notably bare "휴학") are concepts,
   // not standalone catalog titles. If normal single-intent resolution abstains, reuse the
   // curated concept detectors *within this clause only*. Exact/relationship titles above
   // still win, so a phrase like "일반휴학 → 병역휴학 변경" cannot sprout leave_general.
   if(!clauseIds.length){
     const hits=[];
     for(const [id,re] of MULTI_DEFS){re.lastIndex=0;if(re.test(clause))hits.push(id);}
     clauseIds=[...new Set(hits)];
   }
   // A partially-resolved explicit list must not be returned as if it were complete.
   // Defer to the full app resolver when any meaningful clause is unresolved there;
   // it has the richer situation/alias index and can also surface unresolved clauses (S11/U20).
   if(!clauseIds.length&&!isGenericClauseFiller(clause))unresolvedMeaningful++;
   // Each explicit clause is its own user intent. Preserve every independently resolved
   // item from that clause, but de-duplicate IDs across clauses (S09/S31/S38).
   for(const id of clauseIds){if(id&&!ids.includes(id))ids.push(id);}
 }
 if(unresolvedMeaningful>0)return null;
 if(ids.length>=2)return multiAnswer(services,ids,'multi_intent',{multi_source:'explicit_clause'});
 return null;
}
function collectMulti(q,services){
 const raw=S(q); const found=[];
 for(const [id,re] of MULTI_DEFS){re.lastIndex=0; let m; while((m=re.exec(raw))){found.push({id,index:m.index,len:m[0].length}); if(!re.global)break;}}
 // Data-driven supplement: when the user explicitly enumerates requests, detect curated
 // service titles/aliases that are not present in the fixed concept list. Longest spans win.
 // Relationship/comparison/condition questions stay atomic and are not split here (S09/S38).
 const explicitMulti=/(그리고|또|뿐만\s*아니라|동시에|게다가|둘\s*다|[.!?;,]|\n|(?:^|\s)\d+번|첫째|둘째|셋째)/.test(raw);
 const relationLike=/(차이|비교|중\s*(뭐|어느)|하려면.*해야|하면.*어떻게|가능.*여부|신청\s*전|처리\s*전|전에도|전에|후에|중인데|중에|때)/.test(raw);
 if(explicitMulti&&!relationLike){
   const nr=N(raw), spans=[];
   for(const s of services){
     const terms=[s.title,...(s.aliases||[])];
     for(const term of terms){const nt=N(term);if(nt.length<4)continue;const idx=nr.indexOf(nt);if(idx>=0)spans.push({id:s.id,index:idx,len:nt.length,catalog:true});}
   }
   spans.sort((a,b)=>a.index-b.index||b.len-a.len||a.id.localeCompare(b.id));
   for(const sp of spans){
     const overlaps=found.some(f=>Math.max(f.index,sp.index)<Math.min(f.index+f.len,sp.index+sp.len));
     if(!overlaps)found.push(sp);
   }
   // Separator-based semantic supplement: resolve each explicitly enumerated clause on its own.
   // This catches natural paraphrases such as "생활관 식사시간…, 계절학기 수강료도…"
   // without requiring every concept pair to be hard-coded in MULTI_DEFS (S09).
   // Condition/comparison language is excluded above so atomic relationship questions stay atomic (S32/S38).
   const sep=/(?:그리고|뿐만\s*아니라|동시에|게다가|[.!?;,]|\n)+/g;
   let last=0,m; const clauses=[];
   while((m=sep.exec(raw))){
     const text=raw.slice(last,m.index).trim(); if(text)clauses.push({text,index:last}); last=m.index+m[0].length;
   }
   const tail=raw.slice(last).trim(); if(tail)clauses.push({text:tail,index:last});
   if(clauses.length>=2){
     for(const c of clauses){
       const r=resolve(c.text,services);
       if(r&&r.status==='answer'&&Array.isArray(r.items)&&r.items.length===1){
         const id=r.items[0]?.service?.id;
         if(id){
           // Clause-level resolution is more specific than a broad title substring found in the same clause.
           // Keep fixed concept detections, but discard only catalog-substring spans inside this clause.
           for(let i=found.length-1;i>=0;i--){const f=found[i];if(f.index>=c.index&&f.index<c.index+c.text.length&&f.id!==id)found.splice(i,1);}
           if(!found.some(f=>f.id===id))found.push({id,index:c.index,len:c.text.length,clause:true});
         }
       }
     }
   }
 }
 // Concatenated Korean inputs can lack separators; explicit action phrases above still expose boundaries.
 found.sort((a,b)=>a.index-b.index||b.len-a.len||a.id.localeCompare(b.id));
 const unique=[]; const seen=new Set();
 for(const f of found){if(!seen.has(f.id)){seen.add(f.id);unique.push(f);}}
 // Explicit contrast/negation: remove negated earlier intent.
 const n=N(q);
 if(has(q,'아니고','아니지만','말고','괜찮고','이미했고','이미 했고','안잃어버','안 잃어버')){
   if(has(q,'휴학은아니','휴학아니')){const i=unique.findIndex(x=>x.id==='leave_general');if(i>=0)unique.splice(i,1);}
   if(has(q,'국가장학금말고','국가장학금은이미','국가장학금이미')){const i=unique.findIndex(x=>x.id==='sch_national');if(i>=0)unique.splice(i,1);}
   if(has(q,'학생증은안','학생증안잃','신분증은안')){const i=unique.findIndex(x=>x.id==='student_id_reissue');if(i>=0)unique.splice(i,1);}
   if(has(q,'기숙사인터넷은괜찮')){const i=unique.findIndex(x=>x.id==='dorm_internet');if(i>=0)unique.splice(i,1);}
 }
 if(unique.length>=2){return multiAnswer(services,unique.map(x=>x.id),'multi_intent',{multi_source:'concept_collect'});}
 return null;
}


const GENERIC_ROUTE_ALIASES=new Set(['대출','반납','입실','퇴실','세입','인건비','원천세','특허','기부','기탁','사물함','수서','지원','문의','관리','신청','취소','변경','발급','상담','안내']);
function uniqueRouteAlias(q,services){const n=N(q);if(n.length<3||GENERIC_ROUTE_ALIASES.has(n))return null;const owners=[];for(const s of services){for(const k of (s.route_keywords||[])){if(N(k)===n){owners.push(s);break;}}}if(owners.length===1)return answer(services,[owners[0].id],'exact_route_alias');if(owners.length>1){const groups=new Set(owners.map(s=>s.canonical_id||s.id));if(groups.size===1){const group=[...groups][0];const canonical=owners.find(s=>s.id===group)||owners.slice().sort((a,b)=>a.id.localeCompare(b.id))[0];return answer(services,[canonical.id],'canonical_route_alias');}}return null;}

function resolve(query,services){
 const q=String(query||'').trim().slice(0,300); if(!q)return unknown('empty');
 const n=N(q);
 // Canonical exact title is the strongest evidence and must not be shadowed by broad aliases.
 const exactTitles=services.filter(s=>N(s.title)===n).sort((a,b)=>a.id.localeCompare(b.id));
 if(exactTitles.length)return answer(services,exactTitles.map(x=>x.id),'exact_title');
 // Generic wrappers must not change a canonical title result (T10/T04).
 const cores=new Set([n]);
 const suffixes=['관련해서궁금해요','좀알려주세요','문의'];
 for(const c of [...cores]){if(c.startsWith('순천대에서'))cores.add(c.slice('순천대에서'.length));for(const suf of suffixes)if(c.endsWith(suf))cores.add(c.slice(0,-suf.length));}
 for(const c of [...cores]){if(c.startsWith('순천대에서'))cores.add(c.slice('순천대에서'.length));for(const suf of suffixes)if(c.endsWith(suf))cores.add(c.slice(0,-suf.length));}
 for(const c of [...cores])for(const pref of ['국립순천대학교','순천대학교','순천대'])if(c.startsWith(pref)&&c.length>pref.length)cores.add(c.slice(pref.length));
 // Wrapper 4 is exactly '학교 {canonical title} 문의'; strip only those outer tokens together.
 if(n.startsWith('학교')&&n.endsWith('문의'))cores.add(n.slice('학교'.length,-'문의'.length));
 const wrappedTitles=services.filter(s=>cores.has(N(s.title))).sort((a,b)=>a.id.localeCompare(b.id));
 if(wrappedTitles.length)return answer(services,wrappedTitles.map(x=>x.id),'wrapped_exact_title');
 // If a complete canonical title is followed only by generic *routing/inquiry* language,
 // keep that exact service identity. Do not enumerate full Korean sentences here: instead
 // classify the remainder by meaning. The remainder must contain a routing-question signal,
 // must not introduce a second catalog title, and must not introduce a new operation that
 // could legitimately select a different workflow (신청/취소/변경/재발급/납부 ...).
 // This keeps unseen variants such as "학적부 어디에 물어봐?" and
 // "성적증명서 어디서 담당해?" stable without stealing "수강신청 취소 문의".
 const inquirySignals=['문의','물어','연락','전화','담당','부서','어디','누구','알려','궁금','알고싶','가야','찾아가','방문'];
 const operationSignals=['신청','취소','변경','재발급','발급','납부','정정','수정','조회','예약','신고','제출','철회','환불','연장','교환','수리','고장','개발','시스템','오류','장애','접속','로그인','비밀번호','입사','퇴사','휴학','복학','전과'];
 const titleNorms=[...new Set(services.map(s=>N(s.title)).filter(Boolean))];
 const isGenericInquiryRemainder=rem=>{
   if(!rem||!inquirySignals.some(x=>rem.includes(x)))return false;
   if(operationSignals.some(x=>rem.includes(x)))return false;
   // A second complete canonical title is evidence of another intent. Other non-title
   // concepts are handled by the richer app-level multi detector before this result is final.
   if(titleNorms.some(t=>t.length>=2&&rem.includes(t)))return false;
   return true;
 };
 let naturalInquiryMatches=[];let longestInquiryTitle=0;
 for(const s of services){
   const t=N(s.title);if(!t||!n.startsWith(t)||n===t)continue;
   const rem=n.slice(t.length);if(!isGenericInquiryRemainder(rem))continue;
   if(t.length>longestInquiryTitle){longestInquiryTitle=t.length;naturalInquiryMatches=[s];}
   else if(t.length===longestInquiryTitle)naturalInquiryMatches.push(s);
 }
 if(naturalInquiryMatches.length)return answer(services,naturalInquiryMatches.sort((a,b)=>a.id.localeCompare(b.id)).map(x=>x.id),'natural_title_inquiry');
 // A canonical service title followed/preceded by a display facet (phone/location/docs/period/amount)
 // is still the same service intent. Strip only outer facet tokens so this cannot silently
 // rewrite arbitrary words inside a service name (S41/U24).
 const facetTokens=['전화번호','연락처','전화','담당부서','담당','위치','어디','준비물','필요서류','제출서류','서류','신청서','신청기간','기간','언제','언제까지','마감','신청일','금액','얼마','수수료','비용','자격','조건','대상','몇시','시간'];
 const facetCores=new Set();
 for(const f of facetTokens){const nf=N(f);if(n.endsWith(nf)&&n.length>nf.length)facetCores.add(n.slice(0,-nf.length));if(n.startsWith(nf)&&n.length>nf.length)facetCores.add(n.slice(nf.length));}
 // Natural Korean facet questions commonly add particles/endings after the facet itself
 // (e.g. "공휴일 예약대출 얼마예요", "조기졸업 자격이 뭐예요").
 // Accept only when the *entire remainder* after a complete canonical title is display/facet language.
 const facetTail=/^(?:전화번호|연락처|전화|담당부서|담당|위치|어디|준비물|필요서류|제출서류|서류|신청서|신청기간|기간|언제|언제까지|마감|신청일|금액|얼마|수수료|비용|자격|조건|대상|몇시|시간|이|가|은|는|을|를|뭐|몇|어떻게|필요|내|내요|알려|알려줘|알려주세요|인가|인가요|예요|에요|야|요|돼|되나요|가능|가능해|궁금|궁금해요)+$/;
 const naturalFacetTitles=services.filter(s=>{const t=N(s.title);if(!t||!n.startsWith(t)||n===t)return false;const rem=n.slice(t.length);return facetTail.test(rem);}).sort((a,b)=>a.id.localeCompare(b.id));
 const facetTitles=[...services.filter(s=>facetCores.has(N(s.title))),...naturalFacetTitles].filter((s,i,a)=>a.findIndex(x=>x.id===s.id)===i).sort((a,b)=>a.id.localeCompare(b.id));
 if(facetTitles.length)return answer(services,facetTitles.map(x=>x.id),'title_with_facet');
 // If the user supplied a complete canonical workflow title that already contains an action
 // (신청/예약/발급/등록/납부/조회/변경) and only asks "방법/어떻게", keep that exact owner.
 // This is narrower than treating 방법 as a global facet, so action-sensitive queries such as
 // "메이커스페이스 신청방법" can still use their established specific workflow semantics.
 const methodFacetTail=/^(?:방법|신청방법|어떻게|어떻게해|어떻게하나요|어떻게해요|하는법|하는방법|절차)$/;
 const titleMethodFacet=services.filter(s=>{const t=N(s.title);if(!t||!n.startsWith(t)||n===t)return false;const rem=n.slice(t.length);return methodFacetTail.test(rem);}).sort((a,b)=>a.id.localeCompare(b.id));
 if(titleMethodFacet.length)return answer(services,titleMethodFacet.map(x=>x.id),'title_with_method_facet');
 // Natural Korean question endings around an exact service title should not force fuzzy search.
 // Examples: “수강신청이 궁금해”, “국가장학금도 궁금해요”. Strip only an outer particle
 // plus a small allow-list of question endings, then require an exact canonical title match.
 const naturalQuestionCore=n
   .replace(/(?:이|가|은|는|도|을|를)?(?:궁금해요|궁금해|궁금합니다|궁금|알고싶어요|알고싶어|알고싶습니다)$/,'');
 if(naturalQuestionCore&&naturalQuestionCore!==n){
   const naturalTitles=services.filter(s=>N(s.title)===naturalQuestionCore).sort((a,b)=>a.id.localeCompare(b.id));
   if(naturalTitles.length)return answer(services,naturalTitles.map(x=>x.id),'natural_title_question');
   // Common short labels may name a program rather than match its full catalog title.
   // Keep bare/general ROTC questions on the general program guide; action/period words
   // are handled by the stronger rotc_application rule above. This also makes explicit
   // multi-intent clauses such as “수강신청도 궁금하고 rotc도 궁금해” deterministic.
   if(['rotc','학군단','학생군사교육단'].includes(naturalQuestionCore))return answer(services,['rotc_info'],'natural_program_question');
 }
 // Explicitly enumerated clauses are resolved independently before any whole-query
 // single-intent shortcut. A relation-like title in one clause must not erase a
 // separate comma/period/그리고 intent in another clause (S09/S31/S38).
 const explicitClauses=splitExplicitClauses(q);
 const clauseMulti=explicitClauses.length>=2?explicitClauseMulti(q,services):null;if(clauseMulti)return clauseMulti;
 // If an explicitly separated request contains a clause that the deterministic core cannot
 // resolve, do not let a strong rule from another clause swallow the whole query. Defer to
 // the full app resolver, which can resolve catalog situations/aliases clause-by-clause (S11).
 const meaningfulExplicitClauses=explicitClauses.filter(c=>!isGenericClauseFiller(c));
 // Only a genuinely explicit separator should force the richer app resolver when one
 // clause is unresolved. A soft whitespace boundary may just be inverted Korean word
 // order (e.g. "화재 났어요 기숙사"); in that case keep evaluating the whole query so
 // a strong atomic rule can still win.
 const hardClauseBoundary=/(?:그리고|또한|뿐만\s*아니라|동시에|게다가|(?:^|\s)(?:또|및)(?=\s|$)|궁금하고|궁금한데|필요하고|하고\s*싶고|하고싶고|가고\s*싶고|가고싶고|받고\s*싶고|받고싶고|알고\s*싶고|알고싶고|[.!?;,\n])/.test(S(q));
 if(meaningfulExplicitClauses.length>=2&&hardClauseBoundary)return null;
 // Protected aliases whose generic catalog wording is intentionally broader.
 if(has(q,'aura','a.u.r.a'))return answer(services,['ai_bootcamp_platforms'],'protected_alias');
 const dept=departmentGeneral(q,services);if(dept)return dept;
 // A unique, curated situation phrase is also stronger than fuzzy/generic rules.
 const exactSituations=services.filter(s=>(s.situations||[]).some(x=>N(x)===n)).sort((a,b)=>a.id.localeCompare(b.id));
 if(exactSituations.length===1)return answer(services,[exactSituations[0].id],'exact_situation');
 const single=highRiskSingle(q,services);
 const routeAlias=uniqueRouteAlias(q,services);
 // Relationship/state-transition intents are atomic even though they contain several concept words.
 // Keep these before generic concept collection unless the user explicitly separated clauses.
 const atomicRelationIds=new Set(['return_course_before_status','leave_course_registration_effect','military_return','military_leave_grade_recognition','leave_convert_to_military','return_before_discharge','graduation_while_on_leave','major_transfer_credit_requirement','transfer_duplicate_course']);
 const singleId=single?.items?.[0]?.service?.id;
 if(single && (atomicRelationIds.has(singleId) || ((has(q,'군휴학')&&has(q,'복학')) || (has(q,'군휴학')&&has(q,'성적','학점')) || (has(q,'휴학했다가')&&has(q,'복학'))))) return single;
 const multi=collectMulti(q,services);
 const forceSingle = single && ['unresolved_relation','out_of_scope_other_university','role_mismatch','ambiguous_location','ambiguous_term','unsupported_item','out_of_scope_general_advice','generation_not_routing','no_action','out_of_scope'].includes(single.reason);
 if(forceSingle)return single;
 if(multi)return multi;
 if(single)return single;
 if(routeAlias)return routeAlias;
 return null;
}
root.EodigaSearchCore={resolve,normalize:N};
if(typeof module!=='undefined'&&module.exports)module.exports={resolve,normalize:N};
})(typeof globalThis!=='undefined'?globalThis:this);
