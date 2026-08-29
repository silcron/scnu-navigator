let dataset = null;
let services = [];
let currentCategory = '전체';
let browseShowAllCategories = false;
const BROWSE_PREVIEW_LIMIT = 12;
let pendingClassifierController = null;
let searchSequence = 0;
let activeResultQuery = '';
const RECENT_SEARCH_KEY = 'eodiga_recent_searches_v2';
const CHECK_STATE_KEY = 'eodiga_check_state_v2';
const DATA_CACHE_VERSION = '5.4.16';
const classifierCache = new Map();
const CLASSIFIER_CACHE_STORAGE_KEY = 'eodiga_classifier_cache_v731';
const CLASSIFIER_CACHE_LIMIT = 30;
const CAMPUS_MAP_URL = 'https://www.scnu.ac.kr/SCNU/cm/cntnts/cntntsView.do?cntntsId=1046&mi=1182';

const PII_PATTERNS = [
  [/\b\d{6}\s*[- ]?\s*[1-4]\d{6}\b/g, '[주민등록번호]'],
  [/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, '[전화번호]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[이메일]'],
  [/\b(?:20)?\d{2}[ -]?\d{5,7}\b/g, '[학번 등 번호]']
];
function maskPersonalInfo(text=''){
  let out=String(text||'');
  for(const [re,label] of PII_PATTERNS) out=out.replace(re,label);
  return out;
}
function containsPersonalInfo(text=''){ return maskPersonalInfo(text)!==String(text||''); }

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const categoryIcons = {
  '휴학·복학':'↺',
  '수업·수강':'✎',
  '장학·학자금':'₩',
  '성적·시험':'A+',
  '학생증':'▣',
  '다전공':'⊕',
  '증명서':'▤',
  '등록금':'₩',
  '학생생활관':'⌂',
  '진로·취업':'↗',
  'IT·온라인서비스':'@',
  '도서관':'▥',
  '학적':'≡',
  '졸업':'✓',
  '학점인정':'＋',
  '교통':'↔',
  '교통·주차':'P',
  '보건':'＋',
  '상담·인권':'♡',
  '국제교류':'✈',
  '장애학생지원':'♿',
  '학생생활':'○',
  '학생활동':'☆',
  '시설':'⚙',
  '입학':'◉',
  '교육과정':'≡',
  '교직':'▧',
  '학생지원':'☂',
  '교육혁신':'✦',
  '창업':'◆',
  '학과·전공 찾기':'⌖',
  '대학원':'◇',
  '병무·ROTC':'★',
  'AI인재양성부트캠프':'AI',
  '사업단·특별프로그램':'◆',
  '연구·산학협력':'∑',
  '인권·연구윤리':'§',
  '평생교육':'∞',
  '학교 부속기관':'▦',
  '학교생활·기관':'◎',
  '행정·총무':'☰',
  '행정·재무':'₩',
  '학사·교무':'✎',
  '발전기금·기부':'♥',
  '홍보·대외협력':'↗',
  '기획·평가':'✓',
  '교원·인사':'人',
  '교직원·인사':'人',
  '기관·센터 찾기':'⌖',
  '도움말':'?'
};

const preferredCategoryOrder = ["휴학·복학", "수업·수강", "장학·학자금", "성적·시험", "학생증", "다전공", "증명서", "등록금", "학생생활관", "진로·취업", "IT·온라인서비스", "도서관", "학적", "졸업", "학점인정", "교통", "교통·주차", "보건", "상담·인권", "국제교류", "장애학생지원", "학생생활", "학생활동", "시설", "입학", "교육과정", "교직", "학생지원", "교육혁신", "창업", "학과·전공 찾기", "대학원", "병무·ROTC", "AI인재양성부트캠프", "사업단·특별프로그램", "연구·산학협력", "인권·연구윤리", "평생교육", "학교 부속기관", "학교생활·기관", "행정·총무", "행정·재무", "학사·교무", "발전기금·기부", "홍보·대외협력", "기획·평가", "교원·인사", "교직원·인사", "기관·센터 찾기", "도움말"];

const featuredCategories = ["휴학·복학", "수업·수강", "장학·학자금", "성적·시험", "학생증", "다전공", "증명서", "등록금", "학생생활관", "진로·취업", "IT·온라인서비스", "도서관"];

function normalize(text=''){
  return text
    .toLowerCase()
    .replace(/[\s\-_/.,!?()[\]{}'":;·~]+/g,'')
    .replace(/학생/g,'학생')
    .trim();
}

function compositeRouteId(query){
  const q=normalize(query);
  const has=(...xs)=>xs.some(x=>q.includes(normalize(x)));
  const both=(a,b)=>has(...a)&&has(...b);

  if(has('군휴학','병역휴학')) return 'leave_military';
  if(has('군대','입대','입영','군복무') && has('휴학','학교쉬') && !has('휴학중','일반휴학중','일반휴학')) return 'leave_military';
  if(has('rotc','학군단','학생군사교육단')) return 'rotc_info';
  if(has('인권') && has('상담','문의','신고','침해','센터','도움')) return 'human_rights_contact';
  if(has('신분증') && has('재발급','잃어버','분실','깨졌','훼손')) return 'student_id_reissue';
  if(has('국가장학금','국장') && !has('학자금대출','학생증')) return 'sch_national';
  if(has('시험') && has('추가시험','못봤','못봄','못봐','결시','결석','응시못','못쳤','못침')) return 'makeup_exam';
  if(has('시험','중간고사','기말고사') && has('언제','일정','기간','날짜')) return 'exam_schedule';
  if(has('등록금','학비') && has('내고싶','납부하고싶','결제하고싶','어떻게내','납부기간') && !has('휴학','복학','자퇴','환불','반환','분납','분할','나눠')) return 'tuition_payment';
  if(has('기숙사비','생활관비') && has('내','납부','결제','얼마','비용','돈')) return 'dorm_payment';
  if(both(['교환학생','해외대학','국외대학'],['학점','성적','학점인정','이수구분','일반선택','전공선택'])) return 'international_exchange_credit';
  if(has('유학생','외국인') && has('대학원') && has('지원','입학','원서','모집')) return 'route_intl_foreign_admission';
  if(has('편입','편입학') && has('지원','원서','모집','입시','합격','접수')) return 'admission_transfer_v4';
  if(has('편입','편입생','전적대') && has('동일과목','중복과목','중복','인정과목') && has('과목','학점','재수강','중복')) return 'transfer_duplicate_course';
  if(has('편입','편입생') && has('교육과정','졸업학점','어떤과목','졸업요건')) return 'transfer_curriculum';
  if(has('편입','편입생','전적대') && has('학점','학점인정','인정','이수구분') && !has('지원','원서','모집','입시','합격')) return 'transfer_credit';

  if(has('창업','사업시작') && has('휴학','학교쉬','쉬고싶')) return 'leave_startup';
  if(has('휴학') && has('하고싶','싶어','신청하고싶','신청하려') && !has('병역','군대','입대','입영','질병','임신','출산','육아','창업','국외','유학')) return 'leave_general';
  if(has('복학') && has('하고싶','싶어','신청하고싶','신청하려','학교돌아')) return 'return';
  if(has('한학기쉬','학교쉬','잠깐쉬','좀쉬고','쉬고싶') && !has('자퇴','입대','군대','입영','창업')) return 'leave_general';
  if(has('학과를바꾸','학과바꾸','다른학과로옮','과를바꾸','과바꾸') && !has('같은학부')) return 'major_transfer';
  if(has('결석','출석') && has('f','에프','학점','미달','부족','많이')) return 'attendance_failure_rule';
  if(has('졸업요건','졸업조건','졸업학점') && !has('편입','휴학')) return 'graduation_requirements';
  if(has('폐지','없어졌','사라진') && has('과목','교과목') && has('다시','재수강','재이수','듣고')) return 'retake_replace';
  if(has('전역','군복무끝','군대다녀') && has('학교돌아','학교로돌아','복학','다시학교') && !has('전역전','아직전역')) return 'military_return';
  if(both(['편입생','전적대','편입전학교'],['학점','학점인정','인정','이수구분']) && !has('지원','원서','모집','입시','합격')) return 'transfer_credit';
  if(has('등록금') && has('복학','복학생','휴학끝','학교돌아')) return 'return_tuition';
  if((has('전역전','아직전역','전역예정') && has('복학','학교돌아','학교가'))) return 'return_before_discharge';
  if(has('휴학중','일반휴학') && has('입영','입대','군대','영장')) return 'leave_convert_to_military';

  const leakTerms=['누수','물샘','물이샘','물이새','물이샌','물이새는','물이떨어','물떨어짐'];
  const hasLeak=has(...leakTerms);
  if(hasLeak && has('기숙사','생활관')) return 'dorm_facility_report_board';
  if(hasLeak && has('화장실','배관','수도관','수도','파이프','세면대','변기','싱크대')) return 'route_fac_mechanical';
  if(hasLeak && has('건물','천장','벽','지붕','외벽','창문','옥상')) return 'route_fac_arch';
  if(hasLeak) return 'facility_fix';

  if(has('자소서','자기소개서','이력서','입사지원서') && has('첨삭','클리닉','봐줘','검토')) return 'resume';
  if(has('수강','수강신청','과목') && has('취소','삭제','빼고','빼고싶','빼고싶어','변경','정정') && !has('전과')) return 'course_change';
  if(has('성적') && has('확인','조회','보고싶','어디서','나왔','이번학기') && !has('정정','이의','오류','이상')) return 'grade_lookup';
  if(has('기숙사','생활관') && has('퇴실','나가려','나가고싶','방빼','퇴관')) return 'dorm_move_out';
  if(has('기숙사','생활관') && has('호실','방배정','방어디','방확인','배정확인')) return 'dorm_room_assignment';
  if(has('기숙사','생활관') && has('식단','메뉴','오늘밥','밥뭐','주간식단')) return 'dorm_weekly_menu';
  if(has('도서관','도서','책') && has('대출','빌리','반납','연체') && !has('구입','기증')) return 'route_library_borrow';
  if(has('면접') && has('연습','모의','코칭','클리닉','준비') && !has('ai','인공지능')) return 'interview';
  if(has('ai','인공지능') && has('면접')) return 'ai_interview';
  if(has('메이커스페이스','메이커') && has('예약','장비','이용') && !has('3d','uv','열프레스','승화전사','카메라')) return 'maker';
  if(has('국제처','국제교류') && has('어디','위치','전화','연락','문의','담당')) return 'route_intl_general';
  if(has('기숙사','생활관') && has('추가모집','추가신청')) return 'dorm_additional_application';
  if(has('기숙사','생활관') && has('입사','신청','모집') && !has('퇴실','룸메','호실','냉장고')) return 'dorm_apply';
  if(has('주차','정기주차','정기권','차량등록') && has('연장','갱신')) return 'parking_extend';
  if(has('주차','정기주차','정기권','차량등록') && has('등록','신청','신규','처음') && !has('연장','갱신')) return 'parking_new';

  if(has('기숙사','생활관') && has('온수','냉방','난방','에어컨','수도','시설고장','전기고장','전등고장')) return 'dorm_facility_report_board';
  if(!has('기숙사','생활관') && has('강의실','학교','교내','실습실','연구실') && has('에어컨','에어콘','냉난방','난방','수도')) return 'route_fac_mechanical';
  if(!has('기숙사','생활관') && has('강의실','학교','교내','사무실') && has('콘센트','전기','조명','전등')) return 'route_fac_electric';
  if(has('학교','교내','강의실','실습실') && has('프린터','컴퓨터','pc') && has('고장','안돼','안됨','오류','문제')) return 'route_it_pc_printer';

  if(has('연구비','연구과제') && has('장비','기자재','물품','구매','사고싶','구입')) return 'route_research_purchase';
  if(has('행사','학과행사','견학','현장학습','워크숍') && has('버스','차량','학교차량')) return 'school_vehicle';

  if(has('수강신청','향림통') && has('오류','접속','로그인','페이지','먹통','시스템','버튼안','화면안')) return 'route_it_portal';
  if(has('수강신청') && has('정정','삭제','빼고','취소','변경')) return 'course_change';
  if(has('수강신청') && has('기간','언제','방법','신청하려','신청하고싶','하고싶','과목')) return 'course_registration';

  if(has('복수전공','복전') && has('포기','취소','그만') && has('이수구분','일반선택','과목')) return 'double_major_cancel';
  if(has('개명','이름바꿈','이름변경') && has('학적','학교정보','증명서','졸업증명')) return 'record_name';

  if(has('학교','교내') && has('다쳤','부상','사고') && has('보험','보상','청구')) return 'student_insurance';
  if(has('3d프린터','3d printer','3d출력')) return 'maker_3d_printer';
  if(has('uv프린터','uv printer','uv인쇄')) return 'maker_uv_printer';
  if(has('승화전사','열프레스','듀얼프레스','전사프레스')) return 'maker_heat_press';
  if(has('연구용역') && has('계약','기업','지자체','민간')) return 'route_research_private';
  if(has('교양과목','교양수업','교양교육') && has('시간표','수업시간','개설')) return 'route_innov_liberal';
  if(has('형광등','전등') && has('강의실','실습실','교내','학교') && has('안켜','고장','교체','나감')) return 'route_fac_electric';
  if(has('학교이메일','학교메일','웹메일') && has('안돼','오류','로그인','문제')) return 'route_it_network';
  if(has('취업포인트','향림취업향상포인트')) return 'route_career_point';
  if(has('바이브코딩','바이브코딩경진대회','바이브코딩공모전','바이브코딩대회')) return 'ai_bootcamp_vibecoding_contest';
  if(has('네이버클라우드','메가존클라우드','소버린ai','에이전틱ai')) return 'ai_bootcamp_cloud_training';
  if(has('aura','a.u.r.a','axopenlab','ax오픈랩') || (has('전자책','e-book','ebook') && has('ai','부트캠프','사업단'))) return 'ai_bootcamp_platforms';
  if(has('청년도약') && has('ai','인재양성','부트캠프')) return 'ai_bootcamp_youth_program';
  if(has('ai인재양성부트캠프사업단','ai인재양성부트캠프','ai인재양성사업단','ai부트캠프사업단','부트캠프사업단')) return 'ai_bootcamp_general';
  if(has('ai','인공지능') && has('비교과') && !has('sw중심대학','rise','라이즈','gtep','지텝','창업')) return 'ai_bootcamp_general';
  if(has('창업') && has('동아리','캠프','경진대회')) return 'route_startup_club';
  if(has('창업') && has('강좌','스쿨','비교과','교육','수업')) return 'route_startup_class';
  if(has('sw중심대학')) return 'sw_center_general';
  if(has('ai인재양성','ai부트캠프','ai부트캠프사업단','ai인재양성부트캠프사업단','부트캠프사업단')) return 'ai_bootcamp_general';
  if(has('rise','라이즈') && has('사업단','프로그램','비교과','교육','문의')) return 'rise_general';
  if(has('gtep','지텝') && has('사업단','프로그램','비교과','교육','문의')) return 'gtep_general';
  if(has('lms','e캠퍼스','이캠퍼스','원격수업') && has('비교과','프로그램','수업','강의','오류','문의')) return 'route_innov_lms';
  if((has('비교과') && has('포인트')) || (has('향림') && has('취업') && has('포인트'))) return 'career_points';
  if(has('비교과') && has('프로그램','신청','관리','문의') && !has('창업','sw중심대학','ai인재양성','ai부트캠프','rise','라이즈','gtep','지텝','lms','e캠퍼스','이캠퍼스','원격수업')) return 'route_innov_extracurricular';
  if(has('rcms') && has('연구비','과제','집행')) return 'route_research_rcms';
  if(has('도서관') && has('책기증','도서기증','책을기증','기증하고')) return 'route_library_acquisition';
  if(has('발전기금','발전지원금') && has('영수증','기부금영수증')) return 'route_fund_receipt';
  if(has('석사','박사','대학원') && has('논문')) return 'route_grad_admission_thesis';
  if(has('석사','박사','대학원') && has('지도교수','표절')) return 'route_grad_general';
  if(has('교수','교원','전임교원') && has('채용','초빙','공개채용','임용')) return 'route_faculty_recruitment';
  if(has('강사','비전임교원','조교') && has('채용','임용','복무')) return 'route_nonfaculty_recruitment';
  if(has('교직원','공무원','직원') && has('연가','복무','인사','휴가')) return 'route_staff_hr';
  if(has('학식','학생식당') && has('메뉴','식단','운영','시간')) return 'route_student_cafeteria';

  return null;
}

let SEARCH_INDEX=[];
let KEYWORD_ANCHOR_MAP=new Map();
let KEYWORD_ANCHORS=[];
let KEYWORD_ANCHORS_BY_FIRST=new Map();
let KEYWORD_STRONG_LITERALS_BY_GROUP=new Map();
let KEYWORD_TITLE_NORMS_BY_GROUP=new Map();
let EXACT_SITUATION_GROUP_MAP=new Map();
let SEARCH_DF=new Map();
let SEARCH_DOC_COUNT=0;
let pendingClarificationIds=[];
const SEARCH_CONCEPTS=[
 {domain:'counseling',aliases:['성폭행','성폭력','성추행','강제추행','성희롱','데이트폭력','디지털성범죄','불법촬영','몰카'],preferred:['route_rights_general','human_rights_contact','harassment']},
 {domain:'counseling',aliases:['인권침해','갑질','부당대우','차별','괴롭힘','폭언','모욕','따돌림'],preferred:['route_rights_general','human_rights_contact']},
 {domain:'student',aliases:['장학재단','한국장학재단','국장','국가장학','국가장학금'],preferred:['route_student_national_scholarship','sch_national','scholarship_guide']},
 {domain:'student',aliases:['교내장학','교내장학금','학교장학금','학교장학'],preferred:['route_student_internal_scholarship','sch_internal','sch_grade']},
 {domain:'student',aliases:['장학','장학금','장학문의'],preferred:['scholarship_guide','route_student_internal_scholarship','route_student_national_scholarship','route_student_workstudy']},
 {domain:'student',aliases:['근로장학','국가근로','근장','교내근로'],preferred:['route_student_workstudy','sch_work']},
 {domain:'student',aliases:['통학','통학버스','통학버스대여','셔틀','학교셔틀','버스'],preferred:['shuttle','shuttle_reserve','route_student_shuttle_volunteer','school_vehicle']},
 {domain:'finance',aliases:['학비환불','등록금환불','등록금반환','학비반환','학비돌려받기'],preferred:['tuition_refund']},
 {domain:'finance',aliases:['분납','분할납부','학비분할','등록금분할','등록금분납','학비분납','등록금나눠내기','학비나눠내기'],preferred:['tuition_installment']},
 {domain:'academic',aliases:['군휴학','병역휴학','입대휴학','군입대휴학'],preferred:['leave_military','leave_convert_to_military']},
 {domain:'academic',aliases:['휴학','휴핫','학교쉬기','한학기쉬기','잠깐쉬기','학교잠시쉬기'],preferred:['leave_general','route_academic_record']},
 {domain:'academic',aliases:['휴학중입대','일반휴학중입대','입영통지서','휴학중군대'],preferred:['leave_convert_to_military']},
 {domain:'academic',aliases:['복학','학교돌아가기','다시학교다니기'],preferred:['return','route_academic_record']},
 {domain:'academic',aliases:['자퇴','학교그만두기','학교완전히그만','학업포기'],preferred:['withdrawal']},
 {domain:'academic',aliases:['재입학','다시입학','자퇴후복귀','제적후복귀','학적복구'],preferred:['readmission']},
 {domain:'academic',aliases:['전과','과바꾸기','과바꾸','학과바꾸기','학과바꾸','과옮기기','과옮기','학과옮기기','학과옮기','다른과로옮기기'],preferred:['major_transfer']},
 {domain:'academic',aliases:['복전포기','복전취소','복수전공포기','복수전공취소'],preferred:['double_major_cancel']},
 {domain:'academic',aliases:['복전','복수전공','전공두개'],preferred:['double_major','double_major_cancel']},
 {domain:'academic',aliases:['재수강','다시듣기','과목다시듣기'],preferred:['retake','retake_replace']},
 {domain:'academic',aliases:['계절학기','방학수업','방학학점','여름학기','겨울학기'],preferred:['seasonal']},
 {domain:'academic',aliases:['성적정정','성적이상','점수이상','성적오류','학점잘못'],preferred:['grade_correction_period']},
 {domain:'academic',aliases:['전적대학점','전학교학점','이전학교학점','편입전학점','편입학점'],preferred:['transfer_credit','route_academic_graduation']},
 {domain:'admission',aliases:['예비번호','예비순번','추합','추가합격','충원','충원합격'],preferred:['admission_early_v4','admission_early_regular']},
 {domain:'admission',aliases:['입시상담','입학상담','입학문의','입시문의','대입상담'],preferred:['admission_general_v4','admission_counsel_general']},
 {domain:'dorm',aliases:['기숙사','생활관','학생생활관','기숙사방'],preferred:['route_dorm_general']},
 {domain:'dorm',aliases:['기숙사고장','기숙사온수','기숙사전기','기숙사에어컨','기숙사수도'],preferred:['dorm_facility_report_board','route_dorm_general']},
 {domain:'facilities',aliases:['전기','조명','콘센트','전기안됨','전기고장','조명고장','형광등고장'],preferred:['route_fac_electric','facility_electrical']},
 {domain:'facilities',aliases:['에어컨','수도','배관','에어컨고장','에어컨안됨','냉방안됨','난방안됨','냉난방'],preferred:['route_fac_mechanical','facility_mechanical']},
 {domain:'facilities',aliases:['강의실고장','교내시설고장','학교시설고장','실습실고장'],preferred:['facility_fix','route_fac_general']},
 {domain:'facilities',aliases:['누수','물샘','물이샘','물이새','건물누수','천장누수','배관누수','화장실누수'],preferred:['facility_fix','route_fac_mechanical','route_fac_arch']},
 {domain:'it',aliases:['향림통오류','향림통안됨','향림통먹통','향림통에러','향림통'],preferred:['route_it_portal','it_portal_hyanglim_support']},
 {domain:'it',aliases:['학교와이파이','교내와이파이','와이파이','wifi','학교인터넷'],preferred:['wifi','route_it_network']},
 {domain:'it',aliases:['eduroam','에듀롬','타대학와이파이','다른대학와이파이'],preferred:['eduroam']},
 {domain:'international',aliases:['교환학생','교환유학','해외교환','해외대학파견'],preferred:['route_intl_exchange','international_exchange_contact']},
 {domain:'international',aliases:['유학생비자','외국인비자','학생비자','비자연장'],preferred:['route_intl_visa','international_foreign_student']},
 {domain:'career',aliases:['취업','취업상담','취업도움','취업컨설팅','취업센터','진로상담'],preferred:['route_career_clinic','career_center_general','route_career_general']},
 {domain:'career',aliases:['자소서','자기소개서','자소서첨삭','이력서첨삭','자소서봐줘'],preferred:['route_career_clinic']},
 {domain:'development',aliases:['발전기금','발전지원금','발전지원재단','학교기부','학교에기부','대학기부','기탁금','후원금'],preferred:['route_fund_general','development_fund_donation']},
 {domain:'development',aliases:['기부금영수증','기부영수증','발전기금영수증'],preferred:['route_fund_receipt','development_fund_receipt']},
 {domain:'library',aliases:['책반납','책대출','책빌리기','도서대출','도서반납','도서연체'],preferred:['route_library_borrow']},
 {domain:'library',aliases:['도서관','중앙도서관','열람실'],preferred:['route_library_general','route_library_borrow']},
 {domain:'admin',aliases:['정보공개','정보공개청구','정보공개신청','행정정보공개'],preferred:['route_admin_info_disclosure','general_information_disclosure']},
 {domain:'career',aliases:['현장실습','학교인턴','학점인턴','현장인턴'],preferred:['field_training_center']},
 {domain:'student',aliases:['학식','학생식당','학교밥','식단','학교식당'],preferred:['route_student_cafeteria']},
 {domain:'admission',aliases:['학종','학생부종합','학생부종합전형'],preferred:['admission_student_record_v4']},
 {domain:'finance',aliases:['학비나눠내기','학비분납','등록금분납','등록금나눠내기'],preferred:['tuition_installment']},
 {domain:'student',aliases:['대동제','향림대동제','축제담당'],preferred:['route_student_festival_org']},
 {domain:'career',aliases:['취업상담','취업컨설팅','진로취업상담'],preferred:['route_career_clinic','career_center_general']},
 {domain:'career',aliases:['진로상담','진로고민','진로컨설팅'],preferred:['route_career_clinic','career_counsel']},
 {domain:'library',aliases:['연체','도서연체','책연체'],preferred:['route_library_borrow']},

 {domain:'counseling',aliases:['개인상담','심리상담','심리상닿','마음상담','학생상담센터'],preferred:['personal_counsel']},
 {domain:'counseling',aliases:['심리검사','성격검사','적성검사'],preferred:['psych_test']},
 {domain:'counseling',aliases:['집단상담','상담프로그램','또래상담'],preferred:['group_counsel']},
 {domain:'student',aliases:['학생보험','학생상해보험','교내사고보험','학교에서다쳐'],preferred:['student_insurance','route_student_health_insurance']},
 {domain:'planning',aliases:['기획처','기획조정과','국립대학육성사업','육성사업','공간조정'],preferred:['planning_general','planning_finance_project','planning_space']},
 {domain:'special_program',aliases:['sw중심대학사업단','sw중심대학','sw사업단','nova','ai인재양성부트캠프사업단','ai인재양성부트캠프','ai인재양성사업단','ai부트캠프사업단','ai부트캠프','부트캠프사업단','바이브코딩','aura','a.u.r.a','axopenlab','ax오픈랩','소버린ai','에이전틱ai','청년도약ai','rise사업단','라이즈사업단','gtep','gtep사업단','지텝'],preferred:['ai_bootcamp_vibecoding_contest','ai_bootcamp_general','ai_bootcamp_cloud_training','ai_bootcamp_platforms','ai_bootcamp_youth_program','sw_center_general','rise_general','gtep_general']},
 {domain:'lifelong',aliases:['평생교육원','평생교육과정','일반인강좌'],preferred:['lifelong_general']},
 {domain:'institution',aliases:['과학영재교육원','영재교육원','과학영재'],preferred:['science_gifted_general']},
 {domain:'student',aliases:['학생증','학생카드','모바일학생증','학생신분증'],preferred:['student_id_first','student_id_ic','student_id_reissue']},
 {domain:'admission',aliases:['입학','입시','수시','정시','편입'],preferred:['admission_counsel_general','admission_early_v4','admission_transfer_v4']},
 {domain:'facilities',aliases:['시설','시설물','교내시설'],preferred:['facility_fix','route_fac_general','route_fac_arch']},
 {domain:'academic',aliases:['교직','교직과정','교원자격'],preferred:['teacher_course','route_academic_teacher','teacher_cert_reissue']},
 {domain:'research_ethics',aliases:['irb','인간대상연구','인체유래물','연구윤리','연구부정','연구진실성','동물실험윤리'],preferred:['route_bioethics','route_research_ethics']},
 {domain:'graduate_school',aliases:['대학원','대학원입시','대학원학적','대학원장학'],preferred:['route_grad_general','route_grad_admission_thesis','route_grad_record','route_grad_scholarship']},
 {domain:'international',aliases:['유학생입학','외국인입학','외국인유학생입학'],preferred:['route_intl_foreign_admission','admission_foreign_v4']},
 {domain:'lifelong',aliases:['평생교육원','평생교육과정','일반인강좌'],preferred:['lifelong_general']},
 {domain:'research',aliases:['연구','연구비','연구과제','산학협력'],preferred:['research_industry_contact','route_research_general','research_rd_notice']},
 {domain:'startup',aliases:['창업','창업지원','창업사업'],preferred:['startup_program','startup_search','startup_center_general']},
 {domain:'academic',aliases:['전공','다전공','복수전공','부전공'],preferred:['multi_major_guide','double_major','minor']},
];
const GENERIC_SEARCH_TERMS=new Set(['신청','문의','안내','이용','예약','확인','상담','지원','관리','조회','변경','취소','등록','발급','처리','추천','오늘','내일','점심','저녁','아침','뭐먹지','뭐먹','게임','학교']);
function normalizeQuery(x=''){try{return String(x).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,'');}catch(_){return normalize(x);}}
function splitQuery(x=''){return String(x).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).filter(Boolean);}
function buildSearchIndex(){
 SEARCH_INDEX=services.map(s=>{
   const highRaw=[s.title,s.department?.name,...(s.aliases||[]),...(s.route_keywords||[])].filter(Boolean);
   const midRaw=[s.category,...(s.search_terms||[]),...(s.situations||[])].filter(Boolean);
   const lowRaw=[s.description].filter(Boolean);
   const high=highRaw.map(normalizeQuery),mid=midRaw.map(normalizeQuery),low=lowRaw.map(normalizeQuery);
   const all=[...high,...mid,...low].filter(Boolean);
   const tokenSet=new Set([...highRaw,...midRaw,...lowRaw].flatMap(splitQuery).map(normalizeQuery).filter(x=>x.length>=2&&!GENERIC_SEARCH_TERMS.has(x)));
   return {service:s,high,mid,low,all,joined:all.join(' '),title:normalizeQuery(s.title),dept:normalizeQuery(s.department?.name||''),tokenSet};
 });
 SEARCH_DOC_COUNT=SEARCH_INDEX.length;SEARCH_DF=new Map();
 for(const e of SEARCH_INDEX)for(const t of e.tokenSet)SEARCH_DF.set(t,(SEARCH_DF.get(t)||0)+1);
 // Pre-index curated situations once. The natural-language exact-situation guard sits on the
 // hot search path, so rescanning all 411 services and every situation on each keystroke/search
 // would be unnecessarily expensive, especially on mobile.
 EXACT_SITUATION_GROUP_MAP=new Map();
 for(const s of services)for(const raw of (s.situations||[])){
   const n=normalizeQuery(raw);if(!n)continue;
   let groups=EXACT_SITUATION_GROUP_MAP.get(n);if(!groups){groups=new Map();EXACT_SITUATION_GROUP_MAP.set(n,groups);}
   const g=serviceIntentGroup(s),prev=groups.get(g);if(!prev||s.id===g)groups.set(g,s);
 }
 buildKeywordAnchorIndex();
 // Build literal ownership only after the service dataset has loaded. These sets are declared
 // later in the file but are initialized before init() invokes buildSearchIndex().
 EXPLICIT_KEYWORD_LITERAL_SET.clear();EXPLICIT_KEYWORD_TOKEN_ROUTE_CACHE.clear();
 for(const service of services)for(const value of [service.title,...(service.aliases||[]),...(service.route_keywords||[])]){
   const key=String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();if(key)EXPLICIT_KEYWORD_LITERAL_SET.add(key);
 }
}
function detectConcept(q){
 const norms=[normalizeQuery(q),normalizeQuery(loosenQuery(q))].filter(Boolean);let best=null;
 for(const c of SEARCH_CONCEPTS)for(const a0 of c.aliases){const a=normalizeQuery(a0);for(const n of norms){let strength=0;if(n===a)strength=4;else if(n.includes(a))strength=3;else if(a.includes(n)&&n.length>=3)strength=2;else if(n.length>=3&&a.length>=3&&editDistanceOne(n,a))strength=a.length>=4?3.6:1;if(strength){const score=strength*1000+Math.min(n.length,a.length)*20;if(!best||score>best.score)best={...c,alias:a0,score};}}}
 return best;
}

function makeBigrams(s){s=normalizeQuery(s);const a=[];for(let i=0;i<s.length-1;i++)a.push(s.slice(i,i+2));return a;}
function diceSimilarity(a,b){const A=makeBigrams(a),B=makeBigrams(b);if(!A.length||!B.length)return normalizeQuery(a)===normalizeQuery(b)?1:0;const m=new Map();for(const x of A)m.set(x,(m.get(x)||0)+1);let o=0;for(const x of B){const n=m.get(x)||0;if(n){o++;m.set(x,n-1);}}return 2*o/(A.length+B.length);}
function editDistanceOne(a,b){a=normalizeQuery(a);b=normalizeQuery(b);if(Math.abs(a.length-b.length)>1)return false;if(a===b)return true;let i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}return d+(i<a.length||j<b.length?1:0)<=1;}

const GENERIC_CONCEPT_ALIASES=new Set(['기숙사','생활관','학생생활관','연구','와이파이','wifi','취업','장학','장학금','학생증','시설','입학','입시','수시','정시','편입','대학원','창업','전공','다전공','버스','통학','통학버스','셔틀','도서관','교직']);

function scoreSearchEntry(e,q,concept){
 const n=normalizeQuery(q); if(!n)return 0;
 if(e.service.kind==='academic_directory'&&['전공','학과','스쿨','대학','학부'].includes(n))return 0;
 let s=0;
 if(e.title===n)s=2600; else if(e.title.includes(n))s=Math.max(s,1450+n.length*35); else if(n.includes(e.title)&&e.title.length>=2)s=Math.max(s,1050+e.title.length*25);
 if(e.dept===n)s=Math.max(s,2200); else if(e.dept&&e.dept.includes(n))s=Math.max(s,1250+n.length*25);
 for(const x of e.high){if(x===n)s=Math.max(s,2400);else if(x.includes(n))s=Math.max(s,1320+n.length*30);else if(n.includes(x)&&x.length>=2&&!GENERIC_SEARCH_TERMS.has(x))s=Math.max(s,930+x.length*20);}
 for(const x of e.mid){if(x===n)s=Math.max(s,2100);else if(x.includes(n))s=Math.max(s,1080+n.length*27);else if(n.includes(x)&&x.length>=2&&!GENERIC_SEARCH_TERMS.has(x))s=Math.max(s,760+x.length*17);}
 const toks=splitQuery(q).map(normalizeQuery).filter(x=>x.length>=2);if(toks.length){let hit=0,idfBonus=0;for(const t of toks){if(e.joined.includes(t)){hit++;const df=SEARCH_DF.get(t)||SEARCH_DOC_COUNT;const idf=Math.log((SEARCH_DOC_COUNT+1)/(df+1))+1;idfBonus+=Math.min(95,Math.round(26*idf));}}s+=hit*105+idfBonus;if(toks.length>1&&hit===toks.length)s+=220;}
 if(concept){
   const base=s;const i=concept.preferred.indexOf(e.service.id);const alias=normalizeQuery(concept.alias||'');
   const detailed=GENERIC_CONCEPT_ALIASES.has(alias)&&n.length>=alias.length+2;
   if(i>=0)s+=(detailed?360:1450)-i*(detailed?45:120);
   else if(base>0&&e.service.domain===concept.domain)s+=detailed?180:120;
 }
 return s;
}
function fuzzyFallback(q,ranked){
 const n=normalizeQuery(q);if(n.length<3)return ranked;const candidates=[];
 for(const e of SEARCH_INDEX){let sim=diceSimilarity(n,e.title);if(sim>=.48)candidates.push({service:e.service,score:sim*620+250});else if(n.length<=10&&e.title.length<=14&&editDistanceOne(n,e.title))candidates.push({service:e.service,score:620});}
 return candidates.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}
const BROAD_CONCEPTS=new Set(['버스','통학','통학버스','통학버스대여','셔틀','장학','장학금','기숙사','생활관','도서관','취업','학생증','시설','입학','수시','정시','편입','교직','연구','창업','전공','성적','학점','졸업','등록금','상담','전기','에어컨','수도','배관','조명','수업','과목','학비','자료공개','사업단','센터']);
const MULTI_DOMAIN_BROAD=new Set(['버스','상담','편입','전공']);
const GENERIC_BROAD_PREFERRED={
 '성적':'grade_lookup','학점':'grade_lookup','졸업':'graduation_requirements','등록금':'tuition_payment',
 '상담':'personal_counsel','전기':'route_fac_electric','에어컨':'route_fac_mechanical',
 '수업':'course_registration','과목':'course_registration','학비':'tuition_payment',
 '자료공개':'general_information_disclosure','메이커스페이스':'maker'
};
function diversifyResults(ranked,max=7){
 const out=[],used=new Set();
 for(const x of ranked){const d=x.service.domain||x.service.category||'other';if(!used.has(d)){out.push(x);used.add(d);if(out.length>=max)return out;}}
 for(const x of ranked){if(!out.includes(x)){out.push(x);if(out.length>=max)break;}}
 return out;
}

const QUERY_STOP_WORDS=new Set(['신청','문의','안내','이용','예약','확인','상담','지원','관리','조회','변경','취소','등록','발급','처리','추천','오늘','내일','점심','저녁','아침','뭐먹지','뭐먹','게임','학교','좀','싶어','싶다','해줘','알려줘','어디','어디야','관련','담당','결과','바꾸고','바꾸기','바꿔','변경하고']);
function meaningfulTokens(q){
 let ts=splitQuery(q).map(normalizeQuery).filter(t=>t.length>=2&&!QUERY_STOP_WORDS.has(t));
 if(!ts.length){const n=normalizeQuery(q);if(n.length>=2&&!QUERY_STOP_WORDS.has(n))ts=[n];}
 return ts;
}
function entryHasMeaning(e,q){const ts=meaningfulTokens(q);if(!ts.length)return false;return ts.some(t=>e.joined.includes(t));}
function typoCandidates(q){const n=normalizeQuery(q);if(n.length<4||n.length>24)return [];const out=[];for(const e of SEARCH_INDEX){let best=false;for(const x of [e.title,...e.high].filter(Boolean)){if(Math.abs(x.length-n.length)<=1&&editDistanceOne(n,x)){best=true;break;}}if(best)out.push({service:e.service,score:3600});}return out;}
function typoPhraseCandidates(q){
 const n=normalizeQuery(q);if(n.length<4||n.length>30)return [];
 const out=[];const seen=new Set();
 for(const e of SEARCH_INDEX){
   let hit=false;
   for(const x of [...e.high,...e.mid]){if(!x||x.length<4)continue;if(Math.abs(x.length-n.length)<=1&&editDistanceOne(n,x)){hit=true;break;}}
   if(hit&&!seen.has(e.service.id)){seen.add(e.service.id);out.push({service:e.service,score:3450});}
 }
 return out;
}
function contextRoute(q){const n=normalizeQuery(q);let id=null;
 if(['컴퓨터학과','컴퓨터전공','컴퓨터관련학과','컴퓨터관련전공'].includes(n))id='directory_academic_units_general';
 else if(n==='컴공')id='directory_aerospace_materials';
 if(id){const dir=services.find(x=>x.id===id);if(dir)return {status:'answer',items:[{service:dir,score:5980}],reason:'directory_context'};}
 if((n.includes('감기약')||n.includes('상비약')||n.includes('보건실')||n.includes('보건진료실')||(n.includes('약')&&(n.includes('학교에서')||n.includes('교내')||n.includes('받을수')))))id='health_clinic';
 if(id){const hc=services.find(x=>x.id===id);if(hc)return {status:'answer',items:[{service:hc,score:5970}],reason:'context_priority'};}
 if((n.includes('다른과로')||n.includes('다른과에'))&&(n.includes('가고싶')||n.includes('옮기')||n.includes('변경')))id='major_transfer';
 if(id){const mt=services.find(x=>x.id===id);if(mt)return {status:'answer',items:[{service:mt,score:5960}],reason:'context_priority'};}
 if(n==='다전공'||n==='다전공제도'||n==='다전공안내'||n==='다전공문의')id='multi_major_guide';
 if(id){const mm=services.find(x=>x.id===id);if(mm)return {status:'answer',items:[{service:mm,score:5950}],reason:'context_priority'};}
 if((n.includes('학생증'))&&(n.includes('분실')||n.includes('잃어버')||n.includes('잃어')||n.includes('재발급')||n.includes('훼손')))id='student_id_reissue';
 else if((n.includes('교원자격증')||n.includes('교사자격증'))&&(n.includes('분실')||n.includes('잃어버')||n.includes('잃어')||n.includes('재발급')||n.includes('정정')))id='teacher_cert_reissue';
 else if((n.includes('주웠')||n.includes('습득'))&&(n.includes('물')||n.includes('지갑')||n.includes('카드')||n.includes('폰')||n.includes('휴대폰')||n.includes('학생증')))id='found_item_post';
 else if((n.includes('분실')||n.includes('잃어버')||n.includes('잃어')||n.includes('분실물'))&&(n.includes('찾')||n.includes('없')||n.includes('잃')||n.includes('분실')))id='lost_item_board';
 else if(n.startsWith('재입학')||n.includes('재입학문의'))id='readmission';
 else if(n.startsWith('복학')&&!n.includes('전역')&&!n.includes('군')&&!n.includes('등록금')&&!n.includes('학비'))id='return';
 else if(n.includes('창업')&&(n.includes('교육')||n.includes('강좌')||n.includes('수업')||n.includes('스쿨')||n.includes('비교과')))id='route_startup_class';
 else if(n.includes('대학회계직')||n.includes('대학회계계약직')||n.includes('회계계약직'))id='route_accounting_staff_hr';
 else if((n.includes('면접')||n.includes('취업'))&&(n.includes('옷')||n.includes('복장')||n.includes('이미지메이킹')))id='image_making';
 else if((n.includes('등록금')||n.includes('학비'))&&n.includes('확인')&&!n.includes('증명')&&!n.includes('고지'))id='tuition_check';
 else if((n.includes('학교장학')||n.includes('교내장학'))&&!n.includes('국가')&&!n.includes('재단'))id='route_student_internal_scholarship';
 if(id){const sp=services.find(x=>x.id===id);if(sp)return {status:'answer',items:[{service:sp,score:5900}],reason:'context_priority'};}
 if(n.includes('복학')&&(n.includes('등록금')||n.includes('학비'))&&(n.includes('처리')||n.includes('안됨')||n.includes('안되')||n.includes('냈')||n.includes('납부')))id='return_tuition';
 else if((n.includes('전역전')||n.includes('아직전역')||n.includes('전역전에'))&&(n.includes('복학')||n.includes('학교')||n.includes('갈수')))id='return_before_discharge';
 else if((n.includes('친구관계')||n.includes('대인관계')||n.includes('연애')||n.includes('가족문제')||n.includes('룸메')||n.includes('싸웠')||n.includes('갈등')||n.includes('화해'))&&(n.includes('고민')||n.includes('상담')||n.includes('힘들')||n.includes('어떻게')))id='personal_counsel';
 else if((n.includes('자퇴')||n.includes('휴학')||n.includes('편입')||n.includes('대학원'))&&(n.includes('갈까말까')||n.includes('할까말까'))&&(n.includes('고민')||n.includes('상담')))id='personal_counsel';
 else if((n.includes('마음')||n.includes('심리')||n.includes('정서'))&&(n.includes('힘들')||n.includes('상담')||n.includes('고민'))&&!['학과','전공','어디','소속'].some(x=>n.includes(x)))id='personal_counsel';
 if(id){const s00=services.find(x=>x.id===id);if(s00)return {status:'answer',items:[{service:s00,score:5850}],reason:'context_priority'};}
 if((n.includes('계절학기')||n.includes('방학수업')||n.includes('여름학기')||n.includes('겨울학기'))&&!(n.includes('수강료')||n.includes('납부')))id='seasonal';
 else if((n.includes('폐지')||n.includes('없어진')||n.includes('사라진'))&&(n.includes('과목')||n.includes('교과목')||n.includes('재수강')||n.includes('다시')))id='retake_replace';
 else if((n.includes('개명')||n.includes('이름변경')||n.includes('이름바'))&&(n.includes('학적')||n.includes('학교')||n.includes('기록')||n.includes('증명')))id='record_name';
 else if((n.includes('등록금')||n.includes('학비'))&&(n.includes('냈')||n.includes('납부'))&&(n.includes('확인')||n.includes('처리')||n.includes('됐')||n.includes('되었')))id='tuition_check';
 else if((n.includes('등록금')||n.includes('학비'))&&(n.includes('분할')||n.includes('분납')||n.includes('나눠')))id='tuition_installment';
 else if((n.includes('과옮기')||n.includes('학과옮기')||n.includes('과바꾸')||n.includes('학과바꾸'))&&!n.includes('같은학부'))id='major_transfer';
 else if(n.includes('학생회')&&!n.includes('학생회관'))id='student_council_contact';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('냉장고')))id='dorm_refrigerator';
 else if((n.includes('룸메')||n.includes('룸메이트'))&&(n.includes('싸웠')||n.includes('갈등')||n.includes('문제')||n.includes('힘들')||n.includes('상담')))id='dorm_counsel';
 else if(n.includes('룸메')||n.includes('룸메이트'))id='dorm_roommate';
 else if((n==='기숙사비'||n==='생활관비'||((n.includes('기숙사')||n.includes('생활관'))&&n.includes('비')&&(n.includes('납부')||n.length<=6))))id='dorm_payment';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('에어컨')||n.includes('에어콘')||n.includes('온수')||n.includes('형광등')||n.includes('세면대')||n.includes('고장')))id='dorm_facility_report_board';
 else if((n.includes('다른대학')||n.includes('타대학')||n.includes('타학교'))&&(n.includes('와이파이')||n.includes('wifi')))id='eduroam';
 else if(n.includes('연구')&&(n.includes('기자재')||n.includes('장비')||n.includes('물품'))&&(n.includes('구매')||n.includes('구입')||n.includes('계약')))id='route_research_purchase';
 else if(n.includes('sw중심대학'))id='sw_center_general';
 else if(n==='지텝'||n.includes('gtep'))id='gtep_general';
 if(id){const s0=services.find(x=>x.id===id);if(s0)return {status:'answer',items:[{service:s0,score:5800}],reason:'context'};}
 if((n.includes('개인사정')||n.includes('사정'))&&(n.includes('쉬')||n.includes('휴학')))id='leave_general';
 else if((n.includes('장학')||n.includes('수혜'))&&(n.includes('증명')||n.includes('확인서')||n.includes('내역')))id='cert_scholarship';
 else if((n.includes('전액장학생')||n.includes('전액장학'))&&(n.includes('0원')||n.includes('등록')))id='tuition_zero';
 else if((n.includes('등록금')||n.includes('학비'))&&(n.includes('환불')||n.includes('반환')||n.includes('돌려'))&&(n.includes('자퇴')||n.includes('휴학')||n.includes('등록금')||n.includes('학비')))id='tuition_refund';
 else if(n.includes('대학원')&&n.includes('장학'))id='route_grad_scholarship';
 else if((n.includes('발전기금')||n.includes('발전지원')||n.includes('기부'))&&n.includes('장학'))id='route_fund_scholarship';
 else if(n.includes('농업')&&n.includes('현장실습'))id='route_agri_training';
 else if((n.includes('개인상담')||n.includes('심리상담')||n.includes('심리상닿')||n.includes('마음상담'))&&!n.includes('성폭')&&!['학과','전공','어디','소속'].some(x=>n.includes(x)))id='personal_counsel';
 else if(n.includes('심리검사')||n.includes('성격검사')||n.includes('적성검사'))id='psych_test';
 else if(n.includes('집단상담')||n.includes('또래상담'))id='group_counsel';
 else if((n.includes('학비')||n.includes('등록금'))&&(n.includes('나눠')||n.includes('분납')))id='tuition_installment';
 else if(n.includes('대동제')||((n.includes('축제'))&&(n.includes('담당')||n.includes('문의'))))id='route_student_festival_org';
 else if(n.includes('취업')&&(n.includes('상담')||n.includes('컨설팅')))id='route_career_clinic';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('추가모집')||n.includes('추가합격')))id='dorm_additional_application';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('와이파이')||n.includes('인터넷')||n.includes('랜선')))id='dorm_internet';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('출입')||n.includes('문이안')||n.includes('출입카드')))id='dorm_access_rules';
 else if((n.includes('기숙사')||n.includes('생활관'))&&(n.includes('고장')||n.includes('형광등')||n.includes('세면대')||n.includes('온수')||n.includes('에어컨')))id='dorm_facility_report_board';
 else if(n.includes('장애학생')&&(n.includes('상담')||n.includes('진로')||n.includes('학교생활')))id='disability_counsel';
 else if(n.includes('등록휴학생')&&n.includes('복학'))id='return_tuition';
 else if(n.includes('lms')||n.includes('e캠퍼스')||n.includes('이캠퍼스')||n.includes('원격수업'))id='route_innov_lms';
 else if((n.includes('진로'))&&(n.includes('상담')||n.includes('고민')||n.includes('컨설팅')))id='route_career_clinic';
 else if((n.includes('연체')||n.includes('도서연체')||n.includes('책연체')))id='route_library_borrow';
 else if((n.includes('농업')||n.includes('농대'))&&n.includes('현장실습'))id='route_agri_training';
 else if((n.includes('등록금')||n.includes('학비'))&&(n.includes('증명')||n.includes('교육비납입')||n.includes('연말정산')))id='cert_tuition';
 else if((n.includes('교환학생')||n.includes('해외대학')||n.includes('국외'))&&n.includes('학점'))id='international_exchange_credit';
 else if(n.includes('열람실')&&(n.includes('시설')||n.includes('예약')||n.includes('사물함')||n.includes('공간')))id='route_library_room';
 else if(n.includes('대학원')&&(n.includes('등록')||n.includes('회계'))&&!n.includes('입학'))id='route_grad_record';
 else if(n.includes('편입')&&(n.includes('동일과목')||n.includes('중복과목')||n.includes('중복')))id='transfer_duplicate_course';
 else if(n.includes('편입')&&(n.includes('교육과정')||n.includes('어떤과목')||n.includes('졸업학점')))id='transfer_curriculum';
 else if(n.includes('시험')&&(n.includes('학생증')||n.includes('신분증')))id='exam_id_requirement';
 else if((n.startsWith('융합전공')||n.startsWith('연계전공')||n.startsWith('융합연계전공'))&&!['어디','학과','위치','찾','알려','안내'].some(x=>n.includes(x)))id='convergence_major';
 else if((n.includes('유학생')||n.includes('외국인'))&&n.includes('대학원')&&n.includes('입학'))id='route_intl_foreign_admission';
 else if(n.includes('대학원')&&(n.includes('입학')||n.includes('논문')))id='route_grad_admission_thesis';
 else if(n.includes('대학원')&&(n.includes('휴학')||n.includes('휴핫')||n.includes('복학')||n.includes('학적')))id='route_grad_record';
 else if(n.includes('점수')&&(n.includes('이상')||n.includes('잘못')||n.includes('정정')))id='grade_correction_period';
 else if(n.includes('일반대학원')&&n.includes('논문'))id='route_grad_admission_thesis';
 const s=id?services.find(x=>x.id===id):null;return s?{status:'answer',items:[{service:s,score:5700}],reason:'context'}:null;}

const KOREAN_PARTICLES=['에서는','에게서','한테서','으로부터','로부터','까지','부터','에게','한테','에서','에는','으로는','로부터','처럼','보다'];
const KOREAN_ENDINGS=['문의드려요','문의드립니다','하고싶어요','하고싶어','받고싶어요','받고싶어','알고싶어요','알고싶어','할래요','해요','드려요','이에요','예요','이야','입니다','인데요','인데','이요','요'];
function loosenQuery(q){
 const raw=String(q||'').normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).filter(Boolean);
 const out=[];
 const drop=new Set(['문의드려요','문의드립니다','문의','알려줘','알려주세요','해주세요','해줘','부탁해요','부탁드립니다']);
 for(let t of raw){
   if(drop.has(t))continue;
   for(const e of KOREAN_ENDINGS){if(t.endsWith(e)&&t.length-e.length>=2){t=t.slice(0,-e.length);break;}}
   for(const p of KOREAN_PARTICLES){if(t.endsWith(p)&&t.length-p.length>=2){t=t.slice(0,-p.length);break;}}
   if(t)out.push(t);
 }
 return out.join(' ');
}

function strongRouteKeywordMatches(q){
 const norms=[normalizeQuery(q),normalizeQuery(loosenQuery(q))].filter(Boolean);if(!norms.length)return [];
 const out=[];
 for(const s of services){
   if(s.kind==='academic_directory'||s.kind==='academic_directory_general')continue;
   let best=0;
   for(const raw of (s.route_keywords||[])){
     const x=normalizeQuery(raw);if(!x)continue;
     for(const n of norms){
       if(n===x)best=Math.max(best,5950);
       else if(x.length>=4&&n.includes(x))best=Math.max(best,5650+Math.min(x.length,30));
     }
   }
   if(best)out.push({service:s,score:best});
 }
 return out.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}


// v7.3 keyword-first resolver ----------------------------------------------------
// The product's primary contract is exact/compact keyword routing. Natural-language
// interpretation is a convenience layer only and must never overwrite catalog-backed
// keywords that the user explicitly typed.  This resolver therefore activates only when
// catalog anchors cover the complete normalized input (apart from separators).  Longest
// spans win, so compound keywords such as "창업휴학" are never split into "창업 + 휴학".
const KEYWORD_BROAD_PREFERRED_IDS={
 '장학':['scholarship_guide'],'장학금':['scholarship_guide'],'국가장학':['sch_national'],
 '기숙사':['route_dorm_general'],'생활관':['route_dorm_general'],'학생생활관':['route_dorm_general'],
 '동아리':['central_club_info'],'비교과':['extracurricular'],
 '퇴실':['dorm_move_out'],'입실':['dorm_move_in'],'기숙사퇴실':['dorm_move_out'],'생활관퇴실':['dorm_move_out'],
 '제적':['dismissal'],'계절학기':['seasonal'],'육아휴학':['leave_parental'],
 '실내체육관':['gym'],'학생상해보험':['route_student_health_insurance'],
 '외국어교육':['language_program'],'수업시간표':['timetable'],'수강내역확인':['course_check'],'수강신청정정':['course_change'],
 '교원자격증':['route_academic_teacher'],'교사자격증':['route_academic_teacher'],
 '휴학':['leave_general'],'일반휴학':['leave_general'],'병역휴학':['leave_military'],'군휴학':['leave_military'],'창업휴학':['leave_startup'],
 '복학':['return'],'자퇴':['withdrawal'],'재입학':['readmission'],
 '전과':['major_transfer'],'복수전공':['double_major'],'부전공':['minor'],
 '수강신청':['course_registration'],'성적정정':['grade_correction_period'],
 '성적증명서':['cert_transcript'],'재학증명서':['cert_enroll'],'졸업증명서':['cert_graduation'],
 '국가장학금':['sch_national'],'학자금대출':['student_loan'],'학생증재발급':['student_id_reissue'],
 '보건소':['health_clinic'],'분실물':['lost_item_board'],'학교차량':['school_vehicle'],
 'rotc':['rotc_info'],'학군단':['rotc_info'],'통학버스':['shuttle'],'셔틀':['shuttle'],
 '향림통':['hyanglim'],'e캠퍼스':['ecampus'],'ecampus':['ecampus'],'오피스365':['office365'],'office365':['office365'],
 '모의토익':['mock_toeic'],'aura':['ai_bootcamp_platforms'],
 '정보공개':['general_information_disclosure'],'등록금':['tuition_payment'],'등록금납부':['tuition_payment'],
 '취업상담':['career_counsel'],'진로상담':['career_counsel'],'심리상담':['personal_counsel'],'인권침해':['human_rights_contact'],
 '교환학생':['exchange_student'],'유학생비자':['route_intl_visa'],'교직':['teacher_course'],
 'irb':['route_bioethics'],'연구윤리':['route_research_ethics'],'창업지원':['startup_center_general'],'발전기금':['route_fund_general']
}
const KEYWORD_AMBIGUOUS_IDS={
 '대출':['student_loan','route_library_borrow'],
 '한국장학재단':['scholarship_guide','sch_national','student_loan','sch_blue'],
 '회계':['route_finance_general','directory_animation_culture','route_grad_record'],
 '추가모집':['admission_early_v4','dorm_additional_application'],
 '냉난방':['route_fac_mechanical','dorm_hvac'],
 '상담':['personal_counsel','career_counsel','admission_counsel_general','dorm_counsel','human_rights_contact']
};
const KEYWORD_ANCHOR_STOP=new Set(['신청','문의','안내','이용','예약','확인','상담','지원','관리','조회','변경','취소','등록','발급','처리','담당','업무','학교','학생','관련']);
function buildKeywordAnchorIndex(){
 KEYWORD_ANCHOR_MAP=new Map();
 const add=(raw,id,source)=>{
   const term=normalizeQuery(raw);if(!term||term.length<2||KEYWORD_ANCHOR_STOP.has(term))return;
   let rec=KEYWORD_ANCHOR_MAP.get(term);if(!rec){rec={term,owners:new Set(),titleOwners:new Set(),routeOwners:new Set(),aliasOwners:new Set(),policyOwners:new Set()};KEYWORD_ANCHOR_MAP.set(term,rec);}
   rec.owners.add(id);const bucket=source==='title'?rec.titleOwners:source==='route'?rec.routeOwners:source==='alias'?rec.aliasOwners:rec.policyOwners;bucket.add(id);
 };
 for(const s of services){
   add(s.title,s.id,'title');
   for(const x of (s.aliases||[]))add(x,s.id,'alias');
   for(const x of (s.route_keywords||[]))add(x,s.id,'route');
 }
 // Deliberately use a small canonical keyword policy instead of expanding every SEARCH_CONCEPTS
 // alias to every preferred service. The latter is useful for fuzzy natural language but is too
 // broad for exact keyword mode (e.g. SW중심대학사업단 must not expand to every AI program).
 for(const [term,ids] of Object.entries({...KEYWORD_BROAD_PREFERRED_IDS,...KEYWORD_AMBIGUOUS_IDS}))for(const id of ids)if(services.some(s=>s.id===id))add(term,id,'policy');
 KEYWORD_ANCHORS=[...KEYWORD_ANCHOR_MAP.values()].sort((a,b)=>b.term.length-a.term.length||a.term.localeCompare(b.term));
 KEYWORD_ANCHORS_BY_FIRST=new Map();
 for(const rec of KEYWORD_ANCHORS){const ch=rec.term[0];if(!KEYWORD_ANCHORS_BY_FIRST.has(ch))KEYWORD_ANCHORS_BY_FIRST.set(ch,[]);KEYWORD_ANCHORS_BY_FIRST.get(ch).push(rec);}
 // Precompute literal strong expressions per canonical intent group. Facet-tail protection uses
 // this index so repeated title/route synonyms do not require scanning all 411 services per query.
 KEYWORD_STRONG_LITERALS_BY_GROUP=new Map();
 KEYWORD_TITLE_NORMS_BY_GROUP=new Map();
 const lit=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
 for(const svc of services){
   const group=serviceIntentGroup(svc);if(!group)continue;
   if(!KEYWORD_STRONG_LITERALS_BY_GROUP.has(group))KEYWORD_STRONG_LITERALS_BY_GROUP.set(group,new Set());
   if(!KEYWORD_TITLE_NORMS_BY_GROUP.has(group))KEYWORD_TITLE_NORMS_BY_GROUP.set(group,new Set());
   const bucket=KEYWORD_STRONG_LITERALS_BY_GROUP.get(group),titleBucket=KEYWORD_TITLE_NORMS_BY_GROUP.get(group);
   const tn=normalizeQuery(svc.title||'');if(tn.length>=2)titleBucket.add(tn);
   for(const v of [svc.title,...(svc.aliases||[]),...(svc.route_keywords||[])]){const x=lit(v);if(x.length>=2)bucket.add(x);}
 }
}
function keywordRouteBaseTerm(term=''){
 let n=normalizeQuery(term);if(!n)return '';
 // These suffixes describe how a student phrases a route request, not a different task object.
 // Removing them lets us compare the actual object against a precise workflow title without
 // hard-coding individual Korean sentences.
 for(const suffix of ['담당자','담당부서','담당','문의','상담']){
   const s=normalizeQuery(suffix);if(n.length>=s.length+2&&n.endsWith(s)){n=n.slice(0,-s.length);break;}
 }
 return n;
}
function samePhoneSpecificWorkflowIds(rec){
 // Route cards are intentionally broad department umbrellas. Promote a route keyword to a narrower
 // workflow only when the SAME official phone also has a workflow whose own title/search language
 // explicitly names the requested task object. A shared department/phone alone is never enough.
 // This avoids false narrowing such as 생활관물품 -> 생활관 상담 or 주차정기권 -> 연장.
 if(!rec?.routeOwners?.size||rec.titleOwners?.size)return [];
 const base=keywordRouteBaseTerm(rec.term);if(base.length<3)return [];
 // A literal route request such as '학생증담당' or '국제교류문의' asks for the responsible
 // desk, not for an arbitrary sub-workflow. Preserve the route unless the catalog explicitly
 // declares the same phrase as a workflow alias (e.g. 수강신청 담당, 복학 담당).
 const routeRequestSuffix=['담당자','담당부서','담당','문의','상담'].some(x=>rec.term.endsWith(normalizeQuery(x)));
 if(routeRequestSuffix&&!rec.aliasOwners?.size)return [];
 const routeSvcs=[...rec.routeOwners].map(id=>services.find(s=>s.id===id)).filter(Boolean);
 if(!routeSvcs.length)return [];
 const phoneKeys=value=>{
   const raw=String(value||'');
   const hits=raw.match(/0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}/g)||[];
   const out=new Set(hits.map(normalizeQuery).filter(Boolean));
   if(!out.size){const fallback=normalizeQuery(raw);if(fallback)out.add(fallback);}
   return out;
 };
 const phoneSet=new Set();for(const s of routeSvcs)for(const key of phoneKeys(s.department?.phone||''))phoneSet.add(key);
 if(!phoneSet.size)return [];
 const candidates=[],objectMatches=[];
 for(const svc of services){
   if(svc.kind!=='workflow'||svc.browse_hidden)continue;
   const svcPhones=phoneKeys(svc.department?.phone||'');if(!svcPhones.size||![...svcPhones].some(x=>phoneSet.has(x)))continue;
   const title=normalizeQuery(svc.title||'');if(!title)continue;
   const fields=[...(svc.aliases||[]),...(svc.search_terms||[]),...(svc.situations||[])].map(normalizeQuery).filter(Boolean);
   const titleExact=title===base,titlePrefix=title.startsWith(base),titleContains=title.includes(base);
   const titleExtra=Math.max(0,title.length-base.length);
   const fieldExact=fields.some(v=>v===base),fieldPrefix=fields.some(v=>v.length>base.length&&v.startsWith(base));
   if(fieldExact||titleExact||titleContains)objectMatches.push({svc,title,fieldExact,titleExact,titleContains,titleExtra});
   const head=base.length>=4?base.slice(0,Math.min(3,base.length-1)):base;
   const tail=base.length>=4?base.slice(-2):base;
   const titleSplitMatch=base.length>=4&&titleExtra<=4&&title.includes(head)&&title.includes(tail);
   // A route keyword may promote to an existing workflow only when the workflow's VISIBLE title
   // itself names the requested object. Merely sharing a phone or a hidden search term is not enough.
   // Short visible expansions such as 국가근로->국가근로장학, LMS->e-캠퍼스(LMS),
   // 열람실->일반열람실 이용 are safe; long branch-specific expansions such as
   // 사회봉사->사회봉사 교과목 이수 remain on the umbrella route unless the user adds that facet.
   const shortVisibleMatch=(titlePrefix||titleContains)&&titleExtra<=4;
   const exactFieldVisibleMatch=fieldExact&&titleContains;
   if(!(titleExact||shortVisibleMatch||exactFieldVisibleMatch||titleSplitMatch))continue;
   let score=0;
   if(titleExact)score+=220;
   else if(shortVisibleMatch){
     score+=150-Math.min(40,titleExtra);
     if(titleExtra<=2)score+=80;else if(titleExtra<=4)score+=30;
     if(titleContains&&!titlePrefix)score-=8;
   }
   if(fieldExact)score+=90;
   if(fieldPrefix)score+=45;
   score+=Math.round(diceSimilarity(base,title)*30);
   candidates.push({svc,score,titleExact,titlePrefix,fieldExact,fieldPrefix});
 }
 if(!candidates.length)return [];
 // A bare keyword can legitimately cover several workflows at the same desk (학생증, 강의평가,
 // 사회봉사, etc.). Do not arbitrarily pick one branch. Only a single explicit general-guide
 // workflow may represent such a family; otherwise preserve the umbrella route.
 if(objectMatches.length>1){
   // A short suffix is NOT automatically a general workflow. Action words such as '연장' are
   // short too, and treating them as generic made a bare object (`주차정기권`) collapse to one
   // arbitrary branch (`주차 정기권 연장`). Only explicitly general/default workflow suffixes
   // may represent a multi-branch family without an action word from the user.
   const genericSuffixes=new Set(['','제','수강','안내','문의','상담','정보','정보문의','일반문의','제도','제도찾기','종류찾기','이용','이용안내']);
   const generic=objectMatches.filter(x=>{
     if(!x.title.startsWith(base))return /(?:제도찾기|정보문의|일반문의|종류찾기|이용안내)$/u.test(x.title);
     const suffix=x.title.slice(base.length);
     return genericSuffixes.has(suffix);
   });
   if(generic.length===1)return [generic[0].svc.id];
   return [];
 }
 candidates.sort((a,b)=>b.score-a.score||a.svc.title.length-b.svc.title.length||a.svc.id.localeCompare(b.svc.id));
 if(candidates.length===1)return [candidates[0].svc.id];
 // If several workflows share only the parent phrase (e.g. 주차정기권 -> 신규/연장), the keyword
 // does not choose a branch. Require exact object evidence before narrowing a multi-candidate set.
 const exact=candidates.filter(x=>x.titleExact||x.fieldExact);
 if(!exact.length)return [];
 exact.sort((a,b)=>b.score-a.score||a.svc.title.length-b.svc.title.length||a.svc.id.localeCompare(b.svc.id));
 if(exact.length===1)return [exact[0].svc.id];
 // When several sub-actions all repeat the exact field, prefer a clearly shorter general workflow
 // only if it is essentially the base task itself (e.g. 졸업자격인증제 vs 내역서 출력/제출).
 const top=exact[0],second=exact[1];
 const topTitle=normalizeQuery(top.svc.title||''),secondTitle=normalizeQuery(second.svc.title||'');
 const topExtra=Math.max(0,topTitle.length-base.length),secondExtra=Math.max(0,secondTitle.length-base.length);
 if(topTitle.startsWith(base)&&topExtra<=2&&secondExtra-topExtra>=3)return [top.svc.id];
 return [];
}
function keywordRouteDisplayTitle(term,service){
 if(!term||!service||!['official_route','department_route','academic_directory'].includes(service.kind))return null;
 const base=keywordRouteBaseTerm(term),title=normalizeQuery(service.title||'');if(!base)return null;
 const rawTitle=String(service.title||'');
 const dept=normalizeQuery(service.department?.name||'');
 // Even when an umbrella title literally contains the keyword, a long list of unrelated duties can
 // look like the wrong result to a student (사회봉사 -> 통학버스·사회봉사·해외봉사..., 열람실 ->
 // 열람실·그룹스터디실·사물함...). Keep the official route/phone underneath, but focus the visible
 // label on the user's owned keyword. Preserve cohesive center titles when the department itself
 // visibly names the same object (e.g. 장애학생지원센터).
 const umbrellaParts=(rawTitle.match(/·/g)||[]).length;
 const focusContainedUmbrella=title.includes(base)&&umbrellaParts>=2&&!(dept&&dept.includes(base));
 if(title.includes(base)&&!focusContainedUmbrella)return null;
 // Preserve an already-informative umbrella title when the keyword's object is visibly represented
 // by both its leading and trailing task fragments (생활관물품 -> 생활관 ... 물품,
 // 장애학생쉼터 -> 장애학생...쉼터). This keeps useful official context instead of shortening it.
 if(!focusContainedUmbrella&&base.length>=4){
   const head=base.slice(0,Math.min(3,base.length-1)),tail=base.slice(-2);
   if(title.includes(head)&&title.includes(tail))return null;
 }
 // Common student wording where the official title uses '장애학생' rather than '장애인'.
 if(base==='장애인'&&title.includes('장애학생'))return null;
 const raw=(service.route_keywords||[]).find(v=>normalizeQuery(v)===term)||term;
 let label=String(raw).trim();
 if(service.kind==='academic_directory'){
   if(!/(?:학과|학부|전공|스쿨|대학|안내)$/u.test(label))label=`${label} 안내`;
   return label;
 }
 if(/담당$/u.test(label))label=label.replace(/담당$/u,' 담당 문의');
 else if(!/(?:문의|상담|안내|지원|신청|관리|운영|대관|채용|전형|공고)$/u.test(label))label=`${label} 문의`;
 return label;
}
function keywordResultItem(id,score,term=''){
 const service=services.find(s=>s.id===id);if(!service)return null;
 const display_title=keywordRouteDisplayTitle(term,service);
 let display_description=null;
 if(display_title&&term&&['official_route','department_route','academic_directory'].includes(service.kind)){
   const raw=(service.route_keywords||[]).find(v=>normalizeQuery(v)===normalizeQuery(term))||term;
   display_description=service.kind==='academic_directory'
     ?`${String(raw).trim()} 관련 소속 학과·전공 공식 안내로 연결합니다.`
     :`${String(raw).trim()} 관련 공식 담당부서로 연결합니다.`;
 }
 return {service,score,...(term?{source_keyword:term}:{}),...(display_title?{display_title}:{}),...(display_description?{display_description}:{})};
}
function keywordRepresentativeIds(rec){
 const n=rec.term;
 // An exact official title
 if(rec.titleOwners.size){
   const exact=[...rec.titleOwners].filter(id=>services.some(s=>s.id===id));
   if(exact.length)return exact;
 }
 const policy=KEYWORD_BROAD_PREFERRED_IDS[n]||KEYWORD_AMBIGUOUS_IDS[n];
 if(policy)return policy.filter(id=>services.some(s=>s.id===id));
 if(rec.aliasOwners.size){const alias=[...rec.aliasOwners].filter(id=>services.some(s=>s.id===id));if(alias.length===1)return alias;}
 const detailed=samePhoneSpecificWorkflowIds(rec);if(detailed.length)return detailed;
 // An exact official title is the strongest possible keyword evidence. Never let shorter route
 // aliases or generic concepts consume result slots ahead of it.
 const primary=rec.titleOwners.size?rec.titleOwners:(rec.aliasOwners.size?rec.aliasOwners:(rec.routeOwners.size?rec.routeOwners:rec.owners));
 const list=[...primary].map(id=>services.find(s=>s.id===id)).filter(Boolean);
 if(!list.length)return [];
 const byGroup=new Map();
 for(const svc of list){const group=serviceIntentGroup(svc);const prev=byGroup.get(group);if(!prev||svc.id===group)byGroup.set(group,svc);}
 return [...byGroup.values()].sort((a,b)=>{
   const pr={workflow:0,official_route:1,department_route:2,academic_directory_general:3,academic_directory:4,organization_registry:5};
   return (pr[a.kind]??2)-(pr[b.kind]??2)||a.id.localeCompare(b.id);
 }).map(s=>s.id);
}
function keywordTokenSegments(query){
 // Comma/semicolon/newline/slash and standalone conjunctions are explicit keyword separators for
 // the search-box contract. This keeps a strong keyword from being handed to the softer natural-
 // language resolver merely because the student wrote `A 그리고 B` instead of `A, B`.
 // A complete official title that itself contains '/' is protected in keywordFirstRoute before
 // this splitter runs. The current catalog has no registered title/alias/route literal containing
 // standalone 그리고/또한/및/또, so these visible conjunction boundaries are unambiguous.
 return String(query||'').split(/[,;\n]+|\s+\/\s+|\s+(?:그리고|또한|및|또)\s+/).map(x=>x.trim()).filter(Boolean);
}
function keywordParseTokenSegment(segment){
 const toks=String(segment||'').normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).map(normalizeQuery).filter(Boolean);
 if(!toks.length)return null;
 const memo=new Map();
 const solve=i=>{
   if(i===toks.length)return [];
   if(memo.has(i))return memo.get(i);
   // Longest complete token span first: an actual compound title/keyword outranks splitting it
   // into generic inner words, while matches are never allowed to begin/end inside another token.
   for(let j=toks.length;j>i;j--){
     const term=toks.slice(i,j).join('');const rec=KEYWORD_ANCHOR_MAP.get(term);if(!rec)continue;
     const tail=solve(j);if(tail){const ans=[{term,rec},...tail];memo.set(i,ans);return ans;}
   }
   memo.set(i,null);return null;
 };
 return solve(0);
}
function keywordParseCompactSegment(segment){
 const n=normalizeQuery(segment);if(!n)return null;
 // Compact input has no visible token boundaries, so segment it strictly from left to right.
 // Never allow an anchor to begin in the middle of a previously intended keyword (e.g.
 // 교환학생+생활관 must not manufacture 학생생활관 across the boundary). Try longer anchors
 // first, but backtrack when that choice cannot cover the remainder.
 const memo=new Map();
 const solve=i=>{
   if(i===n.length)return [];
   if(memo.has(i))return memo.get(i);
   // Only anchors whose first character can start at the current cursor are relevant.
   // The per-prefix arrays preserve KEYWORD_ANCHORS' longest-first ordering, so this is
   // behaviorally identical to the previous occurrence table while avoiding O(all anchors ×
   // input length) indexOf scans for every long multi-keyword query.
   for(const rec of (KEYWORD_ANCHORS_BY_FIRST.get(n[i])||[])){
     if(!n.startsWith(rec.term,i))continue;
     const tail=solve(i+rec.term.length);
     if(tail){const ans=[{term:rec.term,rec},...tail];memo.set(i,ans);return ans;}
   }
   memo.set(i,null);return null;
 };
 return solve(0);
}
function keywordFirstRoute(query){
 const raw=String(query||'').trim();if(!normalizeQuery(raw)||!KEYWORD_ANCHORS.length)return null;
 // Protect a complete official title before interpreting '/' as a multi-keyword separator.
 // This preserves titles such as 'AI부트캠프 교육과정 · 네이버/메가존클라우드'.
 const wholeRec=KEYWORD_ANCHOR_MAP.get(normalizeQuery(raw));
 if(wholeRec?.titleOwners?.size){
   const wholeIds=keywordRepresentativeIds(wholeRec);
   if(wholeIds.length){
     const items=wholeIds.slice(0,5).map((id,i)=>keywordResultItem(id,10000-i,wholeRec.term)).filter(Boolean);
     if(items.length)return {status:'answer',items,reason:items.length>1?'multi_intent':'keyword_exact',broad:items.length>1,total_intents:wholeIds.length,truncated_count:Math.max(0,wholeIds.length-5),multi_source:'keyword_exact_title'};
   }
 }
 const segments=keywordTokenSegments(raw);if(!segments.length)return null;
 const parsed=[];
 for(const seg of segments){
   const hasBoundary=/[^0-9a-z가-힣]/i.test(seg.normalize('NFKC'));
   // Prefer visible token boundaries when they produce a complete parse. If a student pastes two
   // otherwise valid multi-word keywords together without a separator, one token can contain the
   // end of keyword A and the start of keyword B; token parsing then fails even though the fully
   // normalized compact string has an exact left-to-right decomposition. In that case only, fall
   // back to the compact parser. This keeps ordinary token boundaries authoritative while making
   // '교내 시설물 고장 신고수강신청내역확인서' behave like the separated form.
   let anchors=hasBoundary?keywordParseTokenSegment(seg):keywordParseCompactSegment(seg);
   if((!anchors||!anchors.length)&&hasBoundary)anchors=keywordParseCompactSegment(seg);
   if(!anchors||!anchors.length)return null;
   parsed.push(...anchors);
 }
 const ids=[];const idTerms=new Map();const seenGroups=new Set();
 const isMultiAnchor=parsed.length>=2;
 for(const anchor of parsed){
   // In a multi-keyword query every parsed anchor owns at most one result slot. Ambiguous/broad
   // anchors may expose multiple candidates when searched alone, but must not consume another
   // explicitly typed keyword's slot in a 2~5 intent query.
   const reps=keywordRepresentativeIds(anchor.rec);
   const ownedReps=isMultiAnchor?reps.slice(0,1):reps;
   for(const id of ownedReps){const svc=services.find(s=>s.id===id);if(!svc)continue;const group=serviceIntentGroup(svc);if(seenGroups.has(group))continue;seenGroups.add(group);ids.push(id);if(!idTerms.has(id))idTerms.set(id,anchor.term);}
 }
 if(!ids.length)return null;
 const items=ids.slice(0,5).map((id,i)=>keywordResultItem(id,10000-i,idTerms.get(id)||'')).filter(Boolean);
 return {status:'answer',items,reason:items.length>1?'multi_intent':'keyword_exact',broad:items.length>1,total_intents:ids.length,truncated_count:Math.max(0,ids.length-5),multi_source:'keyword_first'};
}

// Single broad-keyword collection ------------------------------------------------
// A generic noun such as "성적", "장학", "증명서", "수강", "기숙사" is not a single
// administrative task.  The old UI said "관련된 업무를 모아봤어요" but rendered only the
// first candidate; some generic policy anchors (notably 장학/기숙사/등록금) also collapsed the
// single-word query to one preferred card before the broad ranker could run.  For a *single*
// generic keyword only, collect several strongly related catalog services and lock that collection
// as keyword-first. Multi-keyword input keeps the existing one-keyword-one-intent contract.
const BROAD_COLLECTION_GENERIC_STOP=new Set(['학교','학생','업무','관련','문의','신청','안내','지원','관리','이용','확인','조회','처리','담당']);
const BROAD_COLLECTION_EXTRA=new Set(['증명서','수강','휴학','시험','학적','학자금','보건','교통','주차','국제교류','대학원','병무']);
function broadCollectionFieldRelation(value,needle){
 const raw=String(value||'').normalize('NFKC').toLowerCase();
 const normalized=normalizeQuery(raw);if(!normalized||!needle)return 0;
 if(normalized===needle)return 4;
 const chunks=raw.split(/[^0-9a-z가-힣]+/).map(normalizeQuery).filter(Boolean);
 if(chunks.some(x=>x===needle))return 4;
 if(chunks.some(x=>x.startsWith(needle)||x.endsWith(needle)))return 3;
 if(normalized.startsWith(needle)||normalized.endsWith(needle))return 2;
 if(normalized.includes(needle))return 1;
 return 0;
}
function broadCollectionEvidenceScore(service,needle,query){
 if(!service||!needle)return 0;
 const titleRaw=String(service.title||''),aliasRaw=service.aliases||[],routeRaw=service.route_keywords||[],termRaw=service.search_terms||[],situationRaw=service.situations||[],categoryRaw=String(service.category||'');
 const titleRel=broadCollectionFieldRelation(titleRaw,needle);
 const aliasRel=Math.max(0,...aliasRaw.map(x=>broadCollectionFieldRelation(x,needle)));
 const routeRel=Math.max(0,...routeRaw.map(x=>broadCollectionFieldRelation(x,needle)));
 const termRel=Math.max(0,...termRaw.map(x=>broadCollectionFieldRelation(x,needle)));
 const situationRel=Math.max(0,...situationRaw.map(x=>broadCollectionFieldRelation(x,needle)));
 const categoryRel=Math.max(0,...categoryRaw.split('·').map(x=>broadCollectionFieldRelation(x,needle)));
 const concept=detectConcept(query);const preferredIndex=concept?(concept.preferred||[]).indexOf(service.id):-1;
 const directExact=Math.max(titleRel,aliasRel,routeRel,termRel,categoryRel)>=4;
 const directEdge=Math.max(titleRel,aliasRel,routeRel,termRel,categoryRel)>=3;
 // A broad collection must have real lexical ownership. Domain/preferred bonuses may rank an
 // already-related card, but they must never manufacture candidates that do not mention the keyword
 // (e.g. 정시 -> 편입, or 전기 -> 발전기금 because the characters happen to occur internally).
 if(!directExact&&!directEdge)return 0;
 // Edge-only compounds are useful (봉사장학, 전기공학), but when a concept has a known domain,
 // reject a different-domain edge collision unless the catalog explicitly marks the service as a
 // preferred owner. This blocks 교직 -> 교직원수련원 while preserving genuine exact metadata hits.
 if(!directExact&&directEdge&&concept&&service.domain&&service.domain!==concept.domain&&preferredIndex<0)return 0;
 let score=0;
 const titleNormalized=normalizeQuery(titleRaw);
 if(titleRel===4)score+=22000;else if(titleRel===3)score+=16000;else if(titleRel===2)score+=9000;else if(titleRel===1)score+=1800;
 // For a generic noun, services whose official title *begins* with that noun are the clearest
 // user-facing owners (성적증명서, 수강신청, 장학금 종류...). A title that merely mentions the
 // noun later (편입 ... 성적, 휴학 ... 성적인정) remains related but must not crowd those out.
 if(titleNormalized.startsWith(needle))score+=12000;
 if(aliasRel===4)score+=9500;else if(aliasRel===3)score+=6200;else if(aliasRel===2)score+=2600;
 if(routeRel===4)score+=9000;else if(routeRel===3)score+=6000;else if(routeRel===2)score+=2400;
 if(termRel===4)score+=4000;else if(termRel===3)score+=2600;else if(termRel===2)score+=1000;
 if(situationRel===4)score+=1400;else if(situationRel===3)score+=700;
 if(categoryRel===4)score+=5000;else if(categoryRel===3)score+=3200;
 if(concept){
   if(service.domain===concept.domain)score+=1100;
   if(preferredIndex>=0)score+=Math.max(15000,30000-preferredIndex*2000);
 }
 if(service.kind==='workflow')score+=500;
 else if(service.kind==='department_route'||service.kind==='official_route')score-=350;
 if(service.browse_hidden)score-=350;
 if(titleRel>=3)score+=Math.max(0,420-Math.min(normalizeQuery(titleRaw).length,42)*10);
 return score;
}
function broadSingleKeywordCollectionRoute(query){
 const raw=String(query||'').trim();const n=normalizeQuery(raw);if(!n||BROAD_COLLECTION_GENERIC_STOP.has(n))return null;
 if(!BROAD_CONCEPTS.has(n)&&!BROAD_COLLECTION_EXTRA.has(n))return null;
 // This policy is deliberately single-keyword only. Explicit separators/word sequences continue
 // through keywordFirstRoute so each of the user's 1~5 requested intents keeps its own slot.
 if(/[,;\n]+|\s+\/\s+/.test(raw))return null;
 const normalizedWords=raw.normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]+/g,' ').trim().split(/\s+/).filter(Boolean);
 // Broad collection is a search-box convenience for ONE generic keyword, never a sentence.
 // Natural wording such as "학생증 잃어버렸어" must continue to the action/object resolver.
 if(normalizedWords.length!==1)return null;
 // A complete official title is never broadened. "수강신청", "복학", "성적증명서" etc.
 // remain exact single workflows even though their words occur in many related records.
 const exactRec=KEYWORD_ANCHOR_MAP.get(n);
 if(exactRec?.titleOwners?.size)return null;
 const ranked=[];
 for(const service of services){
   const evidence=broadCollectionEvidenceScore(service,n,raw);
   if(evidence>=2200)ranked.push({service,score:evidence});
 }
 if(ranked.length<2)return null;
 ranked.sort((a,b)=>b.score-a.score||String(a.service.title||'').length-String(b.service.title||'').length||String(a.service.title||'').localeCompare(String(b.service.title||''),'ko'));
 const out=[],seenGroups=new Set();let distinctTotal=0;
 for(const item of ranked){
   const group=serviceIntentGroup(item.service);if(!group||seenGroups.has(group))continue;
   seenGroups.add(group);distinctTotal++;
   if(out.length<7)out.push(item);
 }
 if(distinctTotal<2)return null;
 return {status:'answer',items:out,reason:'broad',broad:true,total_intents:distinctTotal,truncated_count:Math.max(0,distinctTotal-5),multi_source:'keyword_broad_collection'};
}


// Explicit multi-keyword enumeration ------------------------------------------------
// When students type several independently meaningful campus keywords separated only by spaces
// or middle dots (e.g. "성적 장학 ROTC 수강 분실"), the whole-query catalog matcher can favor
// only the strongest internal anchors and silently drop broad keywords. Preserve the product's
// 1~5 keyword contract by giving each *standalone-resolvable* keyword one result slot in input order.
// Facet/meta words are intentionally excluded so "휴학 학생증 재발급 어디에 문의" continues
// through the existing facet/natural-language pipeline rather than manufacturing extra intents.
const EXPLICIT_KEYWORD_LITERAL_SET=new Set();
const EXPLICIT_KEYWORD_TOKEN_ROUTE_CACHE=new Map();
const EXPLICIT_KEYWORD_ENUM_VOCAB=new Set([
 ...BROAD_CONCEPTS,...BROAD_COLLECTION_EXTRA,
 'rotc','학군단','분실','분실물','휴학','복학','자퇴','재입학','전과','다전공','복수전공','부전공','국가장학금','수강신청','성적정정',
 '재학증명서','성적증명서','졸업증명서','학자금대출','교환학생','보건소','향림통','lms','와이파이','wifi','주차','학생증재발급'
].map(normalizeQuery));
const EXPLICIT_KEYWORD_LIST_STOP=new Set([
 ...BROAD_COLLECTION_GENERIC_STOP,
 '어디','어디로','어디에','전화','전화번호','연락처','서류','필요서류','필요한서류','준비물','절차','방법','신청방법',
 '기간','언제','언제까지','비용','온라인','온라인으로','위치','필요','필요한','관련','부서','담당부서','담당자',
 '납부','발급','재발급','정정','변경','취소','등록','예약','신고','제출','출력','선발','모집'
].map(normalizeQuery));
function explicitKeywordTokenOwned(token,route){
 const n=normalizeQuery(token);if(!n||EXPLICIT_KEYWORD_LIST_STOP.has(n)||!route||route.status!=='answer'||!(route.items||[]).length)return false;
 if(route.reason==='broad'&&route.multi_source==='keyword_broad_collection')return true;
 if(route.reason==='keyword_exact'||String(route.multi_source||'').startsWith('keyword_'))return true;
 const top=visibleRouteItems(route)?.[0]?.service||route.items?.[0]?.service;if(!top)return false;
 const vals=[top.title,...(top.aliases||[]),...(top.route_keywords||[]),...(top.search_terms||[]),...(top.situations||[]),top.category].map(normalizeQuery).filter(Boolean);
 // Standalone ownership must be lexical, not merely a fuzzy score. Edge ownership covers useful
 // generic nouns such as 분실 -> 분실물 while avoiding arbitrary sentence tokens.
 return vals.some(v=>v===n||v.startsWith(n)||v.endsWith(n));
}
function explicitEnumerationRepeatedSameIntent(raw){
 const locked=keywordFirstRoute(raw);if(!locked||locked.status!=='answer'||!(locked.items||[]).length)return false;
 const groups=[...new Set((visibleRouteItems(locked)||locked.items||[]).map(x=>serviceIntentGroup(x.service)).filter(Boolean))];
 if(groups.length!==1)return false;
 const group=groups[0], compact=normalizeQuery(raw);if(!compact)return false;
 const strong=[...new Set([...(KEYWORD_STRONG_LITERALS_BY_GROUP.get(group)||[])].map(normalizeQuery).filter(x=>x.length>=2))].sort((a,b)=>b.length-a.length);
 const titles=new Set([...(KEYWORD_TITLE_NORMS_BY_GROUP.get(group)||[])].map(normalizeQuery).filter(Boolean));
 if(!strong.length||!titles.size)return false;
 // A whitespace/middle-dot list may actually be the same canonical workflow repeated through
 // title/alias/route synonyms (e.g. "생활관 상담 생활관상담 생활관 상담"). The naive token-list
 // fallback would split the title into generic words (생활관 + 상담) and manufacture unrelated
 // intents.  Treat it as one intent only when the *entire compact query* can be segmented into
 // at least two literals owned by the already keyword-locked group and at least one segment is an
 // exact official title. A single compound title such as "창업 휴학" therefore does not trigger
 // this guard and can still be interpreted as two explicitly listed keywords.
 const memo=new Map();
 const solve=(i,titleUsed)=>{
   const key=i+'|'+(titleUsed?1:0);if(memo.has(key))return memo.get(key);
   if(i===compact.length){const r=titleUsed?0:-Infinity;memo.set(key,r);return r;}
   let best=-Infinity;
   for(const lit of strong){if(!compact.startsWith(lit,i))continue;const tail=solve(i+lit.length,titleUsed||titles.has(lit));if(Number.isFinite(tail))best=Math.max(best,1+tail);}
   memo.set(key,best);return best;
 };
 return solve(0,false)>=2;
}
function explicitKeywordEnumerationRoute(query,baseRoute=null){
 const raw=String(query||'').trim();if(!raw||!/[\s·]/.test(raw))return null;
 // SearchCore already resolves protected relationship workflows as one atomic intent. When the
 // same query is an explicit 2~5 intent list, never let this lower-level whitespace enumerator
 // split a proven atomic workflow back into a broad inner keyword (e.g. 일반휴학) plus fragments.
 // This is generic over the existing ATOMIC_MULTI_GUARD_IDS set rather than sentence-specific.
 const atomicCore=globalThis.EodigaSearchCore?.resolve?.(raw,services);
 const atomicCoreItems=(atomicCore?.items||[]).filter(x=>x?.service);
 if(atomicCore?.status==='answer'&&atomicCoreItems.length>=2&&atomicCoreItems.some(x=>ATOMIC_MULTI_GUARD_IDS.has(x.service.id))){
   const out=[],seenGroups=new Set();
   for(const item of atomicCoreItems){
     const group=serviceIntentGroup(item.service);if(!group||seenGroups.has(group))continue;
     seenGroups.add(group);out.push({service:item.service,score:10030-out.length,source_keyword:'search_core_atomic_multi'});if(out.length>=5)break;
   }
   if(out.length>=2)return {status:'answer',items:out,reason:'multi_intent',broad:true,total_intents:seenGroups.size,truncated_count:Math.max(0,atomicCoreItems.length-5),multi_source:'search_core_atomic_multi'};
 }

 // Comma/slash/plus/newline enumerations are already handled by the mature clause parser. This
 // fallback specifically closes the whitespace/middle-dot gap without changing those paths.
 if(/[,;，；/＋+&＆|\n]/.test(raw))return null;
 // Preserve a literal official title/alias/route expression exactly as registered.
 const rawKey=raw.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 if(EXPLICIT_KEYWORD_LITERAL_SET.has(rawKey))return null;
 if(explicitEnumerationRepeatedSameIntent(raw))return null;
 const parts=raw.replace(/[·]+/g,' ').split(/\s+/).map(x=>x.trim()).filter(Boolean);
 if(parts.length<2||parts.length>12)return null;
 // Protect a registered multi-token atomic relationship as one slot before token ownership.
 // Build spans from the existing atomic workflow catalog itself (title/situations/aliases/routes),
 // so generic inner words cannot manufacture extra intents and crowd the user's max-5 list.
 const atomicSpanByStart=new Map();
 for(const atomicId of ATOMIC_MULTI_GUARD_IDS){
   const svc=services.find(s=>s.id===atomicId);if(!svc)continue;
   const literals=[svc.title,...(svc.situations||[]),...(svc.aliases||[]),...(svc.route_keywords||[])].map(v=>({raw:String(v||''),n:normalizeQuery(v)})).filter(x=>x.n.length>=6).sort((a,b)=>b.n.length-a.n.length);
   for(let start=0;start<parts.length;start++){
     let acc='';
     for(let end=start;end<parts.length;end++){
       const pn=normalizeQuery(parts[end]);if(!pn)continue;acc+=pn;
       for(const lit of literals){
         if(acc!==lit.n)continue;
         if(end<=start)continue; // single-token atomic names are already safe in the normal parser
         const prev=atomicSpanByStart.get(start);
         if(!prev||lit.n.length>prev.literal_n.length)atomicSpanByStart.set(start,{end,service:svc,literal_n:lit.n});
       }
       if(!literals.some(l=>l.n.startsWith(acc)))break;
     }
   }
 }
 const baseItems=(visibleRouteItems(baseRoute)||baseRoute?.items||[]).filter(x=>x?.service);
 const rawCollapsed=raw.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
 const hasExplicitSpacedDotSeparator=/\s·\s/.test(raw);
 const literalOwnsPart=(service,token,partIndex)=>{
   const n=normalizeQuery(token);if(!n||!service)return false;
   // Only an *actual registered literal substring with the same visible spacing/punctuation* may
   // protect a token as part of one compound workflow.  This preserves "장애학생 장학" and
   // "성희롱·성폭력 상담", but deliberately does NOT merge "창업 · 휴학" into "창업휴학"
   // or swallow a standalone "장학금" merely because "국가장학금" contains those characters.
   for(const value of [service.title,...(service.aliases||[]),...(service.route_keywords||[])]){
     const lit=String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();if(!lit||!rawCollapsed.includes(lit))continue;
     const components=lit.replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).map(normalizeQuery).filter(Boolean);
     // Only a genuinely multi-part registered expression may protect this exact token occurrence.
    // Match the registered components against the surrounding input parts by position; a later
    // independently typed token must not be swallowed merely because the same word also appears
    // inside an earlier compound name (e.g. Grand-ICT연구센터 ... ICT연구센터).
    if(components.length>=2){
      for(let ci=0;ci<components.length;ci++){
        if(components[ci]!==n)continue;
        const start=partIndex-ci;if(start<0||start+components.length>parts.length)continue;
        let same=true;for(let j=0;j<components.length;j++){if(normalizeQuery(parts[start+j])!==components[j]){same=false;break;}}
        if(same)return true;
      }
    }
   }
   return false;
 };
 const ownsToken=(service,token)=>{
   const n=normalizeQuery(token);if(!n||!service)return false;
   const vals=[service.title,...(service.aliases||[]),...(service.route_keywords||[]),...(service.search_terms||[]),...(service.situations||[])].map(normalizeQuery).filter(Boolean);
   return vals.some(v=>v===n||v.startsWith(n)||v.endsWith(n));
 };
 const assigned=[];
 for(let pi=0;pi<parts.length;pi++){
   const atomicSpan=atomicSpanByStart.get(pi);
   if(atomicSpan){
     assigned.push({item:{service:atomicSpan.service,score:10025},source_keyword:parts.slice(pi,atomicSpan.end+1).join(' ')});
     pi=atomicSpan.end;continue;
   }
   const part=parts[pi],n=normalizeQuery(part);if(n.length<2||EXPLICIT_KEYWORD_LIST_STOP.has(n))continue;
   // A visibly spaced middle dot is an explicit list delimiter (A · B), not punctuation
   // inside one registered phrase (A·B). Never let a compound literal cross that boundary.
   const protectedCompound=hasExplicitSpacedDotSeparator?null:baseItems.find(item=>literalOwnsPart(item.service,part,pi));
   if(protectedCompound){assigned.push({item:protectedCompound,source_keyword:part});continue;}
   // Preserve a locally proven object+action workflow such as "학생증 재발급" or "수강 정정".
   // The action token itself is not a separate intent, but it may specialize the preceding broad noun.
   const next=parts[pi+1],nextN=normalizeQuery(next||'');
   const actionCompound=nextN&&EXPLICIT_KEYWORD_LIST_STOP.has(nextN)
     ? baseItems.find(item=>ownsToken(item.service,part)&&ownsToken(item.service,next)) : null;
   if(actionCompound){assigned.push({item:actionCompound,source_keyword:part});continue;}
   // Outside a visibly registered compound, each separately typed strong keyword owns one slot.
   // This is what keeps "성적 · 장학" and "창업 · 휴학" separate even if a compound workflow
   // such as 성적장학/창업휴학 also exists elsewhere in the catalog.
   const rec=KEYWORD_ANCHOR_MAP.get(n);
   const eligible=EXPLICIT_KEYWORD_ENUM_VOCAB.has(n)||Boolean(rec&&(rec.titleOwners?.size||rec.aliasOwners?.size||rec.routeOwners?.size||rec.policyOwners?.size));
   if(!eligible)return null;
   let route=EXPLICIT_KEYWORD_TOKEN_ROUTE_CACHE.get(n);
   if(!route){route=searchCampusServices(part,true);if(route?.status==='answer')EXPLICIT_KEYWORD_TOKEN_ROUTE_CACHE.set(n,route);}
   if(!explicitKeywordTokenOwned(part,route))return null;
   const item=visibleRouteItems(route)?.[0]||route.items?.[0];if(!item?.service)return null;
   assigned.push({item,source_keyword:part});
 }
 if(!assigned.length)return null;
 const out=[],seenGroups=new Set();
 for(const a of assigned){const group=serviceIntentGroup(a.item.service);if(!group||seenGroups.has(group))continue;seenGroups.add(group);out.push({service:a.item.service,score:10020-out.length,source_keyword:a.source_keyword,...(a.item.display_title?{display_title:a.item.display_title}:{}),...(a.item.display_description?{display_description:a.item.display_description}:{})});if(out.length>=5)break;}
 if(out.length<2)return null;
 return {status:'answer',items:out,reason:'multi_intent',broad:true,total_intents:seenGroups.size,truncated_count:Math.max(0,seenGroups.size-5),multi_source:'keyword_explicit_list'};
}

// Explicit separator clause ownership -------------------------------------------------------
// Commas/semicolons/newlines/spaced slashes and additive conjunctions are deliberate lists.
// Resolve each clause independently before whole-query natural parsing so a routing facet on
// one clause cannot erase another already-strong keyword intent. In multi input, each clause
// consumes at most one visible slot; broad/ambiguous clauses therefore cannot crowd out the rest.
function explicitSeparatedClauseKeywordRoute(query){
 const raw=String(query||'').trim();if(!raw)return null;
 if(!/[,;，；\n]+|\s+\/\s+|\s+·\s+|(?:^|\s)(?:그리고|또한|및|또)(?=\s|$)/.test(raw))return null;
 let marked=raw.replace(/[,;，；\n]+/g,'|||').replace(/\s+\/\s+/g,'|||').replace(/\s+·\s+/g,'|||').replace(/\s+(?:그리고|또한|및|또)\s+/g,'|||');
 const parts=marked.split('|||').map(x=>x.trim()).filter(x=>x.length>=2);if(parts.length<2||parts.length>12)return null;
 const out=[],seen=new Set();
 const actionReasons=new Set(['p0_resolver','local_natural','exact_situation','exact_route_alias','canonical_route_alias','specific','context_priority','context','composite_early','route_keyword']);
 for(const part of parts){
   const bases=[part,...keywordFacetBaseCandidates(part)];
   let strongBase=false;
   for(const b of bases){const kr=keywordFirstRoute(b);if(kr?.status==='answer'&&(kr.items||[]).length){strongBase=true;break;}}
   const r=searchCampusServices(part,true);if(!r||r.status!=='answer'||!(r.items||[]).length)return null;
   const visible=visibleRouteItems(r);if(!visible.length)return null;
   const actionN=normalizeQuery(part),actionSpecific=/(신청|지원|재발급|발급|정정|변경|취소|예약|등록|제출|신고)/.test(actionN)&&actionReasons.has(r.reason);
   if(!strongBase&&!actionSpecific)return null;
   const item=visible[0],group=serviceIntentGroup(item.service);if(!group)continue;
   if(seen.has(group))continue;seen.add(group);
   out.push({service:item.service,score:10040-out.length,source_keyword:part,...(item.display_title?{display_title:item.display_title}:{}),...(item.display_description?{display_description:item.display_description}:{})});
   if(out.length>=5)break;
 }
 if(out.length<2)return null;
 return {status:'answer',items:out,reason:'multi_intent',broad:true,total_intents:seen.size,truncated_count:Math.max(0,seen.size-5),multi_source:'keyword_explicit_clauses'};
}
// -------------------------------------------------------------------------------------------

function exactSituationPriorityRoute(query){
 const raw=String(query||'').trim(),n=normalizeQuery(raw);if(!n)return null;
 // Explicit separators/conjunctions are deliberate multi-keyword input. In that case the
 // keyword-first contract stays authoritative even if the full string happens to resemble
 // a curated natural-language example.
 if(/[,;\n]+|\s+\/\s+|\s+·\s+|(?:^|\s)(?:그리고|또한|및|또)(?=\s|$)/.test(raw))return null;
 // A complete registered title/alias/route/policy keyword is also keyword-first ownership.
 // Curated situations may clarify natural phrasing, but they must never replace an exact
 // keyword the product has explicitly promised to keep stable.
 if(KEYWORD_ANCHOR_MAP.has(n))return null;
 const byGroup=EXACT_SITUATION_GROUP_MAP.get(n);
 if(!byGroup||byGroup.size!==1)return null;
 // Shared situation text across different intent groups is genuinely ambiguous; do not
 // force a single natural-language owner. Let the normal deterministic layers handle it.
 const svc=[...byGroup.values()][0];
 return {status:'answer',items:[{service:svc,score:10040}],reason:'exact_situation',broad:false,total_intents:1,truncated_count:0,multi_source:'curated_exact_situation'};
}

function keywordOwnSoftTermRoute(query){
 const raw=String(query||'').trim();
 // Explicit separators mean the user deliberately enumerated tasks; never absorb the suffix.
 if(/[,;\n]+|\s+\/\s+/.test(raw))return null;
 const n=normalizeQuery(raw);if(!n)return null;
 const candidates=[];
 for(const svc of services){
   const titleNorm=normalizeQuery(svc?.title||'');
   if(!titleNorm||n.length<=titleNorm.length||!n.startsWith(titleNorm))continue;
   const remainder=n.slice(titleNorm.length);if(!remainder)continue;
   const ownTerms=(svc.search_terms||[]).map(normalizeQuery).filter(Boolean);
   if(!ownTerms.includes(remainder))continue;
   candidates.push({svc,titleNorm,remainder});
 }
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.titleNorm.length-a.titleNorm.length||a.svc.id.localeCompare(b.svc.id));
 for(const c of candidates){
   // Only a WHOLE suffix that is itself a registered strong keyword may open a second intent.
   // Do not recursively split a same-service soft term into shorter inner keywords: that used to
   // turn e.g. "교내장학금·청소년교육지원장학 청소년교육지원장학" into an extra broad
   // "장학금 종류 찾기" card merely because the suffix contains the substring "장학".
   const suffixRec=KEYWORD_ANCHOR_MAP.get(c.remainder);
   const suffixIds=suffixRec?keywordRepresentativeIds(suffixRec):[];
   const ownGroup=serviceIntentGroup(c.svc);
   const conflict=suffixIds.some(id=>{
     const svc=services.find(s=>s.id===id);return svc&&serviceIntentGroup(svc)!==ownGroup;
   });
   if(conflict)continue;
   return {status:'answer',items:[{service:c.svc,score:10050}],reason:'keyword_exact',broad:false,total_intents:1,truncated_count:0,multi_source:'keyword_same_service_soft_term'};
 }
 return null;
}

// Keyword + facet ownership guard ------------------------------------------------
// The search box is keyword-first, but students naturally append attributes such as
// "연락처", "필요한 서류", "언제까지" or "어디로 가". Those tails are not new
// administrative intents and must not let fuzzy/natural scoring replace an explicit catalog
// keyword. We only fall back to the facet-stripped keyword route when the normal resolver is
// weak or misses. If the normal resolver has exact catalog evidence for the more specific
// phrase (e.g. "기숙사 신청", "모의 토익 신청", "총학생회 문의"), that result stays.
const KEYWORD_FACET_TAIL_PATTERNS=[
 /(?:어디\s*(?:에|로)?\s*(?:문의(?:해|할|하면|해야)?|가(?:면|야|야해|야돼)?|찾아가(?:면|야)?|가야\s*해)?|어디로\s*가)\s*$/i,
 /(?:전화번호|연락처|전화|담당\s*부서|담당부서명|담당자|어느\s*부서|부서|문의(?:처|하기|해|할|하면|해야)?|필요한\s*서류|필요\s*서류|준비물|서류|절차|신청\s*방법|방법|언제까지|언제|기간|비용|수수료|온라인으로|온라인|위치|자격|조건)\s*$/i
];
function stripKeywordFacetTailOnce(query){
 let raw=String(query||'').trim().replace(/[\s,;·/]+$/g,'').trim();
 for(const re of KEYWORD_FACET_TAIL_PATTERNS){
   const next=raw.replace(re,'').replace(/[\s,;·/]+$/g,'').trim();
   if(next!==raw)return next;
 }
 return raw;
}
function keywordFacetBaseCandidates(query){
 const original=String(query||'').trim();const out=[];let cur=original;
 for(let i=0;i<3;i++){
   const next=stripKeywordFacetTailOnce(cur);if(!next||next===cur)break;
   cur=next;if(!out.includes(cur))out.push(cur);
 }
 // "신청 문의" is a common channel tail. Do not treat bare 신청 as a facet generally;
 // try this more aggressive form only after at least one true facet tail was removed.
 if(out.length){
   const actionTrim=cur.replace(/(?:\s|[,;·/])*신청\s*$/i,'').replace(/[\s,;·/]+$/g,'').trim();
   if(actionTrim&&actionTrim!==cur&&!out.includes(actionTrim))out.push(actionTrim);
 }
 return out;
}
function serviceHasExactStrongKeywordEvidence(service,query,{includeSituations=true}={}){
 const n=normalizeQuery(query);if(!service||!n)return false;
 const vals=[service.title,...(service.aliases||[]),...(service.route_keywords||[]),...(includeSituations?(service.situations||[]):[])];
 return vals.some(v=>normalizeQuery(v)===n);
}
function visibleRouteItems(route){
 if(!route||route.status!=='answer'||!Array.isArray(route.items))return [];
 return (route.reason==='multi_intent'||route.broad)?route.items.slice(0,5):route.items.slice(0,1);
}
function facetBaseDeterministicRoute(base){
 // Resolve a non-action facet's stripped base through the same deterministic layers that define
 // its standalone meaning. Action facets (방법/신청방법) deliberately keep the v7.3.30 legacy
 // keyword-only fallback so stable specific workflows are never broadened or replaced.
 const broad=broadSingleKeywordCollectionRoute(base);if(broad)return dedupeRouteIntentItems(broad);
 const exactSituation=exactSituationPriorityRoute(base);if(exactSituation)return dedupeRouteIntentItems(exactSituation);
 const explicitClauses=explicitSeparatedClauseKeywordRoute(base);if(explicitClauses)return dedupeRouteIntentItems(explicitClauses);
 const sameServiceSoft=keywordOwnSoftTermRoute(base);if(sameServiceSoft)return dedupeRouteIntentItems(sameServiceSoft);
 const keywordLocked=keywordFirstRoute(base);
 const rawParts=String(base||'').trim().replace(/[·]+/g,' ').split(/\s+/).map(x=>x.trim()).filter(Boolean);
 if(rawParts.length>=2&&rawParts.length<=12){
   const explicitKeywordList=explicitKeywordEnumerationRoute(base,keywordLocked);
   if(explicitKeywordList)return dedupeRouteIntentItems(explicitKeywordList);
 }
 if(keywordLocked)return dedupeRouteIntentItems(keywordLocked);
 // Some stable standalone bases are resolved only inside the raw deterministic layers (for
 // example 3D프린터 -> p0_resolver, 학생상담센터 -> exact_catalog_term). Keep those strong
 // routes available to facet recovery, but never promote weak direct/semantic/natural matches
 // from an ordinary sentence such as '학교에서 아픈데 어디 가'.
 const deterministic=dedupeRouteIntentItems(searchCampusServicesRaw(base,true));
 const safeRawReasons=new Set(['p0_resolver','exact_situation','exact_catalog_term','composite_early','exact_route_alias','canonical_route_alias','specific','context_priority','context','route_keyword']);
 if(deterministic?.status==='answer'&&(deterministic.items||[]).length&&safeRawReasons.has(deterministic.reason))return deterministic;
 return null;
}
function keywordFacetFallbackRoute(query,deterministic){
 const candidates=keywordFacetBaseCandidates(query);if(!candidates.length)return null;
 // Never strip a facet-looking word that is actually part of an exact official title at the
 // end of the user's input. Example: '생활관 입실 절차' is a complete title; treating '절차'
 // as a generic facet manufactures the broader 생활관 문의 card in multi-keyword searches.
 // Restrict this protection to exact titles (not broad route keywords such as '시설문의').
 const qNorm=normalizeQuery(query);
 const literalForm=v=>String(v||'').normalize('NFKC').toLowerCase().trim().replace(/\s+/g,' ');
 const qLiteral=literalForm(query);
 const deterministicGroups=new Set(visibleRouteItems(deterministic).map(item=>serviceIntentGroup(item?.service)).filter(Boolean));
 // Dedupe can leave a sibling representative visible even when the user literally ended the query
 // with another title/route keyword from the same canonical group. Protect every strong catalog
 // expression owned by the visible group, not just the representative card's own fields. The
 // precomputed group index keeps this check cheap even across large facet stress corpora.
 if([...deterministicGroups].some(group=>{
   // Exact official titles may be compacted by the user, so protect their normalized suffix too.
   // Aliases/route keywords still require literal punctuation/spacing to avoid turning
   // constructions such as '시설 · 문의' into a false exact keyword.
   const titles=KEYWORD_TITLE_NORMS_BY_GROUP.get(group);
   if(titles)for(const tn of titles)if(qNorm.endsWith(tn))return true;
   const literals=KEYWORD_STRONG_LITERALS_BY_GROUP.get(group);if(!literals)return false;
   for(const lit of literals)if(qLiteral.endsWith(lit))return true;
   return false;
 }))return null;
 let fallback=null,base='',usedActionTrim=false;
 const titleCoverage=text=>{
   const raw=String(text||'').trim(),whole=KEYWORD_ANCHOR_MAP.get(normalizeQuery(raw));
   if(whole?.titleOwners?.size)return whole.term.length;
   let sum=0;
   for(const seg of keywordTokenSegments(raw)){
     const hasBoundary=/[^0-9a-z가-힣]/i.test(seg.normalize('NFKC'));
     const parsed=hasBoundary?keywordParseTokenSegment(seg):keywordParseCompactSegment(seg);
     if(!parsed)continue;
     for(const a of parsed)if(a.rec?.titleOwners?.size)sum+=a.term.length;
   }
   return sum;
 };
 const successful=[];
 // v7.3.30 already has stable action-facet semantics (메이커스페이스 신청방법 -> 3D프린터 예약,
 // 학생군사교육단 신청방법 -> ROTC 지원·선발, etc.). Expand base resolution only when the
 // query has no 방법 token; this fixes soft/institution routing facets without touching actions.
 const expandedBaseAllowed=!/(?:신청\s*방법|신청방법|방법)/i.test(String(query||''));
 for(let i=0;i<candidates.length;i++){
   // For stacked facets, intermediate forms still contain a facet token (e.g. `LMS 담당부서`).
   // Let only the fully stripped final base use the expanded deterministic resolver; otherwise an
   // inner facet can be misread as a new workflow before the outer facet is completely removed.
   const finalBase=i===candidates.length-1;
   const r=(expandedBaseAllowed&&finalBase)?facetBaseDeterministicRoute(candidates[i]):keywordFirstRoute(candidates[i]);
   if(r?.status==='answer'&&r.items?.length){
     const rec=KEYWORD_ANCHOR_MAP.get(normalizeQuery(candidates[i]));
     successful.push({i,route:r,base:candidates[i],exactTitle:Boolean(rec?.titleOwners?.size),titleCoverage:titleCoverage(candidates[i])});
   }
 }
 if(!successful.length)return null;
 // Prefer the decomposition that preserves the greatest amount of exact official-title text.
 // On a tie, fewer intents are safer for a facet tail because facets cannot create a new task.
 const chosen=[...successful].sort((a,b)=>b.titleCoverage-a.titleCoverage||(a.route.items?.length||99)-(b.route.items?.length||99)||a.i-b.i)[0];
 fallback=chosen.route;base=chosen.base;
 usedActionTrim=chosen.i===candidates.length-1&&chosen.i>0&&/신청\s*$/i.test(candidates[chosen.i-1]||'');
 const visible=visibleRouteItems(deterministic),top=visible[0]?.service;
 // Exact catalog evidence for the original or minimally facet-stripped phrase means the
 // deterministic resolver found a genuinely more specific card; preserve it.
 const firstBase=candidates[0]||base;
 if(top&&visible.length===1&&serviceHasExactStrongKeywordEvidence(top,query,{includeSituations:false}))return null;
 // If we had to remove a trailing "신청" as well, preserve a high-confidence action-specific
 // local result (ROTC 지원·선발, 생활관 입사 신청, etc.). Weak semantic/direct results do not qualify.
 if(usedActionTrim&&top&&visible.length===1&&fallback.items.slice(0,5).length===1){
   const actionSpecificReasons=new Set(['exact_situation','p0_resolver','exact_route_alias','canonical_route_alias','specific','context_priority','context','composite_early','route_keyword','local_natural']);
   const baseN=normalizeQuery(base);
   const topOwnsBase=Boolean(baseN)&&[top.title,...(top.aliases||[]),...(top.route_keywords||[]),...(top.search_terms||[]),...(top.situations||[])].some(v=>normalizeQuery(v)===baseN);
   // Preserve an action-specific workflow only when it still explicitly owns the facet-stripped
   // base keyword. This keeps '기숙사 신청 문의' -> 입사 신청 and 'ROTC 신청 문의' -> 지원,
   // while preventing '생활관물품 신청방법' from drifting to the unrelated 생활관 입사 workflow.
   if(topOwnsBase&&actionSpecificReasons.has(deterministic?.reason))return null;
 }
 const wanted=new Set(fallback.items.slice(0,5).map(x=>serviceIntentGroup(x.service)));
 const shown=new Set(visible.map(x=>serviceIntentGroup(x.service)));
 const covered=[...wanted].every(g=>shown.has(g));
 const exactVisibleSet=covered&&[...shown].every(g=>wanted.has(g));
 // If the actually displayed answer has exactly the same intent groups, there is nothing to fix.
 // A superset is not harmless: a facet-generated false positive can consume one of the five slots.
 if(exactVisibleSet)return null;
 // When an extra trailing 신청 had to be removed, a multi-intent resolver may have found a more
 // specific action workflow for one clause (e.g. 기숙사 신청) while the fallback only knows the
 // broader object (기숙사). Preserve that result only when a visible card has exact catalog
 // evidence for one of the pre-action-trim segments and no unexplained extra card was added.
 if(usedActionTrim&&deterministic?.reason==='multi_intent'){
   const segments=keywordTokenSegments(firstBase);
   const missingWanted=[...wanted].filter(g=>!shown.has(g));
   const nonWanted=visible.filter(item=>!wanted.has(serviceIntentGroup(item.service)));
   const specificReplacements=nonWanted.length===missingWanted.length&&nonWanted.every(item=>segments.some(seg=>serviceHasExactStrongKeywordEvidence(item.service,seg)));
   if(specificReplacements&&visible.length===fallback.items.slice(0,5).length)return null;
 }
 return {...fallback,multi_source:'keyword_facet',facet_base:base};
}
// -------------------------------------------------------------------------------

function isObviousNonCampus(q){
 const n=normalizeQuery(q);
 if(n.includes('연애')&&n.includes('상담')&&!['순천대','학교','교내','학생상담','상담센터'].some(x=>n.includes(normalizeQuery(x))))return true;
 // Explicit non-campus card products are not student-ID or campus-lost-item requests unless the
 // user also gives a campus context. Bare '카드 잃어버렸어' remains a student-ID convenience alias.
 const explicitAcademicContext=['순천대','순천대학교','국립순천대학교','학교','교내','캠퍼스','대학','학업','휴학','복학','수강','학생'].some(x=>n.includes(normalizeQuery(x)));
 const explicitExternalCard=['신용카드','체크카드','은행카드','카드사','법인카드','교통카드','하이패스카드','멤버십카드','포인트카드'].some(x=>n.includes(normalizeQuery(x)));
 if(explicitExternalCard&&!explicitAcademicContext)return true;
 // Explicit employment/life context must not be reinterpreted as a university leave request merely because it contains '한 학기 쉬고 싶어'.
 const explicitWorkContext=['회사','직장','직장에서','회사에서','출근','퇴근','연차','휴가','퇴사','알바','아르바이트'].some(x=>n.includes(normalizeQuery(x)));
 if(explicitWorkContext&&!explicitAcademicContext&&(n.includes('쉬고싶')||n.includes('쉬어야')||n.includes('한학기쉬')||n.includes('잠깐쉬')))return true;
 if(n.includes('유튜브')&&['뭐봐','뭐볼까','볼만한','추천'].some(x=>n.includes(normalizeQuery(x)))&&!['순천대','학교','교내','대학','홍보'].some(x=>n.includes(normalizeQuery(x))))return true;
 const recommendationObjects=['맛집','야식','배달','음식','메뉴','선물','노래','음악','영화','드라마','웹툰','소설','유튜브','영상','여행지','여행코스','카페','게임','노트북','컴퓨터','이어폰','휴대폰','핸드폰','멀티탭','책','도서','아이디어','단톡','이름추천','방꾸미기','꾸미기','옷','의상','꽃다발','슬로건','자취방'];
 if(n.includes('추천')&&recommendationObjects.some(x=>n.includes(x)))return true;
 if((n.includes('번역')||n.includes('요약'))&&(n.includes('영어')||n.includes('일본어')||n.includes('중국어')||n.includes('논문')||n.includes('영상')||n.includes('과제')))return true;
 if((n.includes('써줘')||n.includes('작성해줘')||n.includes('작성')||n.includes('문장만들')||n.includes('메일써')||n.includes('메일작성'))&&(n.includes('메일')||n.includes('문자')||n.includes('글')||n.includes('문장')))return true;
 if((n.includes('대신써')||n.includes('작성해줘')||n.includes('써줘'))&&(n.includes('자소서')||n.includes('자기소개서')||n.includes('과제')||n.includes('논문')))return true;
 if((n.includes('자소서')||n.includes('자기소개서'))&&(n.includes('문장고쳐')||n.includes('고쳐줘')||n.includes('문장수정')||n.includes('대신써')||n.includes('작성해줘')||n.includes('써줘')))return true;
 if((n.includes('사업계획서')||n.includes('창업계획서'))&&(n.includes('대신써')||n.includes('작성해줘')||n.includes('써줘')))return true;
 if((n.includes('교양')||n.includes('과목')||n.includes('수업'))&&n.includes('추천')&&['재밌','쉬운','꿀','재미','들을만'].some(x=>n.includes(x))&&!['개설','시간표','수강신청','교육과정'].some(x=>n.includes(x)))return true;
 if(n.includes('학생회')&&n.includes('공약')&&(n.includes('아이디어')||n.includes('추천')||n.includes('만들어')))return true;
 if((n.includes('대학원')||n.includes('편입'))&&(n.includes('갈까말까')||n.includes('할까말까'))&&!['상담','입학상담','문의','지원'].some(x=>n.includes(x)))return true;

 if((n.includes('근처')&&(n.includes('카페')||n.includes('맛집')||n.includes('자취방')))||n.includes('야식추천'))return true;
 if(n.includes('이름')&&n.includes('추천'))return true;
 if(['뭐살까','뭘살까','뭐사면','무엇을살까','살만한거','뭐사지'].some(x=>n.includes(x)))return true;
 if(n.includes('공부법')||n.includes('공부하는법')||n.includes('공부팁')||n.includes('꿀팁'))return true;
 if((n.includes('학과')||n.includes('전공'))&&n.includes('추천')&&!['목록','어디','찾기','찾아','안내'].some(x=>n.includes(x)))return true;
 if((n.includes('성적')||n.includes('학점'))&&(n.includes('잘받는법')||n.includes('잘받는방법')||n.includes('망했')||n.includes('올리는법')))return true;
 if(n.includes('시험')&&(n.includes('너무어려')||n.includes('어렵다')||n.includes('어려워'))&&!['일정','결시','추가시험','응시'].some(x=>n.includes(x)))return true;
 if((n.includes('등록금')||n.includes('학비'))&&n.includes('비싸')&&!['대출','분납','장학','환불','납부'].some(x=>n.includes(x)))return true;
 if(n.includes('학생증')&&(n.includes('디자인')||n.includes('예뻐')||n.includes('예쁘'))&&!['발급','분실','재발급','훼손','신청'].some(x=>n.includes(x)))return true;
 if(n.includes('과제')&&(n.includes('해줘')||n.includes('대신해')||n.includes('풀어줘'))&&!n.includes('제출'))return true;
 if(n.includes('면접')&&(n.includes('답변')||n.includes('대답'))&&(n.includes('만들어')||n.includes('써줘')||n.includes('작성')))return true;
 if(n.includes('여행')&&(n.includes('갈까')||n.includes('많이갈')||n.includes('여행많이'))&&!['교환학생신청','해외봉사신청','국제교류문의'].some(x=>n.includes(x)))return true;
 if(n.includes('추천')&&['브랜드','케이스','침구','공유기','프린터','에어컨','티셔츠','포즈'].some(x=>n.includes(x)))return true;
 if((n.includes('방꾸미')||n.includes('방을꾸미')||n.includes('인테리어'))&&!['시설','고장','신고','문의'].some(x=>n.includes(x)))return true;
 if((n.includes('주제')||n.includes('아이디어'))&&(n.includes('추천')||n.includes('골라')||n.includes('제안')))return true;
 if(n.includes('디자인추천')||n.includes('포즈추천'))return true;
 if(['마비노기','리그오브레전드','롤','메이플','게임'].some(x=>n.includes(x))&&['직업','공략','추천','캐릭터'].some(x=>n.includes(x)))return true;
 if((n.includes('여행지')||n.includes('여행코스'))&&!['교환학생','해외봉사','국제교류','프로그램','신청','문의'].some(x=>n.includes(x)))return true;
 const serviceHints=['담당','문의','신청','지원','발급','고장','예약','상담','순천대','학교','교내','학과','대학','학생','교수','입학','학사','등록금','장학','기숙사','생활관','연구','취업','시설'];
 const hasHint=serviceHints.some(x=>n.includes(normalizeQuery(x)));
 if((n.includes('게임')&&(n.includes('추천')||n.includes('공략')||n.includes('캐릭터')))&&!hasHint)return true;
 if((n.includes('영상')&&n.includes('요약'))&&!hasHint)return true;
 if((n.includes('번역')&&(n.includes('영어')||n.includes('일본어')||n.includes('중국어')))&&!hasHint)return true;
 if((n.includes('추천')&&(n.includes('노트북')||n.includes('이어폰')||n.includes('영화')||n.includes('노래')||n.includes('웹툰')||n.includes('여행')||n.includes('맛집')||n.includes('치킨')))&&!hasHint)return true;
 if((n.includes('주가')||n.includes('환율')||n.includes('비트코인')||n.includes('로또'))&&!hasHint)return true;
 if((n.includes('날씨')||n.includes('뉴스'))&&!hasHint)return true;
 if(n.includes('다이어트')&&n.includes('식단')&&!hasHint)return true;
 if(n.includes('생일')&&n.includes('선물')&&!hasHint)return true;
 if((n.includes('축구')||n.includes('야구'))&&n.includes('경기')&&n.includes('결과')&&!hasHint)return true;
 if(n.includes('컴퓨터')&&n.includes('견적')&&!hasHint)return true;
 if((n.includes('휴대폰')||n.includes('핸드폰'))&&(n.includes('바꾸')||n.includes('추천'))&&!hasHint)return true;
 return false;
}

const CAMPUS_SIGNAL_TERMS=[
 '휴학','복학','자퇴','재입학','전과','전공','다전공','복수전공','부전공','수강','수강신청','성적','시험','학점','졸업',
 '학생증','장학','장학금','등록금','학자금','증명서','기숙사','생활관','도서관','통학버스','버스','주차',
 '입학','수시','정시','편입','교환학생','유학생','국제처','취업','진로','상담','인권','보건','보험',
 '시설','고장','누수','물샘','에어컨','수도','배관','전기','조명','강의실','실습실','연구실',
 '와이파이','wifi','향림통','웹메일','lms','e캠퍼스','연구','irb','창업','교직','교원자격','대학원',
 '학과','수업','과목','학비','고지서','감기약','상비약','냉장고','자료공개','정보공개','사업단','교육원','센터','교무학사과','학생지원과','시설과','정보전산원','국립순천대학교','순천대'
];
function hasCampusIntentSignal(q){
 const n=normalizeQuery(q); if(!n)return false;
 return CAMPUS_SIGNAL_TERMS.some(x=>n.includes(normalizeQuery(x)));
}

const STANDALONE_CAMPUS_TERMS=new Set([
 'topik','모의토익','토익사관학교','기술이전','학군단','eduroam','cqi','bbcc','vdi','sso','rcms','gtep','rise','aura','axopenlab','nova','비교과','메이커스페이스','3d프린터','uv프린터','열프레스','rotc'
].map(normalizeQuery));
function isSafeStandaloneQuery(q){
 const n=normalizeQuery(q);if(!n)return false;
 if(hasCampusIntentSignal(q)||BROAD_CONCEPTS.has(n)||STANDALONE_CAMPUS_TERMS.has(n)||hasExactCatalogTermEvidence(q))return true;
 if(SEARCH_CONCEPTS.some(c=>(c.aliases||[]).some(a=>normalizeQuery(a)===n)))return true;
 const routeOwners=SEARCH_INDEX.filter(e=>(e.service.route_keywords||[]).some(k=>normalizeQuery(k)===n));if(n.length>=3&&routeOwners.length===1&&!['대출','반납','입실','퇴실','세입','인건비','원천세','특허','기부','기탁','사물함','수서'].includes(n))return true;
 return SEARCH_INDEX.some(e=>['academic_directory','academic_directory_general','organization_registry'].includes(e.service.kind)&&(e.service.route_keywords||[]).some(k=>normalizeQuery(k)===n));
}

function hasExactCatalogTermEvidence(query){
 const raw=String(query||'').trim(),n=normalizeQuery(raw);if(!n)return false;
 for(const e of SEARCH_INDEX){
   const svc=e.service;
   if([svc.title,...(svc.aliases||[]),...(svc.route_keywords||[]),...(svc.search_terms||[])].some(v=>normalizeQuery(v)===n))return true;
 }
 return false;
}

function sharedExactCatalogTermRoute(query){
 const raw=String(query||'').trim(),n=normalizeQuery(raw);if(!n||n.length<3||splitQuery(raw).length!==1)return null;
 // Before typo correction, protect an exact catalog term that is shared by several real intents.
 // A one-edit alternative must never hijack an exact campus concept (교육과정 -> 교직과정,
 // 대학회계 -> 대학원회계). Strong title/alias/route keywords have already been handled by
 // keyword-first; this guard is for exact search-term/category vocabulary that genuinely spans
 // multiple services.
 const matches=[];
 for(const e of SEARCH_INDEX){
   const exactHigh=e.high.some(x=>x===n),exactMid=e.mid.some(x=>x===n);
   if(!exactHigh&&!exactMid)continue;
   // Department/category labels alone are too broad to manufacture a search result. Require an
   // explicit title/alias/route/search-term/situation ownership in the underlying record.
   const svc=e.service;
   const explicit=[svc.title,...(svc.aliases||[]),...(svc.route_keywords||[]),...(svc.search_terms||[]),...(svc.situations||[])].some(v=>normalizeQuery(v)===n);
   if(!explicit)continue;
   matches.push({service:svc,score:scoreSearchEntry(e,raw,detectConcept(raw))+(exactHigh?240:0)});
 }
 const byGroup=new Map();
 for(const item of matches){
   const group=serviceIntentGroup(item.service);if(!group)continue;
   const prev=byGroup.get(group);
   const pr={workflow:0,academic_directory_general:1,academic_directory:2,official_route:3,department_route:4,organization_registry:5};
   if(!prev||item.score>prev.score||(item.score===prev.score&&((pr[item.service.kind]??9)<(pr[prev.service.kind]??9))))byGroup.set(group,item);
 }
 if(!byGroup.size)return null;
 const items=[...byGroup.values()].sort((a,b)=>b.score-a.score||String(a.service.title||'').length-String(b.service.title||'').length||a.service.id.localeCompare(b.service.id)).slice(0,5);
 return {status:'answer',items,reason:'exact_catalog_term',broad:byGroup.size>1,total_intents:byGroup.size,truncated_count:Math.max(0,byGroup.size-5),multi_source:'exact_catalog_term'};
}

function exactSituationMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 const hasDirIntent=['어디','위치','찾','목록','학과찾','전공찾'].some(x=>n.includes(normalizeQuery(x)));
 const out=[];
 for(const e of SEARCH_INDEX){
   for(const raw of (e.service.situations||[])){
     if(normalizeQuery(raw)!==n)continue;
     let score=6080;
     if((e.service.kind==='academic_directory'||e.service.kind==='academic_directory_general')&&!hasDirIntent)score-=220;
     if(e.service.kind==='workflow')score+=80;
     out.push({service:e.service,score});break;
   }
 }
 return out.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}

function academicDirectoryIntentMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 if((n.startsWith('융합전공')||n.startsWith('연계전공'))&&!['어디','위치','찾','학과','알려','안내','목록'].some(x=>n.includes(normalizeQuery(x))))return [];
 const intents=['학과','전공','소속','스쿨','어디','위치','찾','목록','안내','알려'];
 if(!intents.some(x=>n.includes(normalizeQuery(x))))return [];
 const blockers=['복수전공','부전공','다전공','교원자격','수강','재수강','휴학','복학','자퇴','재입학','장학','취업','입학','편입','증명','시험','성적','학점인정','연구비','신청'];
 if(blockers.some(x=>n.includes(normalizeQuery(x))))return [];
 const out=[];
 for(const e of SEARCH_INDEX){
   if(e.service.kind!=='academic_directory')continue;
   let best=0;
   for(const x of [...e.high,...e.mid]){if(!x||x.length<3)continue;if(n.includes(x))best=Math.max(best,5600+x.length);}
   if(best)out.push({service:e.service,score:best});
 }
 return out.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}

function exactAcademicDirectoryMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 const out=[];
 for(const e of SEARCH_INDEX){if(e.service.kind!=='academic_directory'||e.service.id==='directory_convergence_major')continue;for(const x of [...e.high,...e.mid]){if(x&&n===x){out.push({service:e.service,score:6050});break;}}}
 return out;
}

function academicDirectoryMatches(q){
 const n=normalizeQuery(q); if(!n)return [];
 const out=[];
 const dirIntent=['어디','찾','학과','전공','소속','스쿨','학부','목록','안내'].some(x=>n.includes(normalizeQuery(x)));
 const actionBlock=['편입','멘토','상담','장학','강좌','수강','수업','취업','견적','번역','예약','고장','신청','증명','시험','출석','연구단','사업단','교육원'].some(x=>n.includes(normalizeQuery(x)));
 for(const e of SEARCH_INDEX){
   if(e.service.kind!=='academic_directory')continue;
   let best=0;
   for(const x of [...e.high,...e.mid]){
     if(!x||x.length<2)continue;
     if(n===x)best=Math.max(best,5900);
     else if(n.includes(x)){
       if(!actionBlock&&(dirIntent||x.length>=6))best=Math.max(best,5400+x.length);
     }
     else if(x.includes(n)&&n.length>=4&&dirIntent&&!actionBlock)best=Math.max(best,4300+n.length);
   }
   if(best)out.push({service:e.service,score:best});
 }
 return out.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}

function contrastTail(q){
 const raw=String(q||'').trim();
 // Do not mistake the additive connector “뿐만 아니라” for the contrast marker “아니라”.
 // Scan markers one by one so a real contrast later in the sentence can still be honored.
 const re=/(말고요|말고|아니고|아니라|보다는|대신)\s*/g; let m;
 while((m=re.exec(raw))){
   const marker=m[1]; const prefix=raw.slice(0,m.index);
   if((marker==='말고'||marker==='말고요')&&prefix.endsWith('기'))continue;
   if(marker==='아니라'&&/뿐만\s*$/.test(prefix))continue;
   // “대신” can mean representation/on-behalf-of, not contrast: “부모님이 대신 휴학 신청”.
   if(marker==='대신'&&/(?:부모님|보호자|가족|대리인|친구)(?:이|가|은|는)?\s*$/.test(prefix))continue;
   const tail=raw.slice(re.lastIndex).trim();
   if(normalizeQuery(tail).length>=2)return tail;
 }
 return null;
}
const DOMAIN_ANCHOR={
 dorm:'기숙사',student:'학생',academic:'학사',finance:'등록금',admission:'입학',facilities:'시설',it:'학교 전산',international:'국제',career:'취업',research:'연구',research_ethics:'연구윤리',counseling:'상담',startup:'창업',development:'발전기금',library:'도서관',admin:'학교 행정',graduate_school:'대학원',education_innovation:'교육혁신'
};
const EXPLICIT_CAMPUS_CONCEPT_WORDS=['기숙사','생활관','학생증','신분증','장학','등록금','학비','휴학','복학','자퇴','재입학','전과','수강','성적','학점','졸업','입학','수시','정시','편입','시설','강의실','연구실','와이파이','향림통','lms','교환학생','유학생','취업','진로','연구','irb','창업','발전기금','도서관','대학원','rotc','학군단','학생군사교육단','증명서','재학증명','성적증명','졸업증명','인권','성희롱','성폭력','상담센터','보건진료실','메이커스페이스'];
function hasExplicitCampusConceptWord(part){
 const n=normalizeQuery(part);if(!n)return false;
 return EXPLICIT_CAMPUS_CONCEPT_WORDS.some(x=>n.includes(normalizeQuery(x)));
}
function partHasExplicitConcept(part){
 if(detectConcept(part))return true;
 return hasExplicitCampusConceptWord(part);
}

function splitMultiIntent(q){
 const raw=String(q||'').trim();if(!raw)return [];
 let marked=raw;

 // Preserve dotted abbreviations / numbered official names such as A.U.R.A and 10.19연구소.
 const DOT_HOLD='__EODIGA_DOT__';
 marked=marked.replace(/([A-Za-z0-9])\.(?=[A-Za-z0-9])/g,'$1'+DOT_HOLD);
 marked=marked.replace(/[.!?。！？]+/g,'|||').replaceAll(DOT_HOLD,'.');
 // Preserve ampersands that are part of an alphanumeric keyword/abbreviation (e.g. R&D공고).
 // Korean enumerations such as 휴학&복학 still split normally because the ampersand is not
 // surrounded by Latin letters/digits on both sides.
 const AMP_HOLD='__EODIGA_AMP__';
 marked=marked.replace(/([A-Za-z0-9])[&＆](?=[A-Za-z0-9])/g,'$1'+AMP_HOLD);
 marked=marked.replace(/[;,，；/＋+&＆|\n]+/g,'|||').replace(/\s+·\s+/g,'|||').replaceAll(AMP_HOLD,'&');
 const nextConcept='(?:휴학|복학|자퇴|재입학|전과|학과|다전공|복수전공|부전공|학생증|신분증|국가장학금|장학금|등록금|학비|수강|성적|학점|졸업|기숙사|생활관|도서관|통학버스|주차|ROTC|rotc|학군단|교환학생|취업|진로|상담|인권|보건|시설|누수|에어컨|와이파이|향림통|LMS|lms|증명서|재학증명서|대학원|창업|연구|IRB|irb|사업단|우산|노트북)';
 // Split clear additive connectors, but never inside real words such as “또래상담”.
 marked=marked.replace(/(?:^|\s+)(?:뿐만\s+아니라|그리고|또한|동시에|게다가|및)(?=\s+|$)/g,'|||');
 // “또” is ambiguous: it can mean a new request (A, and also B) or “again” inside one
 // atomic request (“인정받은 과목 또 들어도 돼”). Split it only after a complete
 // request ending or when the following span clearly starts another campus concept.
 marked=marked.replace(/(?:^|\s+)또(?=\s+|$)/g,(m,offset,whole)=>{
   const before=whole.slice(0,offset).split('|||').pop().trim();
   const after=whole.slice(offset+m.length).trimStart();
   const leftComplete=/(?:요|니다|습니다|싶어|궁금해|필요해|알고싶어|알고 싶어|했어|됐어|났어|렸어)$/.test(before);
   const rightConcept=new RegExp('^'+nextConcept,'i').test(after);
   const afterN=normalizeQuery(after);
   const rightCatalog=SEARCH_INDEX.some(e=>[e.title,...e.high,...e.mid].some(t=>t&&t.length>=3&&afterN.startsWith(t)));
   // If “또” is followed only by a continuation verb, keep it inside the same atomic request:
   // “편입 때 인정받은 과목 또 들어도 돼”.
   const rightContinuation=/^(?:다시|들어|듣|받아|받|해도|하면|해서|해|되어|돼|되나|가능|싶어|궁금|필요)/.test(afterN);
   return (leftComplete||rightConcept||(!rightContinuation&&rightCatalog))?'|||':m;
 });
 marked=marked.replace(new RegExp('([가-힣A-Za-z0-9]{2,}?)(이랑|랑|과|와)\\s+(?='+nextConcept+')','gi'),(m,left,conj)=>{
   // A trailing '과' is often part of a real department/major name (e.g. 화학교육과),
   // not the Korean conjunction 'and'. Protect catalog-backed entity spans before splitting (S10).
   if(conj==='과'){const candidate=normalizeQuery(left+conj);const protectedName=SEARCH_INDEX.some(e=>e.title===candidate||e.high.includes(candidate)||e.mid.includes(candidate));if(protectedName)return m;}
   return left+'|||';
 });

 const sentenceEnd=new RegExp('(싶어요|싶습니다|싶어|궁금해요|궁금합니다|궁금해|필요해요|필요합니다|필요해|알고 싶어요|알고싶어요|알고 싶어|알고싶어|해야해요|해야해|해야돼요|해야돼|해야합니다|해야 합니다|가야해요|가야해|들려야해요|들려야해|문의해야해요|문의해야해)\\s+(?='+nextConcept+')','g');
 marked=marked.replace(sentenceEnd,'$1|||');

 marked=marked.replace(/\s*첨삭하고\s+/g,' 첨삭|||');
 marked=marked.replace(/(발전기금|발전지원금)\s*내고\s+/g,'$1 내고|||');
 marked=marked.replace(/\s*(확인|변경|재발급|발급|신청|예약|납부|결제|취소|조회|정정|등록|제출|신고|문의)(?:\s*도)?\s*하고(?!\s*싶(?:어|어요|다|습니다|고))\s+/g,' $1|||');
 marked=marked.replace(new RegExp('('+nextConcept+')(?:도)?하고\\s+(?='+nextConcept+')','gi'),'$1|||');
 marked=marked.replace(/([가-힣A-Za-z0-9]+(?:했(?:었)?고|했고|됐고|있고|없고|렸고|냈고|났고|안되고|되고|싶고|궁금하고|필요하고))\s+/g,'$1|||');
 marked=marked.replace(/\s+(?:받고|받았고)(?!\s*싶(?:어|어요|다|습니다|고))\s+/g,'|||');
 marked=marked.replace(/\s+(?:싶고|궁금하고|필요하고|알고싶고)\s+/g,'|||');

 const longEntities=['AI인재양성부트캠프사업단','SW중심대학사업단','RISE사업단','라이즈사업단','GTEP사업단'];
 const splitSignals=['다전공','복수전공','부전공','학생증','신분증','국가장학금','장학금','수강신청','휴학','복학','도서관','기숙사','ROTC','rotc','학군단'];
 for(const entity of longEntities){
   let pos=marked.indexOf(entity);
   while(pos>0){
     const last=marked.lastIndexOf('|||',pos);
     const prefix=marked.slice(last>=0?last+3:0,pos).trim();
     const pn=normalizeQuery(prefix);
     if(splitSignals.some(x=>pn.includes(normalizeQuery(x)))){
       marked=marked.slice(0,pos)+'|||'+marked.slice(pos);
       pos=marked.indexOf(entity,pos+3+entity.length);
     }else break;
   }
 }

 const parts=marked.split('|||').map(x=>x.trim()).filter(x=>normalizeQuery(x).length>=2);
 const uniq=[];const seen=new Set();
 for(const p of parts){const n=normalizeQuery(p);if(!seen.has(n)){seen.add(n);uniq.push(p);}}
 return uniq;
}

function isGenericMultiFiller(part){
 const n=normalizeQuery(part); if(!n)return true;
 if(new Set(['순천대학교업무질문인데','순천대업무질문인데','학교업무질문인데','순천대학교업무질문','순천대업무질문','학교업무질문','학교에서좀알아보려고요','학교에서알아보려고요','순천대학교에서여러가지가궁금해요','순천대에서여러가지가궁금해요','이것저것확인하고싶어요','좀알려주세요','어디로가면되는지알려주세요','관련부서가궁금해요','확인부탁해요']).has(n))return true;
 // Keep this deliberately narrow: only discourse wrappers with no concrete campus concept.
 if(partHasExplicitConcept(part))return false;
 return /^(?:순천대학교|순천대|학교)?(?:에서)?(?:여러가지|이것저것)?(?:학교)?업무?(?:질문|문의)?(?:인데|이에요|예요|입니다|드려요|드립니다)?$/.test(n);
}
function trimMultiClauseWrapper(part){
 let x=String(part||'').trim();
 // Remove only generic discourse wrappers; preserve any concrete campus concept.
 const heads=[/^(?:순천대학교|순천대)\s*(?:학교\s*)?업무\s*(?:질문|문의)?(?:인데|이에요|예요|입니다)?\s*/,/^학교\s*업무\s*(?:질문|문의)?(?:인데|이에요|예요|입니다)?\s*/];
 for(const re of heads)x=x.replace(re,'').trim();
 const tails=[/\s*좀\s*알려주세요\s*$/,/\s*어디로\s*가면\s*되는지\s*알려주세요\s*$/,/\s*관련\s*부서가\s*궁금해요\s*$/,/\s*확인\s*부탁해요\s*$/];
 for(const re of tails)x=x.replace(re,'').trim();
 return x||String(part||'').trim();
}

function organizationNameTypoMatches(q){
 const n=normalizeQuery(loosenQuery(q)||q);if(!n)return [];
 const intent=['문의','어디','연락처','전화','위치'].some(x=>normalizeQuery(q).includes(normalizeQuery(x)));
 if(!intent)return [];
 const qbase=n.replace(/문의|어디|연락처|전화|위치/g,'');if(qbase.length<4)return [];
 const hits=[];
 for(const e of SEARCH_INDEX){
   if(e.service.kind!=='organization_registry')continue;
   const candidates=[e.title,e.dept,...e.high].filter(Boolean).map(x=>x.replace(/문의|안내|일반/g,''));
   if(candidates.some(x=>x&&Math.abs(x.length-qbase.length)<=1&&editDistanceOne(qbase,x)))hits.push({service:e.service,score:6020});
 }
 const uniq=[];const seen=new Set();for(const h of hits){if(!seen.has(h.service.id)){seen.add(h.service.id);uniq.push(h);}}
 return uniq.length===1?uniq:[];
}

function officialEntityMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 const out=[];
 for(const e of SEARCH_INDEX){
   if(!['organization_registry','official_route','department_route'].includes(e.service.kind))continue;
   let best=0;
   for(const raw of (e.service.route_keywords||[])){
     const x=normalizeQuery(raw);if(x.length<7)continue;
     if(n.includes(x))best=Math.max(best,6030+x.length);
   }
   if(best)out.push({service:e.service,score:best});
 }
 return out.sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
}

function explicitAcademicDirectoryMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 const explicit=['어디','위치','소속','학과찾','전공찾','학과어디','전공어디','알려','안내','목록'].some(x=>n.includes(normalizeQuery(x)));
 if(!explicit)return [];
 return academicDirectoryIntentMatches(q);
}

const ATOMIC_MULTI_GUARD_IDS=new Set([
 'return_course_before_status','leave_course_registration_effect','military_return','military_leave_grade_recognition',
 'leave_convert_to_military','return_before_discharge','graduation_while_on_leave','major_transfer_credit_requirement',
 'transfer_duplicate_course'
]);
const ATOMIC_MULTI_GUARD_REASONS=new Set([
 'unresolved_relation','out_of_scope_other_university','role_mismatch','ambiguous_location','ambiguous_term',
 'unsupported_item','out_of_scope_general_advice','generation_not_routing','no_action','out_of_scope'
]);
function shouldKeepAtomicCoreResult(route){
 if(!route)return false;
 if(ATOMIC_MULTI_GUARD_REASONS.has(route.reason))return true;
 return (route.items||[]).some(x=>ATOMIC_MULTI_GUARD_IDS.has(x?.service?.id));
}
function shouldAlwaysKeepCoreSafety(route){return !!route&&ATOMIC_MULTI_GUARD_REASONS.has(route.reason);}
function hasExplicitEnumerationSyntax(q){
 const raw=String(q||'').normalize('NFKC').toLowerCase();
 if(/[,;]|(?:^|[.!?]\s*)[^.!?]+[.!?]\s*[^.!?]+/.test(raw))return true;
 if(/(?:그리고|또한|게다가|둘\s*다|이랑|랑\s+.*(?:둘\s*다|도\s))/.test(raw))return true;
 if(/먼저.+(?:하고\s*나서|처리하고\s*나서|처리하고나서).+(?:도|또)/.test(raw))return true;
 const doCount=(raw.match(/도\s*(?:해야|하고|궁금|필요|문의|확인|알아|처리|신청|받|가|들르|들려)/g)||[]).length;
 if(doCount>=2)return true;
 return false;
}
function hasStrongAtomicRelationshipSyntax(q){
 const raw=String(q||'').normalize('NFKC').toLowerCase(),n=normalizeQuery(q);
 if(/(차이|비교|영향|조건|요건|가능\s*여부)/.test(raw))return true;
 if(/(?:하면|할\s*때|중인데|중에|상태(?:에서)?|신청\s*전(?:에)?|하기\s*전(?:에)?).*(?:어떻게|가능|할\s*수|받을\s*수|돼|되나|되나요|처리|취소|소멸)/.test(raw))return true;
 if(/(?:전과|복학|휴학).*(?:전(?:에)?|중(?:에)?|상태).*(?:학점|수강신청|졸업).*(?:확인|가능|조건|요건|어떻게|돼|되나)/.test(raw))return true;
 if(/(?:전과|복학|휴학)\s*하고\s*(?:수강신청|졸업|학점|등록금).*(?:어떻게|가능|할\s*수|돼|되나|되나요|영향)/.test(raw))return true;
 if(/(?:군휴학|병역휴학).*(?:후|끝나|전역).*(?:복학)/.test(raw))return true;
 if(/(?:전과|복학|휴학).*(?:하려면|신청하려면|하려고).*(?:몇\s*학점|학점.*(?:필요|이수|충족))/.test(raw))return true;
 if(n.includes('휴학하면국가장학금')&&(n.includes('받을수')||n.includes('가능')))return true;
 return false;
}
function canonicalizeMultiClauseEnding(part){
 let x=String(part||'').trim();
 const rules=[
   [/하고\s*싶고$/,'하고 싶어'],[/가고\s*싶고$/,'가고 싶어'],[/받고\s*싶고$/,'받고 싶어'],[/알고\s*싶고$/,'알고 싶어'],
   [/궁금하고$/,'궁금해'],[/필요하고$/,'필요해'],[/잃어버렸고$/,'잃어버렸어'],[/고장났고$/,'고장났어'],
   [/났고$/,'났어'],[/됐고$/,'됐어'],[/있고$/,'있어'],[/없고$/,'없어'],[/했고$/,'했어']
 ];
 for(const [re,to] of rules){if(re.test(x)){x=x.replace(re,to);break;}}
 return x;
}
function clauseNegatesService(part,service){
 const n=normalizeQuery(part),id=service?.id||'';
 if(!n||!id)return false;
 if(id==='student_id_reissue'&&(n.includes('안잃어버')||n.includes('분실아니')||n.includes('잃어버린건아니')))return true;
 if(id==='leave_general'&&(n.includes('휴학은아니')||n.includes('휴학아니')||n.includes('휴학말고')))return true;
 if(id==='sch_national'&&(n.includes('국가장학금말고')||n.includes('국가장학금은이미')||n.includes('국가장학금이미')))return true;
 if(id==='dorm_internet'&&(n.includes('기숙사인터넷은괜찮')||n.includes('생활관인터넷은괜찮')))return true;
 return false;
}
function resolveMultiClause(part){
 // Inside a validated multi-intent candidate, a clear local object+action pair should beat
 // broad fuzzy ranking (e.g. '수업 신청' -> 수강신청, '기숙사 방 빼기' -> 생활관 퇴사).
 // Preserve exact/relationship core workflows so the resolver cannot flatten canonical or atomic queries.
 const core=globalThis.EodigaSearchCore?.resolve?.(part,services);
 const protectedReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','natural_title_question','natural_title_inquiry','exact_situation','exact_route_alias','p0_resolver']);
 if(core&&(protectedReasons.has(core.reason)||shouldAlwaysKeepCoreSafety(core)||hasStrongAtomicRelationshipSyntax(part)))return searchCampusServices(part,true);
 const natural=localNaturalRoute(part);if(natural)return natural;
 return searchCampusServices(part,true);
}
function collectResolvedMultiParts(parts){
 const collected=[];const seen=new Set();let sharedDomain=null;let resolvedPartCount=0,localSemanticParts=0;
 for(const rawPart of parts){
   if(isGenericMultiFiller(rawPart))continue;
   const part=canonicalizeMultiClauseEnding(trimMultiClauseWrapper(rawPart));if(!part||normalizeQuery(part).length<2)continue;
   let pr=(parts.length>=2?resolveImplicitMultiChain(part,1):null)||resolveMultiClause(part);
   if(sharedDomain&&(!partHasExplicitConcept(part))){
     const topDomain=pr?.items?.[0]?.service?.domain;
     const topScore=pr?.items?.[0]?.score||0;
     const strongReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','natural_title_inquiry','protected_alias','department_general','exact_situation','p0_resolver','exact_route_alias','canonical_route_alias','exact','composite_early','context_priority','directory_context','organization_typo','typo_strong','typo_phrase','credit_broad']);
     const independentlyStrong=pr?.status==='answer'&&(pr.items||[]).length&&(strongReasons.has(pr.reason)||topScore>=1200);
     if(!independentlyStrong&&(pr?.status!=='answer'||!(pr.items||[]).length||topDomain!==sharedDomain)){
       const anchor=DOMAIN_ANCHOR[sharedDomain];
       if(anchor){const contextual=searchCampusServices(anchor+' '+part,true);if(contextual.status==='answer'&&(contextual.items||[]).length&&contextual.items[0].service.domain===sharedDomain)pr=contextual;}
     }
   }
   if(pr?.status!=='answer'||!(pr.items||[]).length)continue;
   if(pr.reason==='local_natural')localSemanticParts++;
   const partItems=(pr.reason==='multi_intent'?(pr.items||[]).slice(0,5):[pr.items[0]]).filter(it=>it?.service&&!clauseNegatesService(part,it.service));
   if(!partItems.length)continue;resolvedPartCount++;
   if(!sharedDomain&&partItems[0]?.service)sharedDomain=partItems[0].service.domain;
   for(const it of partItems){if(it?.service&&!seen.has(it.service.id)){seen.add(it.service.id);collected.push(it);}}
 }
 if(resolvedPartCount>=2&&collected.length>=2){const total=collected.length;return {status:'answer',items:collected.slice(0,5),reason:'multi_intent',broad:true,total_intents:total,truncated_count:Math.max(0,total-5),multi_source:'app_clause_first',local_semantic_parts:localSemanticParts};}
 return null;
}
function implicitConnectorCandidates(raw){
 const text=String(raw||'');const out=[];const seen=new Set();
 // Candidate Korean connective endings. They are *not* trusted by themselves: every split
 // must independently resolve to distinct campus services before it is accepted.
 const re=/(했었고|했고|했는데|됐고|됐는데|있고|있는데|없고|없는데|렸고|렸는데|냈고|났고|났는데|되고|되었고|싶고|궁금하고|필요하고|알고싶고|알고\s*싶고|하고|지만|면서|며)(?=\s*[^\s,.!?;])/g;
 let m;while((m=re.exec(text))){
   const cut=m.index+m[0].length;
   if(cut<2||cut>=text.length-1||seen.has(cut))continue;
   seen.add(cut);out.push(cut);
 }
 return out;
}
function hasStrongImplicitMultiCandidate(raw){
 const text=String(raw||'').trim();if(!text)return false;
 for(const cut of implicitConnectorCandidates(text)){
   const left=canonicalizeMultiClauseEnding(text.slice(0,cut).trim()),right=text.slice(cut).trim();
   if(!left||!right)continue;
   const leftStrong=Boolean(localNaturalRouteId(left)||hasExplicitCampusConceptWord(left));
   const rightStrong=Boolean(localNaturalRouteId(right)||hasExplicitCampusConceptWord(right));
   if(leftStrong&&rightStrong)return true;
 }
 return false;
}
function resolveImplicitMultiChain(raw,depth=0){
 if(depth>=4)return null;
 const text=String(raw||'').trim();if(normalizeQuery(text).length<4)return null;
 const explicit=splitMultiIntent(text);
 if(explicit.length>=2){const ready=collectResolvedMultiParts(explicit);if(ready)return ready;}
 for(const cut of implicitConnectorCandidates(text)){
   const left=canonicalizeMultiClauseEnding(text.slice(0,cut).trim()),right=text.slice(cut).trim();
   if(!left||!right)continue;
   const lr=resolveMultiClause(left);
   if(lr?.status!=='answer'||!(lr.items||[]).length)continue;
   const leftItems=lr.reason==='multi_intent'?(lr.items||[]).slice(0,5):[lr.items[0]];
   const rrMulti=resolveImplicitMultiChain(right,depth+1);
   let rightItems=[];
   if(rrMulti?.status==='answer'&&(rrMulti.items||[]).length)rightItems=rrMulti.items;
   else{
     const rr=resolveMultiClause(right);
     if(rr?.status==='answer'&&(rr.items||[]).length)rightItems=rr.reason==='multi_intent'?(rr.items||[]).slice(0,5):[rr.items[0]];
   }
   if(!rightItems.length)continue;
   const merged=[],ids=new Set();
   for(const it of [...leftItems,...rightItems]){if(it?.service&&!ids.has(it.service.id)){ids.add(it.service.id);merged.push(it);}}
   if(merged.length>=2){const total=merged.length;return {status:'answer',items:merged.slice(0,5),reason:'multi_intent',broad:true,total_intents:total,truncated_count:Math.max(0,total-5),multi_source:'validated_implicit_connector'};}
 }
 return null;
}

// v6.8 root multi-intent resolver -------------------------------------------------
// Do not depend on a finite list of Korean conjunctions. Build a compact lexical
// anchor index from the 411-service catalog, find independent service concepts in
// the whole query, then resolve each concept in its local context. Existing clause
// splitting and implicit-connective logic remain as independent detectors; the
// caller chooses the detector with the broadest *validated* intent coverage.
const CATALOG_MULTI_STOP=new Set([
 '문의','신청','지원','안내','확인','처리','관리','이용','업무','담당','부서','가능','여부','방법','시기','기간','학생','학교','대학','순천대','순천대학교','국립순천대학교','서비스','관련','필요','발급','상담','운영','교육','프로그램','제도','정보','등록','사용','예약','접수','변경','취소','재발급','증명','대상','학기','공식','언제','어디서','어디','싶어','싶어요','궁금해','궁금해요','해야해','해야돼','알려줘','알려주세요','하고','받고','가고','알고','싶고','원하고','하려고','려고','신청전','신청후','처리전','처리후','하는데','했는데','있는데','없는데','어떻게돼','어떻게','해도돼','때문에','위해서','관련해서','대해서','관해서','그리고','또한','같이','함께','먼저','나서'
]);
const CATALOG_BASE_CONCEPTS=[
 ['course_registration',/(수강신청(?!(내역|확인서|취소|철회|변경|정정)))/g],
 ['leave_general',/(휴학(?!(증명|기간|연장|중|하면|했다가|후\s*복학)))/g],
 ['return',/(복학(?=(?:도|은|는|이|가|을|를|랑|과|와|하고|하려|신청|[,.!?;]|\s|$)))/g],
 ['sch_national',/(국가장학금|국장(?!근))/g],
 ['student_loan',/(학자금대출|등록금\s*대출|등록금.*빌리)/g],
 ['student_id_reissue',/((학생증|신분증).{0,12}(재발급|잃어버|분실))/g],
 ['major_transfer',/(전과(?=(?:도|은|는|이|가|을|를|랑|과|와|하고|하려|신청|부터|까지|만|이나|라도|조차|마저|[,.!?;]|\s|$)))/g],
 ['office365',/(microsoft\s*365|ms365|office\s*365|오피스365)/ig],
 ['student_email',/((학교|학생)\s*이메일.{0,12}(만들|필요|생성))/g],
 ['dorm_facility_report_board',/((기숙사|생활관).{0,15}(에어컨|전기|온수|난방).{0,10}(고장|안돼|문제))/g]
];
let CATALOG_MULTI_CACHE=null;
function isCatalogGrammarToken(term){
 term=normalizeQuery(term);
 return /(?:는데|했어|됐어|났어|렸어|해야해|해야돼|해야|할래|싶어|궁금해|필요해|어떻게|어떻게해|되나요|돼요|해요|하려고|려고|하는데|있는데|없는데|할수있어|할수있나요|해도돼|해도되나요)$/.test(term)||/(?:해|돼|있어|없어)$/.test(term)&&term.length<=6;
}
function getCatalogMultiAnchors(){
 if(CATALOG_MULTI_CACHE&&CATALOG_MULTI_CACHE.count===services.length)return CATALOG_MULTI_CACHE.anchors;
 const termOwners=new Map();
 const add=(term,s,w)=>{
   term=normalizeQuery(term);if(!term||term.length<3||CATALOG_MULTI_STOP.has(term))return;
   let owners=termOwners.get(term);if(!owners){owners=new Map();termOwners.set(term,owners);}
   owners.set(s.id,Math.max(owners.get(s.id)||0,w));
 };
 for(const s of services){
   const specs=[['title',s.title,5],...(s.aliases||[]).map(x=>['alias',x,5]),...(s.route_keywords||[]).map(x=>['route',x,4]),...(s.situations||[]).map(x=>['situation',x,3])];
   for(const [sourceKind,src,w] of specs){
     if(!src)continue;
     const words=String(src).normalize('NFKC').toLowerCase().split(/[^0-9a-z가-힣]+/).filter(Boolean);
     for(const word of words){const nw=normalizeQuery(word);if(sourceKind!=='situation'||!isCatalogGrammarToken(nw))add(word,s,w);}
     // Build phrase anchors from concrete workflow entries only. Situation phrases
     // must contain noun-like material; pure grammatical endings are never anchors.
     if(s.kind==='workflow'){
       for(let i=0;i+1<words.length;i++){
         const a=normalizeQuery(words[i]),b=normalizeQuery(words[i+1]);
         if(CATALOG_MULTI_STOP.has(a)&&CATALOG_MULTI_STOP.has(b))continue;
         if(sourceKind==='situation'&&isCatalogGrammarToken(a)&&isCatalogGrammarToken(b))continue;
         add(words[i]+words[i+1],s,w+1);
       }
     }
   }
 }
 const anchors=[...termOwners]
   .filter(([term,owners])=>owners.size<=12)
   .map(([term,owners])=>({term,owners:[...owners].map(([id,w])=>({id,w}))}))
   .sort((a,b)=>b.term.length-a.term.length||a.term.localeCompare(b.term));
 CATALOG_MULTI_CACHE={count:services.length,anchors};return anchors;
}
function normalizedQueryWithMap(raw){
 let normalized='',map=[];raw=String(raw||'');
 for(let i=0;i<raw.length;i++){
   for(const ch of raw[i].normalize('NFKC').toLowerCase()){
     if(/[0-9a-z가-힣]/.test(ch)){normalized+=ch;map.push(i);}
   }
 }
 return {normalized,map};
}
function serviceCatalogLexicon(service){
 return [service?.title,...(service?.aliases||[]),...(service?.route_keywords||[]),...(service?.situations||[])]
   .filter(Boolean).map(normalizeQuery).filter(Boolean);
}
function catalogLocalBounds(raw,clusters,index){
 const current=clusters[index];let left=index===0?0:clusters[index-1].re,right=index===clusters.length-1?raw.length:clusters[index+1].rs;
 if(index>0){const gap=raw.slice(clusters[index-1].re,current.rs);let last=-1;for(let i=0;i<gap.length;i++)if(/[.!?;,\n]/.test(gap[i]))last=i;if(last>=0)left=clusters[index-1].re+last+1;}
 if(index<clusters.length-1){const gap=raw.slice(current.re,clusters[index+1].rs);const m=gap.search(/[.!?;,\n]/);if(m>=0)right=current.re+m;}
 // Keep enough local context for qualifiers/actions without letting filler from a
 // previous intent dominate the resolver (e.g. “둘 다 궁금하고 ROTC 신청…”).
 left=Math.max(left,Math.max(0,current.rs-6));
 right=Math.min(right,Math.min(raw.length,current.re+18));
 return {left,right};
}
function collectCatalogWholeIntents(raw){
 raw=String(raw||'').trim();if(normalizeQuery(raw).length<4)return null;
 const {normalized:n,map}=normalizedQueryWithMap(raw);if(!n)return null;
 const hits=[];
 // Stable base concepts cover short Korean nouns (휴학/복학/전과) that are unsafe
 // to infer from arbitrary 2-character catalog n-grams.
 for(const [id,re] of CATALOG_BASE_CONCEPTS){
   re.lastIndex=0;let m;
   while((m=re.exec(raw))){
     const ns=normalizeQuery(raw.slice(0,m.index)).length,term=normalizeQuery(m[0]);
     if(term)hits.push({ns,ne:ns+term.length,term,owners:[{id,w:20}],fixed:true,score:1000+term.length});
     if(!re.global)break;
   }
 }
 // Data-driven anchors: at one text position, longest catalog phrases are most
 // informative. This is independent of commas, spaces, “하고”, “는데”, etc.
 const byStart=new Map();
 for(const a of getCatalogMultiAnchors()){
   let pos=n.indexOf(a.term);
   while(pos>=0){let arr=byStart.get(pos);if(!arr){arr=[];byStart.set(pos,arr);}arr.push(a);pos=n.indexOf(a.term,pos+1);}
 }
 for(const [pos,arr] of byStart){
   const maxLen=Math.max(...arr.map(a=>a.term.length));
   for(const a of arr.filter(a=>a.term.length===maxLen)){
     const maxW=Math.max(...a.owners.map(o=>o.w));
     hits.push({ns:pos,ne:pos+a.term.length,term:a.term,owners:a.owners,fixed:false,score:a.term.length*10+maxW*3-a.owners.length});
   }
 }
 if(!hits.length)return null;
 hits.sort((a,b)=>a.ns-b.ns||b.ne-a.ne||b.score-a.score);
 const clusters=[];
 for(const h of hits){
   let c=clusters[clusters.length-1];
   // Merge only true overlap. Adjacent concepts (“휴학성적정정”) must remain two.
   if(c&&h.ns<c.ne){c.ne=Math.max(c.ne,h.ne);c.hits.push(h);for(const o of h.owners)c.owners.set(o.id,Math.max(c.owners.get(o.id)||0,o.w));}
   else clusters.push({ns:h.ns,ne:h.ne,hits:[h],owners:new Map(h.owners.map(o=>[o.id,o.w]))});
 }
 for(const c of clusters){c.rs=c.ns<map.length?map[c.ns]:0;c.re=c.ne>0&&c.ne-1<map.length?map[c.ne-1]+1:raw.length;}
 const resolved=[];
 const wholeP0=globalThis.EodigaSearchCore?.resolve?.(raw,services);
 for(let i=0;i<clusters.length;i++){
   const c=clusters[i],bounds=catalogLocalBounds(raw,clusters,i),left=bounds.left,right=bounds.right;
   const fragment=raw.slice(left,right).trim();if(!fragment)continue;
   const route=searchCampusServices(fragment,true);let id=null;
   const fixed=c.hits.find(h=>h.fixed);
   // A generic base concept such as "휴학" must not erase a longer catalog concept that
   // contains it, e.g. "병역휴학". Use the generic fixed owner only when no more-specific
   // overlapping catalog anchor spans that base concept. This keeps ordinary 휴학 stable
   // while allowing specific workflow titles/aliases to win without sentence-specific patches.
   const hasSpecificOverlap=Boolean(fixed&&c.hits.some(h=>!h.fixed&&h.term.length>fixed.term.length&&h.ns<=fixed.ns&&h.ne>=fixed.ne));
   // In an independent enumeration, an explicit base concept (휴학/복학/전과/수강신청…)
   // is stronger than a cross-intent relationship card inferred from neighboring words,
   // unless a more-specific catalog concept already covers the same text span.
   if(fixed&&!hasSpecificOverlap&&(!hasStrongAtomicRelationshipSyntax(raw)||clusters.length>=3))id=fixed.owners[0].id;
   const workflows=[...c.owners].map(([id,w])=>({id,w,service:services.find(x=>x.id===id)}))
     .filter(x=>x.service?.kind==='workflow').sort((a,b)=>b.w-a.w||a.id.localeCompare(b.id));
   const representative=c.hits.slice().sort((a,b)=>b.score-a.score)[0]?.term||'';
   const exactTitleWorkflow=workflows.find(x=>normalizeQuery(x.service.title)===representative);
   const strongLocalReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','natural_title_question','natural_title_inquiry','exact','exact_situation','p0_resolver','context_priority','composite_early','specific']);
   // Resolve several anchor-forward prefixes and keep the strongest *catalog-owner*
   // interpretation. This prevents words belonging to the next intent from flipping a
   // concrete sub-service (e.g. "ROTC 신청 ... 학교 인터넷"), without enumerating
   // Korean conjunctions. Candidate cut points come only from text boundaries.
   const focusCandidates=[];
   const addFocus=(text,r)=>{if(!text||!r||r.status!=='answer'||!r.items?.length)return;for(const it of r.items){if(it?.service?.kind==='workflow'&&c.owners.has(it.service.id)){const reasonBonus=strongLocalReasons.has(r.reason)?2000:0;focusCandidates.push({id:it.service.id,value:(it.score||0)+reasonBonus,reason:r.reason,text});break;}}};
   addFocus(fragment,route);
   const endPoints=new Set([right]);
   for(let k=Math.max(c.re,c.rs+1);k<right;k++){if(/[\s.!?;,]/.test(raw[k]))endPoints.add(k);}
   for(const end of [...endPoints].sort((a,b)=>a-b)){
     const text=raw.slice(c.rs,end).trim();if(!text||text===fragment)continue;
     addFocus(text,searchCampusServices(text,true));
   }
   focusCandidates.sort((a,b)=>b.value-a.value||a.text.length-b.text.length);
   if(!id&&focusCandidates.length&&focusCandidates[0].value>=8000)id=focusCandidates[0].id;
   if(!id&&route?.status==='answer'&&route.items?.length){
     // Prefer a concrete workflow among locally-ranked catalog owners. Broad
     // department routes must not steal an exact workflow such as 등록금 납부.
     const ownerWorkflow=route.items.find(it=>it?.service?.kind==='workflow'&&c.owners.has(it.service.id));
     if(ownerWorkflow&&strongLocalReasons.has(route.reason))id=ownerWorkflow.service.id;
     else if(exactTitleWorkflow)id=exactTitleWorkflow.id;
     else if(ownerWorkflow)id=ownerWorkflow.service.id;
     else{const top=route.items[0].service,lex=serviceCatalogLexicon(top);if(c.owners.has(top.id)||c.hits.some(h=>lex.some(x=>x.includes(h.term))))id=top.id;}
   }
   if(!id&&fixed&&!hasSpecificOverlap)id=fixed.owners[0].id;
   if(!id&&exactTitleWorkflow)id=exactTitleWorkflow.id;
   // Whole-query P0 is only a last-resort disambiguator after the local fragment
   // and the explicit catalog concept have both abstained.
   if(!id&&wholeP0?.status==='answer'&&wholeP0.items?.length===1){
     const ps=wholeP0.items[0].service,plex=serviceCatalogLexicon(ps);
     if(c.owners.has(ps.id)&&c.hits.some(h=>plex.some(x=>x.includes(h.term))))id=ps.id;
   }
   if(!id&&workflows.length===1)id=workflows[0].id;
   const service=id?services.find(x=>x.id===id):null;
   if(service&&!clauseNegatesService(fragment,service))resolved.push({id,service,cluster:c});
 }
 const unique=[];for(const x of resolved){if(!unique.some(y=>y.id===x.id))unique.push(x);}
 if(unique.length<2)return null;
 // Relationship protection, derived from the catalog rather than connector words:
 // if a concrete workflow entry itself contains representative anchors from two
 // detected concepts and whole-query ranking supports it, keep that one workflow.
 const whole=searchCampusServices(raw,true),ranked=new Map((whole?.items||[]).map((it,i)=>[it.service.id,{rank:i,score:it.score||0}]));
 const p0=globalThis.EodigaSearchCore?.resolve?.(raw,services);
 const reps=unique.map(u=>u.cluster.hits.slice().sort((a,b)=>b.score-a.score)[0]?.term).filter(Boolean);
 let atomic=null;
 for(const s of services){
   if(s.kind!=='workflow')continue;
   let coverage=0;
   for(const entry of serviceCatalogLexicon(s))coverage=Math.max(coverage,reps.filter(t=>t&&entry.includes(t)).length);
   if(coverage<2)continue;
   const rr=ranked.get(s.id),isP0=p0?.items?.[0]?.service?.id===s.id;if(!rr&&!isP0)continue;
   const value=coverage*1000+(isP0?600:0)+(rr?400-rr.rank*40:0);
   if(!atomic||value>atomic.value)atomic={service:s,value};
 }
 if(unique.length===2&&atomic&&hasStrongAtomicRelationshipSyntax(raw))return null;
 const items=unique.map((x,i)=>({service:x.service,score:8800-i}));
 return {status:'answer',items:items.slice(0,5),reason:'multi_intent',broad:true,total_intents:items.length,truncated_count:Math.max(0,items.length-5),multi_source:'catalog_whole_query'};
}
function pickBestValidatedMulti(candidates){
 const valid=candidates.filter(Boolean).filter(r=>r.status==='answer'&&r.reason==='multi_intent'&&(r.items||[]).length>=2);
 if(!valid.length)return null;
 const priority={catalog_whole_query:3,app_clause_first:2,validated_implicit_connector:1};
 const workflowCount=r=>(r.items||[]).filter(it=>it?.service?.kind==='workflow').length;
 const localSemanticStrength=r=>Math.min(5,Number(r?.local_semantic_parts)||0);
 // When two independently split clauses each resolve through a high-confidence local object+action
 // interpretation, prefer that evidence over a whole-query catalog co-occurrence guess. Otherwise keep
 // the established catalog-first tie-breaker to avoid disturbing mature multi-intent behavior.
 valid.sort((a,b)=>(Number(b.total_intents)||b.items?.length||0)-(Number(a.total_intents)||a.items?.length||0)||(b.items?.length||0)-(a.items?.length||0)||localSemanticStrength(b)-localSemanticStrength(a)||workflowCount(b)-workflowCount(a)||((priority[b.multi_source]||0)-(priority[a.multi_source]||0)));
 return valid[0];
}
// -------------------------------------------------------------------------------

// Local natural-language resolver -------------------------------------------------
// Common student wording should not need an external LLM when the sentence already contains
// a clear administrative object + action/state combination.  These are concept-level lexicons,
// not full-sentence exceptions: aliases can combine freely with action families.
const LOCAL_NL_LEXICON={
  studentCard:['학생증','학생 카드','학생카드','학교 카드','학교카드','학교 신분증','학교신분증','학생 id','학생id','student id','studentid','id 카드','id카드','아이디 카드','아이디카드','신원 확인 수단','신원확인수단','신분 확인 수단','신분확인수단','교내 신원 확인','교내 신원확인','학생 신원 확인','학생 신원확인'],
  military:['군대','입대','입영','군입대','군복무','병역','영장','입영통지','입영 통지'],
  health:['보건실','보건진료실','보건소','진료','치료','응급처치','약'],
  club:['동아리','학교 모임','교내 모임','학생 모임','소모임','학생모임','교내모임','학교모임'],
  schoolVehicle:['학교 차량','학교차량','학교 차','교내 차량','교내차량','공용 차량','공용차량','학과 차량','학과차량'],
  dorm:['기숙사','생활관','긱사'],
  course:['수강','수업','수강 과목','수강과목','듣던 수업','듣던수업','이번 학기 과목','이번학기과목','과목'],
  rotc:['rotc','학군단','학생군사교육단']
};
const LOCAL_NL_ACTION={
  replace:/(재발급|재발행|다시.{0,5}(?:받|만들|발급)|새로.{0,5}(?:받|만들|발급)|잃어버|분실|없어졌|없어짐|깨졌|훼손|망가졌|고장났)/i,
  pause:/(휴학|쉬고\s*싶|쉬어야|쉬려|쉬지|한\s*학기\s*쉬|(?:잠깐|잠시).{0,6}(?:쉬|멈추|중단)|학교생활.{0,8}(?:쉬|멈추|중단)|학교.{0,5}(?:멈추|쉬|중단)|학업.{0,5}(?:멈추|중단|쉬))/i,
  resume:/(복학|다시.{0,6}(?:학교|대학).{0,5}(?:다니|가|돌아)|학교.{0,5}(?:돌아|복귀)|휴학.{0,6}(?:끝|마치).{0,6}(?:돌아|다니))/i,
  care:/(진료.{0,4}(?:받|보|원|싶)|치료.{0,4}(?:받|원|싶)|약.{0,4}(?:받|타|필요)|(?:아프|아픈|아파|아픔).{0,8}(?:어디|가|진료|약)|보건(?:실|진료실|소).{0,6}(?:가|이용|어디))/i,
  join:/(가입|들어가|들고\s*싶|활동|하고\s*싶|찾아|찾고\s*싶|알아보|궁금)/i,
  borrow:/(빌리|대여|빌릴|쓰고\s*싶|사용.{0,4}(?:하고|신청|싶)|이용.{0,4}(?:하고|신청|싶)|배차|예약)/i,
  prove:/(증명|증빙|서류|종이|문서|떼|뽑|출력|발급|받고\s*싶)/i,
  changeCourse:/(빼고\s*싶|빼려|빼야|삭제|취소|철회|바꾸|변경|정정)/i,
  registerCourse:/(수강신청|신청.{0,5}(?:하고|싶|해야|하려|할\s*거|하러)|과목.{0,3}담|담고\s*싶|등록.{0,5}(?:하고|싶|해야|하려)|듣고\s*싶)/i,
  enterDorm:/(입사|들어가고\s*싶|들어가려|살고\s*싶|신청.{0,4}(?:하고|싶))/i,
  leaveDorm:/(퇴실|퇴관|방\s*(?:도\s*)?빼(?:야|고|려|고\s*싶)?|나가고\s*싶|나가려|(?:기숙사|생활관).{0,7}나가(?:야|고|려|고\s*싶)?)/i,
  facilityProblem:/(고장|안\s*(?:돼|됨|되)|문제|누수|물\s*새|물이\s*새|물샘|망가)/i,
  apply:/(지원|신청|들어가고\s*싶|들어가려|선발|모집)/i
};
function localNlHas(query,terms=[]){const n=normalizeQuery(query);return terms.some(term=>n.includes(normalizeQuery(term)));}
function localNaturalRouteId(query){
  const raw=String(query||'').normalize('NFKC').toLowerCase();
  const n=normalizeQuery(raw);if(!n)return null;
  const campus=/(순천대|순천대학교|국립순천대학교|학교|교내|캠퍼스|학과|학부|대학|학생)/i.test(raw);

  // Student ID: colloquial "school card" + replacement/loss semantics.
  const externalCard=/(신용|체크|은행|카드사|법인|교통|하이패스|멤버십|포인트)\s*카드/i.test(raw);
  const studentCard=localNlHas(raw,LOCAL_NL_LEXICON.studentCard)||(campus&&/(?:^|\s)id\s*카드/i.test(raw))||(!externalCard&&/카드/i.test(raw));
  // Explicit first-issue wording wins over generic "새로 발급" wording.
  // Otherwise, a campus/student identity object combined with loss/replacement or
  // "새로 준비/마련" language is treated as the practical reissue route.
  if(studentCard&&/(최초|처음|신규).{0,8}(?:발급|만들|받|준비|마련)/i.test(raw))return 'student_id_first';
  if(studentCard&&(LOCAL_NL_ACTION.replace.test(raw)||/(?:새로|다시).{0,8}(?:준비|마련)/i.test(raw)))return 'student_id_reissue';

  // Military reason + pausing study is structurally a military leave request.
  if(localNlHas(raw,LOCAL_NL_LEXICON.military)&&LOCAL_NL_ACTION.pause.test(raw))return 'leave_military';

  // Return to study after a pause. This is intentionally checked before generic leave.
  if(LOCAL_NL_ACTION.resume.test(raw)&&(campus||/휴학|복학/.test(raw)))return 'return';
  if(!localNlHas(raw,LOCAL_NL_LEXICON.military)&&LOCAL_NL_ACTION.pause.test(raw)&&(campus||/학업|휴학/.test(raw)))return 'leave_general';

  // Campus health service. Require campus context unless an explicit health-office noun is present.
  if(LOCAL_NL_ACTION.care.test(raw)&&(campus||/보건실|보건진료실|보건소/.test(raw)))return 'health_clinic';

  // Ordinary student "모임/소모임" language maps to the general central-club guide, while
  // startup/job club wording remains for the existing specialized rules.
  if(localNlHas(raw,LOCAL_NL_LEXICON.club)&&LOCAL_NL_ACTION.join.test(raw)
     &&!/(창업|취업|동아리연합회)/i.test(raw)&&(campus||/동아리/.test(raw)))return 'central_club_info';

  // School-owned vehicle use; do not reinterpret ordinary shuttle/transit questions as rentals.
  if(localNlHas(raw,LOCAL_NL_LEXICON.schoolVehicle)&&LOCAL_NL_ACTION.borrow.test(raw))return 'school_vehicle';
  if(campus&&/(행사|견학|현장학습|워크숍)/i.test(raw)&&/(버스|차량|차)/i.test(raw)&&LOCAL_NL_ACTION.borrow.test(raw))return 'school_vehicle';

  // Certificate paraphrases: identify the status being proved, not merely the generic word "서류".
  if((/재학|학교.{0,7}(?:다니|다닌|다녀|재학)|대학.{0,7}(?:다니|다닌|다녀|재학)/i.test(raw))&&LOCAL_NL_ACTION.prove.test(raw))return 'cert_enroll';
  if(/졸업/i.test(raw)&&LOCAL_NL_ACTION.prove.test(raw)&&!/(졸업요건|졸업조건|졸업학점|졸업유예)/i.test(raw))return 'cert_graduation';
  if((/성적표|성적.{0,5}(?:증명|서류|종이|문서)/i.test(raw))&&LOCAL_NL_ACTION.prove.test(raw))return 'cert_transcript';

  // High-confidence action/object combinations for other frequent student wording.
  if(/등록금|학비/i.test(raw)&&/(나눠|나누어|분할|분납|몇\s*번.{0,4}내)/i.test(raw))return 'tuition_installment';
  if(localNlHas(raw,LOCAL_NL_LEXICON.course)&&LOCAL_NL_ACTION.changeCourse.test(raw))return 'course_change';
  if(localNlHas(raw,LOCAL_NL_LEXICON.course)&&LOCAL_NL_ACTION.registerCourse.test(raw)&&!LOCAL_NL_ACTION.changeCourse.test(raw))return 'course_registration';
  if(/장학/i.test(raw)&&/(국가근로|국근|학교.{0,6}일하면서|교내.{0,6}일하면서|근로.{0,4}장학)/i.test(raw))return 'sch_work';

  if(localNlHas(raw,LOCAL_NL_LEXICON.dorm)&&LOCAL_NL_ACTION.facilityProblem.test(raw))return 'dorm_facility_report_board';
  if(localNlHas(raw,LOCAL_NL_LEXICON.dorm)&&LOCAL_NL_ACTION.leaveDorm.test(raw))return 'dorm_move_out';
  if(localNlHas(raw,LOCAL_NL_LEXICON.dorm)&&LOCAL_NL_ACTION.enterDorm.test(raw))return 'dorm_apply';

  if(localNlHas(raw,LOCAL_NL_LEXICON.rotc)&&LOCAL_NL_ACTION.apply.test(raw))return 'rotc_application';
  if(/전과|학과.{0,5}(?:바꾸|옮)|다른\s*학과.{0,5}(?:가|옮)/i.test(raw)&&/(싶|신청|하려|바꾸|옮)/i.test(raw))return 'major_transfer';
  if(/복수전공|복전/i.test(raw)&&/(싶|신청|하려|하고)/i.test(raw)&&!/(포기|취소|그만)/i.test(raw))return 'double_major';
  if(/자퇴/i.test(raw)&&/(싶|신청|하려|그만|학교.{0,5}나가)/i.test(raw))return 'withdrawal';
  return null;
}
function localNaturalRoute(query){
  const id=localNaturalRouteId(query);if(!id)return null;
  const service=services.find(s=>s.id===id);if(!service)return null;
  return {status:'answer',items:[{service,score:9850}],reason:'local_natural',local_semantic:true};
}
// -------------------------------------------------------------------------------

function searchCampusServicesRaw(query,metaGuard=false){
 const q=String(query||'').trim().slice(0,300),n=normalizeQuery(q),qLoose=loosenQuery(q),nLoose=normalizeQuery(qLoose);if(!n)return {status:'unknown',items:[]};
 const p0=globalThis.EodigaSearchCore?.resolve?.(q,services);
 // An exact canonical service identity (including documented wrappers/facets) outranks
 // punctuation-based multi splitting. Official titles can legitimately contain '/', '&', '·'.
 const exactIdentityReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','title_with_method_facet','natural_title_question','natural_title_inquiry','exact_situation','exact_route_alias']);
 // Do not return an exact-looking whole-query identity yet when the user used a comma/semicolon.
 // First verify whether each separated chunk is itself an exact catalog service. This preserves
 // explicit multi-service enumerations even when a broader route title happens to resemble the whole string.
 // Safety/out-of-scope guards remain absolute. Relationship workflows are delayed
 // until after multi-intent discovery so a broad atomic rule cannot swallow a real
 // enumeration such as “휴학도 해야 하고 졸업증명서도 필요해”.
 if(p0&&shouldAlwaysKeepCoreSafety(p0))return p0;
 const broadKeywordCollection=broadSingleKeywordCollectionRoute(q);if(broadKeywordCollection)return broadKeywordCollection;
 const keywordLocked=keywordFirstRoute(q);if(keywordLocked)return keywordLocked;
 // If comma/semicolon-separated chunks are themselves exact official service titles,
 // preserve those service identities before any inner punctuation/anchor decomposition.
 // This prevents official titles containing '·', '/', '&' from being exploded into sub-intents.
 if(!metaGuard&&/[,;]/.test(q)){
   const segs=q.split(/[,;]+/).map(x=>x.trim()).filter(Boolean);
   if(segs.length>=2){
     const exactSegItems=[];let allExact=true;
     for(const seg of segs){
       const sn=normalizeQuery(seg),sl=normalizeQuery(loosenQuery(seg));
       const segCore=globalThis.EodigaSearchCore?.resolve?.(seg,services);
       if(segCore&&exactIdentityReasons.has(segCore.reason)&&(segCore.items||[]).length>=1){
         exactSegItems.push({service:segCore.items[0].service,score:9900-exactSegItems.length});continue;
       }
       let hits=SEARCH_INDEX.filter(e=>e.title===sn);
       if(!hits.length&&sl&&sl!==sn)hits=SEARCH_INDEX.filter(e=>e.title===sl);
       if(!hits.length){allExact=false;break;}
       const priority={workflow:0,academic_directory_general:1,academic_directory:2,department_route:3,official_route:4,organization_registry:5};
       hits.sort((a,b)=>(priority[a.service.kind]??9)-(priority[b.service.kind]??9));
       exactSegItems.push({service:hits[0].service,score:9900-exactSegItems.length});
     }
     if(allExact){
       const uniq=[];const seen=new Set();for(const it of exactSegItems){if(!seen.has(it.service.id)){seen.add(it.service.id);uniq.push(it);}}
       if(uniq.length>=2)return {status:'answer',items:uniq.slice(0,5),reason:'multi_intent',broad:true,total_intents:uniq.length,truncated_count:Math.max(0,uniq.length-5),multi_source:'explicit_exact_titles'};
     }
   }
 }
 if(p0&&exactIdentityReasons.has(p0.reason))return p0;
 // A high-confidence local object+action interpretation outranks fuzzy catalog decomposition for
 // ordinary single-intent wording. Explicit enumerations and protected relationship workflows still
 // go through the existing multi/atomic logic below.
 if(splitMultiIntent(q).length<2&&!hasStrongImplicitMultiCandidate(q)&&!hasExplicitEnumerationSyntax(q)&&!hasStrongAtomicRelationshipSyntax(q)){
   const localNaturalEarly=localNaturalRoute(q);
   // A single high-confidence local object+action interpretation may resolve before catalog
   // co-occurrence expansion when the deterministic core is absent OR independently agrees on
   // the same service. This prevents one natural intent from being inflated into unrelated cards.
   const coreId=p0?.items?.[0]?.service?.id,localId=localNaturalEarly?.items?.[0]?.service?.id;
   if(localNaturalEarly&&(!p0||(coreId&&coreId===localId)))return localNaturalEarly;
 }
 if(!metaGuard){
   const clauseFirst=collectResolvedMultiParts(splitMultiIntent(q));
   const catalogMulti=collectCatalogWholeIntents(q);
   const implicitMulti=resolveImplicitMultiChain(q);
   const bestMulti=pickBestValidatedMulti([clauseFirst,catalogMulti,implicitMulti]);
   // A natural routing question anchored by a complete canonical title should survive
   // spurious catalog decomposition when the proposed multi result does not even contain
   // that canonical intent and there is no evidence the user enumerated another request.
   // Compare intent groups (canonical_id) rather than raw IDs so route/workflow twins count
   // as the same administrative intent. Genuine enumerations still proceed to multi output.
   if(bestMulti&&p0?.reason==='natural_title_inquiry'&&(p0.items||[]).length>=1){
     const anchoredItems=(p0.items||[]).filter(it=>it?.service),anchoredGroups=new Set(anchoredItems.map(it=>serviceIntentGroup(it.service)).filter(Boolean));
     const multiGroups=new Set((bestMulti.items||[]).map(it=>serviceIntentGroup(it?.service)).filter(Boolean));
     // A valid expansion of a title-anchored inquiry must retain at least one anchored intent.
     if(anchoredGroups.size&&![...anchoredGroups].some(g=>multiGroups.has(g)))return p0;
     // Require distinctive evidence for every *new* intent in the text AFTER the complete
     // canonical title.  This prevents words that belong to a compound official title
     // (TOPIK·외국어강좌·모의토익, R&D, A&B...) or generic routing words (문의/어디/담당...)
     // from becoming fake extra requests. Genuine continuations such as "... ROTC도 궁금해"
     // still expand because ROTC itself is a catalog anchor in the suffix.
     const anchorService=anchoredItems.slice().sort((a,b)=>normalizeQuery(b.service.title).length-normalizeQuery(a.service.title).length)[0]?.service;
     const qmap=normalizedQueryWithMap(q),tn=normalizeQuery(anchorService?.title||'');
     let suffixNorm='';
     if(tn&&qmap.normalized.startsWith(tn)&&qmap.map[tn.length-1]!=null)suffixNorm=normalizeQuery(q.slice(qmap.map[tn.length-1]+1));
     const extraGroups=[...multiGroups].filter(g=>!anchoredGroups.has(g));
     const genericAnchor=/문의|물어|연락|전화|담당|부서|어디|누구|알려|궁금|가야|찾아가|방문|상담|확인/;
     const anchors=getCatalogMultiAnchors();
     const hasSuffixEvidence=extraGroups.length>0&&extraGroups.every(group=>anchors.some(a=>{
       if(!suffixNorm.includes(a.term)||CATALOG_MULTI_STOP.has(a.term)||isCatalogGrammarToken(a.term)||genericAnchor.test(a.term))return false;
       return a.owners.some(o=>serviceIntentGroup(services.find(s=>s.id===o.id))===group);
     }));
     if(!hasSuffixEvidence)return p0;
   }
   if(bestMulti&&p0?.status==='answer'&&(p0.items||[]).length===1&&(Number(bestMulti.total_intents)||bestMulti.items?.length||0)===2){
     const pid=p0.items?.[0]?.service?.id,mids=new Set((bestMulti.items||[]).map(it=>it?.service?.id).filter(Boolean));
     const enumerationEvidence=hasExplicitEnumerationSyntax(q)||bestMulti.multi_source==='app_clause_first'||(bestMulti.multi_source==='validated_implicit_connector'&&!hasStrongAtomicRelationshipSyntax(q));
     // For ordinary queries, let a validated 2-intent result beat a broad atomic workflow
     // unless the wording itself is strongly relational. Natural routing questions are already
     // protected by the dedicated natural_title_inquiry guard above.
     const atomicNonRelational=shouldKeepAtomicCoreResult(p0)&&!hasStrongAtomicRelationshipSyntax(q);
     if(pid&&!mids.has(pid)&&!enumerationEvidence&&!atomicNonRelational)return p0;
   }
   if(bestMulti&&((Number(bestMulti.total_intents)||bestMulti.items?.length||0)>=3||(!(p0&&shouldKeepAtomicCoreResult(p0))||!hasStrongAtomicRelationshipSyntax(q))))return bestMulti;
 }
 if(p0&&shouldKeepAtomicCoreResult(p0))return p0;
 if(p0)return p0;
 const fillerOnly=new Set(['싶어','싶어요','하고싶어','하고싶어요','할래','할래요','해줘','해주세요','알려줘','알려주세요','문의드려요','문의드립니다']);if(fillerOnly.has(n))return {status:'unknown',items:[],reason:'filler'};
 const hasMultipleIntents=!metaGuard&&splitMultiIntent(q).length>=2;
 // Whole-query out-of-scope rules can cross-contaminate separate clauses (e.g. one clause has
 // “추천”, another has “전공”). For explicit multi-intent input, validate each clause instead.
 if(!hasMultipleIntents&&isObviousNonCampus(q))return {status:'unknown',items:[],reason:'out_of_scope'};
 const genericInstitutionQueries=new Set(['순천대','순천대학교','국립순천대학교','순천대전화번호','순천대학교전화번호','국립순천대학교전화번호','학교전화번호']);
 if(genericInstitutionQueries.has(n))return {status:'unknown',items:[],reason:'no_signal'};

 if(n==='메이커스페이스'){const s=services.find(x=>x.id==='maker');if(s)return {status:'answer',items:[{service:s,score:6200}],reason:'specific'};}
 if(!hasMultipleIntents&&(n.includes('uv프린터')||n.includes('uvprinter')||n.includes('uv인쇄'))){const s=services.find(x=>x.id==='maker_uv_printer');if(s)return {status:'answer',items:[{service:s,score:6200}],reason:'specific'};}
 if(['컴퓨터학과','컴퓨터전공','컴퓨터관련학과','컴퓨터관련전공'].includes(n)){const s=services.find(x=>x.id==='directory_academic_units_general');if(s)return {status:'answer',items:[{service:s,score:6200}],reason:'directory_context'};}
 if(n==='컴공'){const s=services.find(x=>x.id==='directory_aerospace_materials');if(s)return {status:'answer',items:[{service:s,score:6200}],reason:'directory_context'};}

 let exactTitles=SEARCH_INDEX.filter(e=>e.title===n);
 if(!exactTitles.length&&nLoose&&nLoose!==n)exactTitles=SEARCH_INDEX.filter(e=>e.title===nLoose);
 if(exactTitles.length){
   const priority={workflow:0,academic_directory_general:1,academic_directory:2,department_route:3,official_route:4,organization_registry:5};
   exactTitles.sort((a,b)=>(priority[a.service.kind]??9)-(priority[b.service.kind]??9));
   return {status:'answer',items:[{service:exactTitles[0].service,score:6000}],reason:'exact'};
 }

 let exactSituations=exactSituationMatches(q);
 if(!exactSituations.length&&qLoose&&qLoose!==q)exactSituations=exactSituationMatches(qLoose);
 if(exactSituations.length)return {status:'answer',items:exactSituations.slice(0,7),reason:'exact_situation'};

 if(!hasMultipleIntents&&(n==='학점교류'||n==='학점교류문의'||n.startsWith('학점교류가궁금')||n.startsWith('학점교류궁금'))){
   const ids=['domestic_exchange','international_exchange_credit'];
   const items=ids.map((id,i)=>{const service=services.find(x=>x.id===id);return service?{service,score:5920-i}:null;}).filter(Boolean);
   if(items.length)return {status:'answer',items,reason:'credit_exchange_broad',broad:true};
 }
 if(!hasMultipleIntents&&(n==='학점인정'||n==='학점인정문의'||n.startsWith('학점인정받고싶'))){
   const ids=['external_credit','domestic_exchange','international_exchange_credit','transfer_credit'];
   const items=ids.map((id,i)=>{const service=services.find(x=>x.id===id);return service?{service,score:5900-i}:null;}).filter(Boolean);
   if(items.length)return {status:'answer',items,reason:'credit_broad',broad:true};
 }
 if(!hasMultipleIntents&&(n.includes('기숙사')||n.includes('생활관'))&&(n.includes('룸메')||n.includes('룸메이트'))&&(n.includes('싸웠')||n.includes('갈등')||n.includes('문제')||n.includes('힘들')||n.includes('상담'))){
   const service=services.find(x=>x.id==='dorm_counsel');if(service)return {status:'answer',items:[{service,score:5980}],reason:'context_priority'};
 }

 if(!metaGuard){
   const tail=!hasMultipleIntents?contrastTail(q):null;
   if(tail&&normalizeQuery(tail)!==n){
     const tr=searchCampusServices(tail,true);if(tr.status==='answer'&&(tr.items||[]).length)return {...tr,reason:'contrast'};
     const marker=q.match(/^(.*?)(?:(?<!기)말고요|(?<!기)말고|아니고|아니라|보다는|대신)\s*(.+)$/);
     if(marker){const words=marker[1].trim().split(/\s+/).filter(Boolean);if(words.length>1){words.pop();const augmented=(words.join(' ')+' '+tail).trim();const ar=searchCampusServices(augmented,true);if(ar.status==='answer'&&(ar.items||[]).length)return {...ar,reason:'contrast_context'};}}
   }
   const parts=splitMultiIntent(q);
   if(parts.length>=2){
     const collected=[];const seen=new Set();
     let sharedDomain=null;
     for(const rawPart of parts){
       // Ignore connective/filler fragments before shared-domain inheritance. Otherwise a
       // trailing '싶어'/'궁금해요' fragment can inherit the previous domain and manufacture
       // an unrelated third service (false addition).
       if(fillerOnly.has(normalizeQuery(rawPart))||isGenericMultiFiller(rawPart))continue;
       const part=trimMultiClauseWrapper(rawPart);
       let pr=searchCampusServices(part,true);
       if(sharedDomain&&(!partHasExplicitConcept(part))){
         const topDomain=pr?.items?.[0]?.service?.domain;
         const topScore=pr?.items?.[0]?.score||0;
         const strongReasons=new Set(['exact','exact_situation','composite_early','context_priority','directory_context','organization_typo','typo_strong','typo_phrase','credit_broad']);
         const independentlyStrong=pr.status==='answer'&&(pr.items||[]).length&&(strongReasons.has(pr.reason)||topScore>=1200);
         if(!independentlyStrong&&(pr.status!=='answer'||!(pr.items||[]).length||topDomain!==sharedDomain)){
           const anchor=DOMAIN_ANCHOR[sharedDomain];
           if(anchor){const contextual=searchCampusServices(anchor+' '+part,true);if(contextual.status==='answer'&&(contextual.items||[]).length&&contextual.items[0].service.domain===sharedDomain)pr=contextual;}
         }
       }
       if(pr.status!=='answer'||!(pr.items||[]).length)continue;
       // A tentative clause can still contain two valid intents when “또” means either
       // conjunction or “again”. The recursive core can resolve that nested phrase as
       // multi_intent; preserve all of those proven items instead of silently dropping #2.
       const partItems=pr.reason==='multi_intent'?(pr.items||[]).slice(0,5):[pr.items[0]];
       if(!sharedDomain&&partItems[0]?.service)sharedDomain=partItems[0].service.domain;
       for(const it of partItems){if(it?.service&&!seen.has(it.service.id)){seen.add(it.service.id);collected.push(it);}}
     }
     if(collected.length>=2){const total=collected.length;return {status:'answer',items:collected.slice(0,5),reason:'multi_intent',broad:true,total_intents:total,truncated_count:Math.max(0,total-5)};}
   }
 }
 if(['학과','학과찾기','학과찾아줘','학과목록','학과안내','전공찾기','전공찾아줘','전공목록','전공안내'].includes(n)||['학과','학과찾기','학과찾아줘','학과목록','학과안내','전공찾기','전공찾아줘','전공목록','전공안내'].includes(nLoose)||n.startsWith('학과찾')||n.startsWith('전공찾')||n.startsWith('학과어디')||n.startsWith('전공어디')){
   const general=services.find(x=>x.id==='directory_academic_units_general');
   const groups=services.filter(x=>x.kind==='academic_directory');
   const items=[];if(general)items.push({service:general,score:6100});
   for(const s of groups)items.push({service:s,score:5000});
   return {status:'answer',items:items.slice(0,7),reason:'academic_directory_broad',broad:true};
 }
 const earlyComposite=compositeRouteId(q)||((qLoose&&qLoose!==q)?compositeRouteId(qLoose):null);if(earlyComposite){const ecs=services.find(x=>x.id===earlyComposite);if(ecs)return {status:'answer',items:[{service:ecs,score:6000}],reason:'composite_early'};}
 const orgTypo=organizationNameTypoMatches(q);if(orgTypo.length)return {status:'answer',items:orgTypo,reason:'organization_typo'};
 const longOfficial=officialEntityMatches(q);if(longOfficial.length)return {status:'answer',items:longOfficial.slice(0,7),reason:'official_entity'};
 const explicitDir=explicitAcademicDirectoryMatches(q);if(explicitDir.length)return {status:'answer',items:explicitDir.slice(0,7),reason:'academic_directory_explicit'};
 if(qLoose&&qLoose!==q&&['과','학과','전공','스쿨'].some(x=>nLoose.endsWith(normalizeQuery(x)))){const looseDir=exactAcademicDirectoryMatches(qLoose);if(looseDir.length)return {status:'answer',items:looseDir.slice(0,7),reason:'academic_directory_named'};}
 const contextual=contextRoute(q)||((qLoose&&qLoose!==q)?contextRoute(qLoose):null);if(contextual)return contextual;
 const exactDir=exactAcademicDirectoryMatches(q);if(exactDir.length)return {status:'answer',items:exactDir.slice(0,7),reason:'academic_directory_exact'};
 const dmIntent=academicDirectoryIntentMatches(q);if(dmIntent.length)return {status:'answer',items:dmIntent.slice(0,7),reason:'academic_directory_intent'};
 const exactCatalogTerm=hasExactCatalogTermEvidence(q);
 const exactCatalogRoute=exactCatalogTerm?sharedExactCatalogTermRoute(q):null;if(exactCatalogRoute)return exactCatalogRoute;
 const earlyConcept=detectConcept(q);const typoAll=exactCatalogTerm?[]:typoCandidates(q);const typoDomains=new Set(typoAll.map(x=>x.service.domain));if(typoAll.length&&typoAll.length<=3&&typoDomains.size===1)return {status:'answer',items:typoAll.slice(0,7),reason:'typo_strong'};const typo=typoAll.filter(x=>!earlyConcept||x.service.domain===earlyConcept.domain);if(typo.length&&typo.length<=4)return {status:'answer',items:typo.slice(0,7),reason:'typo'};const typoPhraseAll=exactCatalogTerm?[]:typoPhraseCandidates(q);const typoPhraseDomains=new Set(typoPhraseAll.map(x=>x.service.domain));const conceptLooksTypo=earlyConcept&&normalizeQuery(earlyConcept.alias)!==n&&editDistanceOne(n,normalizeQuery(earlyConcept.alias));if(typoPhraseAll.length&&typoPhraseAll.length<=3&&typoPhraseDomains.size===1&&(!earlyConcept||(conceptLooksTypo&&typoPhraseAll.every(x=>x.service.domain===earlyConcept.domain))))return {status:'answer',items:typoPhraseAll.slice(0,7),reason:'typo_phrase'};
 const directoryMatch=academicDirectoryMatches(q);if(directoryMatch.length)return {status:'answer',items:directoryMatch.slice(0,7),reason:'academic_directory'};
 if(splitQuery(q).length===1&&!isSafeStandaloneQuery(q))return {status:'unknown',items:[],reason:'no_signal'};
 let strongRoute=strongRouteKeywordMatches(q);if(!strongRoute.length&&qLoose&&qLoose!==q)strongRoute=strongRouteKeywordMatches(qLoose);if(strongRoute.length)return {status:'answer',items:strongRoute.slice(0,7),reason:'route_keyword'};
 if((n.includes('자퇴')||n.includes('제적'))&&(n.includes('다시')||n.includes('복귀')||n.includes('재입학'))){const s=services.find(x=>x.id==='readmission');if(s)return {status:'answer',items:[{service:s,score:5100}],reason:'context'};}
 const cid=compositeRouteId(q);if(cid){const s=services.find(x=>x.id===cid);if(s)return {status:'answer',items:[{service:s,score:5000}],reason:'composite'};}
 if(n.includes('버스')&&(n.includes('대절')||n.includes('대졀')||n.includes('행사')||n.includes('견학')||n.includes('빌리'))){const s=services.find(x=>x.id==='school_vehicle');if(s)return {status:'answer',items:[{service:s,score:4900}],reason:'context'};}
 if((n.includes('통학')||n.includes('셔틀')||n==='버스')&&(n.includes('예약')||n.includes('qr')||n.includes('유니버스'))){const s=services.find(x=>x.id==='shuttle_reserve');if(s)return {status:'answer',items:[{service:s,score:4900}],reason:'context'};}
 const concept=detectConcept(q);
 if(!concept&&!hasCampusIntentSignal(q)&&splitQuery(q).length>=3)return {status:'unknown',items:[],reason:'no_signal'};
 let ranked=SEARCH_INDEX.map(e=>({service:e.service,score:Math.max(scoreSearchEntry(e,q,concept),qLoose&&qLoose!==q?scoreSearchEntry(e,qLoose,concept):0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.service.id.localeCompare(b.service.id));
 const genericPreferredId=GENERIC_BROAD_PREFERRED[n]||GENERIC_BROAD_PREFERRED[nLoose];
 if(genericPreferredId){
   const idx=ranked.findIndex(x=>x.service.id===genericPreferredId);
   let preferred=idx>=0?ranked.splice(idx,1)[0]:null;
   if(!preferred){const s=services.find(x=>x.id===genericPreferredId);if(s)preferred={service:s,score:5900};}
   if(preferred){preferred.score=Math.max(preferred.score,ranked[0]?.score||0)+1;ranked.unshift(preferred);}
 }
 if(concept&&!MULTI_DOMAIN_BROAD.has(n))ranked=ranked.filter(x=>x.service.domain===concept.domain||concept.preferred.includes(x.service.id));
 if(!ranked.length||ranked[0].score<430){const f=fuzzyFallback(q,ranked);if(f.length&&f[0].score>=520)ranked=f;}
 if(!ranked.length||ranked[0].score<430)return {status:'unknown',items:[]};
 if(!genericPreferredId&&!concept&&!entryHasMeaning(SEARCH_INDEX.find(e=>e.service.id===ranked[0].service.id),q)&&!entryHasMeaning(SEARCH_INDEX.find(e=>e.service.id===ranked[0].service.id),qLoose)&&normalizeQuery(q).length>=4)return {status:'unknown',items:[]};
 const top=ranked[0],second=ranked[1];
 if(concept&&!BROAD_CONCEPTS.has(n)){const rel=ranked.filter(x=>x.score>=Math.max(430,top.score*.42)).slice(0,7);return {status:'answer',items:rel.length?rel:[top],reason:'semantic'};}
 const broad=n.length<=3 || BROAD_CONCEPTS.has(n) || (ranked.length>=3&&second&&top.score-second.score<120&&n.length<=5);
 if(broad){
   let rel=ranked.filter(x=>x.score>=Math.max(420,top.score*.34));
   const durable=rel.filter(x=>!x.service.browse_hidden);if(durable.length)rel=durable;
   if(concept&&!MULTI_DOMAIN_BROAD.has(n)){
     const same=rel.filter(x=>x.service.domain===concept.domain||concept.preferred.includes(x.service.id));
     if(same.length)rel=same;
     return {status:'answer',items:rel.slice(0,7),reason:'broad',broad:true};
   }
   return {status:'answer',items:diversifyResults(rel,7),reason:'broad',broad:true};
 }
 if(concept){const rel=ranked.filter(x=>x.score>=Math.max(430,top.score*.42)).slice(0,7);return {status:'answer',items:rel.length?rel:[top],reason:'semantic'};}
 if(top.score>=650)return {status:'answer',items:ranked.slice(0,7),reason:'direct'};
 return {status:'unknown',items:[]};
}


function dedupeRouteIntentItems(route){
  if(!route||route.status!=='answer'||!Array.isArray(route.items)||route.items.length<2)return route;
  const out=[],keyToIndex=new Map();
  const routeKinds=new Set(['official_route','department_route']);
  // Some canonical base records intentionally omit canonical_id while sibling route records point
  // to that base ID. Treat a referenced base ID as the same canonical group; otherwise the base
  // and its route twin can occupy two visible answer slots.
  const canonicalTargets=new Set(services.map(s=>s?.canonical_id||s?.intent_group).filter(Boolean));
  const identityKey=service=>{
    const canonical=service?.canonical_id||service?.intent_group;
    if(canonical)return `canonical:${canonical}`;
    if(canonicalTargets.has(service?.id))return `canonical:${service.id}`;
    if(routeKinds.has(service?.kind)){
      const title=normalizeQuery(service?.title||''),dept=normalizeQuery(service?.department?.name||'');
      if(title&&dept)return `route:${title}|${dept}`;
    }
    return `id:${service?.id||''}`;
  };
  const representativePriority=service=>{
    const canonical=service?.canonical_id||service?.intent_group;
    if((canonical&&service?.id===canonical)||canonicalTargets.has(service?.id))return 0;
    if(service?.kind==='workflow')return 1;
    if(service?.kind==='official_route')return 2;
    if(service?.kind==='department_route')return 3;
    return 4;
  };
  for(const item of route.items){
    const service=item?.service;if(!service)continue;
    const key=identityKey(service);
    if(!keyToIndex.has(key)){keyToIndex.set(key,out.length);out.push(item);continue;}
    const idx=keyToIndex.get(key),prev=out[idx];
    if(representativePriority(service)<representativePriority(prev?.service))out[idx]={...item,score:prev?.score??item.score};
  }
  if(out.length===route.items.length)return route;
  const removed=route.items.length-out.length;
  const total=Number.isFinite(Number(route.total_intents))?Math.max(out.length,Number(route.total_intents)-removed):route.total_intents;
  const next={...route,items:out};
  if(total!=null&&!Number.isNaN(Number(total))){next.total_intents=Number(total);next.truncated_count=Math.max(0,Number(total)-out.length);}
  return next;
}
function isWrappedCanonicalTitleQuery(query){
 const n=normalizeQuery(query);if(!n)return false;
 const cores=new Set([n]);
 const suffixes=['관련해서궁금해요','좀알려주세요','문의'];
 for(let pass=0;pass<2;pass++){
   for(const c of [...cores]){
     if(c.startsWith('순천대에서')&&c.length>'순천대에서'.length)cores.add(c.slice('순천대에서'.length));
     for(const suf of suffixes)if(c.endsWith(suf)&&c.length>suf.length)cores.add(c.slice(0,-suf.length));
   }
 }
 for(const c of [...cores])for(const pref of ['국립순천대학교','순천대학교','순천대'])if(c.startsWith(pref)&&c.length>pref.length)cores.add(c.slice(pref.length));
 if(n.startsWith('학교')&&n.endsWith('문의')&&n.length>'학교문의'.length)cores.add(n.slice('학교'.length,-'문의'.length));
 return services.some(s=>cores.has(normalizeQuery(s.title||'')));
}
function searchCampusServices(query,metaGuard=false){
  // A generic single keyword (성적/장학/증명서/수강/기숙사...) represents a family of
  // administrative tasks. Collect those tasks before the single-preferred keyword lock, while
  // keeping multi-keyword input on the existing one-keyword-one-intent path.
  const broadKeywordCollection=broadSingleKeywordCollectionRoute(query);
  if(broadKeywordCollection)return dedupeRouteIntentItems(broadKeywordCollection);
  // Preserve a complete deterministic service identity before the lower-level keyword slot parser.
  // This covers canonical titles/situations plus harmless display/method facets, while explicit
  // multi-intent input is already returned by SearchCore as multi_intent rather than an identity.
  const coreIdentity=globalThis.EodigaSearchCore?.resolve?.(query,services);
  const unconditionalCoreIdentityReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','title_with_method_facet','natural_title_question','exact_situation','exact_route_alias']);
  if(coreIdentity&&unconditionalCoreIdentityReasons.has(coreIdentity.reason))return dedupeRouteIntentItems(coreIdentity);
  if(coreIdentity?.reason==='natural_title_inquiry'){
    const nq=normalizeQuery(query);
    const simpleFacetRemainders=new Set(['문의','담당부서','담당','위치','어디','필요서류','제출서류','서류','방법','신청방법','연락처','전화번호','전화']);
    const isSimpleTitleFacet=services.some(s=>{const t=normalizeQuery(s.title||'');return t&&nq.startsWith(t)&&nq.length>t.length&&simpleFacetRemainders.has(nq.slice(t.length));});
    if(isSimpleTitleFacet)return dedupeRouteIntentItems(coreIdentity);
  }
  // A unique curated natural-language situation may resolve the whole sentence only when
  // it is not itself a registered strong keyword and has no explicit multi-intent separator.
  // This restores the intended natural-language context layer without weakening keyword-first.
  // A trailing routing facet (문의/담당부서/위치/서류/방법...) must not let a broad
  // exact-situation sentence override a stronger catalog keyword once that facet is removed.
  // Example: '바이브코딩대회 문의' must keep the 바이브코딩대회 workflow rather than the
  // AI사업단 umbrella situation. Action-specific phrases such as '기숙사 신청 문의' are still
  // resolved later by the deterministic action resolver and facet guard.
  const hasStrongFacetBase=keywordFacetBaseCandidates(query).some(base=>{
    const r=keywordFirstRoute(base);return Boolean(r?.status==='answer'&&(r.items||[]).length);
  });
  const exactSituation=hasStrongFacetBase?null:exactSituationPriorityRoute(query);
  if(exactSituation)return dedupeRouteIntentItems(exactSituation);
  if(!metaGuard){const explicitClauses=explicitSeparatedClauseKeywordRoute(query);if(explicitClauses)return dedupeRouteIntentItems(explicitClauses);}
  // Keyword mode is the product's primary contract. Run it on the untouched input before
  // natural-language clause cleanup so separators that are part of official titles (·, /, &)
  // cannot destroy an otherwise exact 1~5 keyword enumeration.
  const sameServiceSoft=keywordOwnSoftTermRoute(query);
  if(sameServiceSoft)return dedupeRouteIntentItems(sameServiceSoft);
  const keywordLocked=keywordFirstRoute(query);
  if(!metaGuard){
    const rawParts=String(query||'').trim().replace(/[·]+/g,' ').split(/\s+/).map(x=>x.trim()).filter(Boolean);
    // Preserve the mature parser's official compound matches first, then fill only the independently
    // owned keyword slots it missed. Ambiguous single keywords consume one representative slot here,
    // so they cannot crowd another explicitly typed keyword out of the max-5 display.
    if(rawParts.length>=2&&rawParts.length<=12){
      const explicitKeywordList=explicitKeywordEnumerationRoute(query,keywordLocked);
      if(explicitKeywordList)return dedupeRouteIntentItems(explicitKeywordList);
    }
  }
  if(keywordLocked){
    // A trailing facet can make the token parser backtrack from one long exact title into
    // shorter unrelated anchors (e.g. ...·시설 + 문의). Audit the lock against the
    // facet-stripped keyword ownership before freezing it.
    const facetAdjusted=keywordFacetFallbackRoute(query,keywordLocked);
    return dedupeRouteIntentItems(facetAdjusted||keywordLocked);
  }
  // A punctuation/conjunction fragment can be only a follow-up facet of the preceding task,
  // not another administrative intent: "휴학하고 싶어. 어디로 가면 될까".
  // Remove those dependent tails before the deterministic whole-query scorer sees them.
  // This prevents generic routing words such as 연락처/서류/방법 from manufacturing a second service.
  let effectiveQuery=String(query||'');
  if(!metaGuard&&!isWrappedCanonicalTitleQuery(effectiveQuery)){
    const clauses=splitExplicitClauses(effectiveQuery);
    if(clauses.length>=2){
      const filler=new Set(['싶어','싶어요','싶음','하고싶어','하고싶어요','하고싶음','할래','할래요','해줘','해주세요','알려줘','알려주세요','문의드려요','문의드립니다']);
      const independent=clauses.filter(clause=>!filler.has(normalizeQuery(clause))&&!isDependentFollowupClause(clause));
      if(independent.length>=1&&independent.length<clauses.length)effectiveQuery=independent.join(' 그리고 ');
    }
  }
  const deterministic=dedupeRouteIntentItems(searchCampusServicesRaw(effectiveQuery,metaGuard));
  const facetKeyword=keywordFacetFallbackRoute(query,deterministic);
  if(facetKeyword)return dedupeRouteIntentItems(facetKeyword);
  if(deterministic?.status==='answer'&&(deterministic.items||[]).length)return deterministic;
  // Tail cleanup can occasionally remove the action from colloquial wording (e.g. 학교 카드 + 다시 받다).
  // Only after a deterministic miss do we retry the original sentence with the local concept resolver.
  // Safety/out-of-scope results remain authoritative.
  if(!shouldAlwaysKeepCoreSafety(deterministic)){
    const originalNatural=localNaturalRoute(query);if(originalNatural)return dedupeRouteIntentItems(originalNatural);
  }
  return deterministic;
}


function classifyRouteConfidence(route,query=''){
  if(!route||route.status!=='answer'||!(route.items||[]).length)return 'low';
  const highReasons=new Set(['exact_title','wrapped_exact_title','title_with_facet','title_with_method_facet','natural_title_inquiry','protected_alias','department_general','exact_situation','p0_resolver','exact_route_alias','canonical_route_alias','specific','exact','context_priority','composite_early','directory_context','multi_intent','local_natural','keyword_exact']);
  const mediumReasons=new Set(['semantic','broad','direct','typo','typo_strong','typo_phrase','official_entity','organization_typo','academic_directory','academic_directory_intent','academic_directory_explicit','academic_directory_named','credit_broad','academic_directory_broad']);
  if(highReasons.has(route.reason))return 'high';
  if(mediumReasons.has(route.reason))return 'medium';
  const top=route.items[0]?.score||0, second=route.items[1]?.score||0;
  if(top>=1800 && (!second || top-second>=220))return 'high';
  if(top>=650)return 'medium';
  return 'low';
}
function serviceIntentGroup(service){return service?.canonical_id||service?.intent_group||service?.id||'';}
function buildSearchEvidence(query,route){
  const q=String(query||''),n=normalizeQuery(q),top=route?.items?.[0];if(!top?.service)return {query:q,matches:[],confidence:'low',margin:null};
  const s=top.service,matches=[];
  const fields=[['title',[s.title]],['aliases',s.aliases||[]],['situations',s.situations||[]],['route_keywords',s.route_keywords||[]],['department',[s.department?.name]],['category',[s.category]]];
  for(const [field,vals] of fields)for(const raw of vals.filter(Boolean)){const x=normalizeQuery(raw);if(!x)continue;if(n===x||n.includes(x)||x.includes(n)){matches.push({field,value:String(raw)});if(matches.length>=8)break;}if(matches.length>=8)break;}
  const ops=['신청','취소','변경','환불','발급','재발급','조회','확인','납부','예약','신고','문의'];
  const queryOps=ops.filter(x=>n.includes(normalizeQuery(x)));
  const serviceText=normalizeQuery([s.title,...(s.aliases||[]),...(s.situations||[]),...(s.route_keywords||[])].join(' '));
  const operationCoverage=queryOps.filter(x=>serviceText.includes(normalizeQuery(x)));
  const first=route.items[0]?.score??null,second=route.items[1]?.score??null;
  return {query:q,service_id:s.id,matched_original_span:q,matches,operation_query:queryOps,operation_covered:operationCoverage,confidence:classifyRouteConfidence(route,q),margin:(first!=null&&second!=null)?first-second:null,reason:route.reason||null};
}
function classifierServices(result){
  const ids=[...(Array.isArray(result?.service_ids)?result.service_ids:[]),result?.service_id].filter(Boolean);
  const seen=new Set(),out=[];for(const id of ids){const s=services.find(x=>x.id===id);if(s&&!seen.has(id)){seen.add(id);out.push(s);}if(out.length>=5)break;}return out;
}
function mergeClassifierResult(localRoute,result,{partial=false,coverageAudit=false}={}){
  const ai=classifierServices(result);if(!ai.length)return localRoute;
  const local=(localRoute?.items||[]).map(x=>x.service).filter(Boolean);
  if(coverageAudit&&result?.coverage_complete===true){
    // In final coverage-audit mode Gemini returns the complete intended service-ID set, not just deltas.
    // This lets it add a missed intent and replace an overly broad deterministic match while all displayed
    // administrative facts still come only from the local verified catalog records.
    const localTotal=Number(localRoute?.total_intents)||local.length;
    // Gemini intentionally returns at most five displayed IDs. If the deterministic engine already
    // proved that the user expressed more than five independent intents, preserve that count so the
    // UI can still tell the user that additional requests were truncated instead of silently erasing it.
    const total=localTotal>5?Math.max(localTotal,ai.length):ai.length;
    return {status:'answer',items:ai.slice(0,5).map((service,i)=>({service,score:9500-i})),reason:ai.length>1?'multi_intent':'classifier',confidence:'high',ai_assisted:true,coverage_audited:true,total_intents:total,truncated_count:Math.max(0,total-Math.min(5,ai.length))};
  }
  if(partial){
    const groups=new Set(local.map(serviceIntentGroup));const merged=[...local];
    for(const s of ai){const g=serviceIntentGroup(s);if(groups.has(g))continue;groups.add(g);merged.push(s);if(merged.length>=5)break;}
    return {status:'answer',items:merged.map((service,i)=>({service,score:9000-i})),reason:merged.length>1?'multi_intent':'classifier',confidence:'high',ai_assisted:true};
  }
  // For a non-high local result, a high-confidence classifier result replaces rather than blindly unions
  // broad/conflicting candidates. Administrative facts still come only from these local service records.
  return {status:'answer',items:ai.slice(0,5).map((service,i)=>({service,score:9000-i})),reason:ai.length>1?'multi_intent':'classifier',confidence:'high',ai_assisted:true};
}
function vectorRuntimeEnabled(){
  return Boolean(globalThis.EodigaVector?.liveEnabled&&typeof globalThis.EodigaVector?.resolveClauses==='function');
}
const VECTOR_RESOLVE_TIMEOUT_MS=3500;
async function resolveVectorClausesSafely(clauses,lockedIds=[],maxAdd=5){
  const clean=(clauses||[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,5);
  if(!clean.length||maxAdd<=0)return {available:false,reason:'no_vector_slots',matches:[],unresolved_clauses:clean};
  if(!vectorRuntimeEnabled())return {available:false,reason:'vector_live_disabled',matches:[],unresolved_clauses:clean};
  try{
    const task=globalThis.EodigaVector.resolveClauses(clean,{locked_ids:(lockedIds||[]).slice(0,5),max_add:Math.max(0,Math.min(5,maxAdd))});
    let timer=null;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve({available:false,reason:'vector_timeout',matches:[],unresolved_clauses:clean}),VECTOR_RESOLVE_TIMEOUT_MS);});
    const out=await Promise.race([task,timeout]);
    if(timer)clearTimeout(timer);
    return out&&typeof out==='object'?out:{available:false,reason:'vector_invalid_result',matches:[],unresolved_clauses:clean};
  }catch(e){
    console.warn('[EodigaVector] fallback to Gemini:',e);
    return {available:false,reason:'vector_error',matches:[],unresolved_clauses:clean};
  }
}
function mergeVectorMatches(localRoute,vectorResult,{partial=false}={}){
  const ids=[...new Set((vectorResult?.matches||[]).map(x=>x?.service_id).filter(Boolean))].slice(0,5);
  if(!ids.length)return localRoute;
  const merged=mergeClassifierResult(localRoute,{service_ids:ids},{partial,coverageAudit:false});
  if(merged===localRoute)return localRoute;
  merged.vector_assisted=true;
  merged.ai_assisted=false;
  merged.vector_matches=(vectorResult.matches||[]).slice(0,5).map(x=>({clause:x.clause,service_id:x.service_id,score:x.score,margin:x.margin}));
  merged.reason=(merged.items||[]).length>1?'multi_intent':'vector';
  return merged;
}

function renderAiClarification(result){
  const host=$('#resultSummary');if(!host)return;const box=document.createElement('section');box.className='unresolved-notice ai-clarification';
  const b=document.createElement('b');b.textContent='정확한 업무를 확정하기 어려워요.';const p=document.createElement('p');p.textContent='대상·장소·하려는 일을 조금 더 구체적으로 입력해주세요.';box.append(b,p);host.appendChild(box);
}

function displayMethod(service){
  const m = service.method || {};
  let detail = [];
  if(m.online === true) detail.push('온라인 가능');
  if(m.visit_required === true) detail.push('방문 필요');
  else if(m.visit === true) detail.push('방문 가능');
  if(m.online === false) detail.push('온라인 불가');
  return {primary:m.primary || '공식 안내 확인', detail:detail.join(' · ')};
}

function safeUrl(url){
  try{
    const u = new URL(url);
    return ['http:','https:'].includes(u.protocol) ? url : '#';
  }catch(e){ return '#'; }
}

function setLoading(on){
  $('#searchBtn')?.classList.toggle('loading', on);
  if($('#searchBtn')) { $('#searchBtn').textContent = on ? '찾는 중…' : '어디가?'; $('#searchBtn').disabled=Boolean(on); }
}

function classifierCacheKey(query,context={}){
  const assistMode=context.assist_mode==='missing_only'?'missing_only':'full';
  const matched=(context.matched_service_ids||[]).slice(0,5).map(String);
  const unresolved=(context.unresolved_clauses||[]).slice(0,5).map(x=>normalizeQuery(maskPersonalInfo(x)));
  return JSON.stringify([normalizeQuery(maskPersonalInfo(query)),assistMode,matched,unresolved]);
}
function readClassifierCache(cacheKey){
  if(classifierCache.has(cacheKey))return classifierCache.get(cacheKey);
  try{
    const raw=sessionStorage.getItem(CLASSIFIER_CACHE_STORAGE_KEY);
    const rows=raw?JSON.parse(raw):[];
    if(Array.isArray(rows)){
      for(const row of rows){
        if(Array.isArray(row)&&row.length===2&&row[0]===cacheKey&&row[1]?.mode==='classifier'){
          classifierCache.set(cacheKey,row[1]);
          return row[1];
        }
      }
    }
  }catch(_){ }
  return null;
}
function writeClassifierCache(cacheKey,value){
  // Never cache 429/503/timeouts/unavailable. A temporary quota or server error must be able to recover.
  if(value?.mode!=='classifier')return;
  classifierCache.set(cacheKey,value);
  while(classifierCache.size>CLASSIFIER_CACHE_LIMIT)classifierCache.delete(classifierCache.keys().next().value);
  try{
    const rows=[...classifierCache.entries()].slice(-CLASSIFIER_CACHE_LIMIT);
    sessionStorage.setItem(CLASSIFIER_CACHE_STORAGE_KEY,JSON.stringify(rows));
  }catch(_){ }
}
async function classifyUncertainQuery(query, context={}){
  if(location.protocol === 'file:') return {mode:'unavailable',reason:'local_file'};
  const masked=maskPersonalInfo(query);
  const assistMode=context.assist_mode==='missing_only'?'missing_only':'full';
  const cacheKey=classifierCacheKey(masked,context);
  const cached=readClassifierCache(cacheKey);if(cached)return cached;
  if(pendingClassifierController) pendingClassifierController.abort();
  const controller=new AbortController();
  pendingClassifierController=controller;
  const timer=setTimeout(()=>controller.abort(),28000);
  try{
    const res = await fetch('/api/classify', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:masked,assist_mode:assistMode,matched_service_ids:(context.matched_service_ids||[]).slice(0,5),unresolved_clauses:(context.unresolved_clauses||[]).map(maskPersonalInfo).slice(0,5)}),
      signal:controller.signal
    });
    if(!res.ok) return {mode:'unavailable'};
    const value=await res.json();writeClassifierCache(cacheKey,value);return value;
  }catch(e){
    return {mode:'unavailable',reason:e?.name==='AbortError'?'timeout':'error'};
  }finally{
    clearTimeout(timer);
    if(pendingClassifierController===controller) pendingClassifierController=null;
  }
}

function cancelPendingClassifier(){
  searchSequence += 1;
  if(pendingClassifierController){
    pendingClassifierController.abort();
    pendingClassifierController=null;
  }
}

const memoryStorage = new Map();

function safeStorageRead(key, fallback){
  try{
    const raw=localStorage.getItem(key);
    if(raw){
      const value=JSON.parse(raw);
      memoryStorage.set(key,value);
      return value;
    }
  }catch(_){ }
  return memoryStorage.has(key) ? memoryStorage.get(key) : fallback;
}

function safeStorageWrite(key, value){
  memoryStorage.set(key,value);
  try{ localStorage.setItem(key,JSON.stringify(value)); }catch(_){ }
  return true;
}

function addRecentSearch(query){
  const q=String(query||'').trim().slice(0,300);
  if(!q || containsPersonalInfo(q)) return;
  const prior=safeStorageRead(RECENT_SEARCH_KEY,[]).filter(x=>typeof x==='string'&&x.trim()&&x!==q);
  safeStorageWrite(RECENT_SEARCH_KEY,[q,...prior].slice(0,3));
  renderRecentSearches();
}

function renderRecentSearches(){
  const box=$('#recentSearches');
  if(!box) return;
  const list=safeStorageRead(RECENT_SEARCH_KEY,[]).filter(x=>typeof x==='string'&&x.trim()).slice(0,3);
  box.innerHTML='';
  if(!list.length){box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  const label=document.createElement('span');
  label.className='recent-label';
  label.textContent='최근 검색';
  box.appendChild(label);
  list.forEach(q=>{
    const b=document.createElement('button');
    b.type='button';b.className='recent-chip';b.textContent=q;b.title=q;
    b.addEventListener('click',()=>{$('#searchInput').value=q;performSearch();});
    box.appendChild(b);
  });
  const clear=document.createElement('button');
  clear.type='button';clear.className='recent-clear';clear.textContent='지우기';
  clear.addEventListener('click',()=>{safeStorageWrite(RECENT_SEARCH_KEY,[]);renderRecentSearches();});
  box.appendChild(clear);
}

function loadCheckState(){
  const state=safeStorageRead(CHECK_STATE_KEY,{});
  return state&&typeof state==='object'&&!Array.isArray(state)?state:{};
}
function isChecked(key){return Boolean(loadCheckState()[key]);}
function setChecked(key, checked){
  const state=loadCheckState();
  if(checked)state[key]=true;else delete state[key];
  safeStorageWrite(CHECK_STATE_KEY,state);
}

function resetAllCheckState(){
  safeStorageWrite(CHECK_STATE_KEY,{});
  document.querySelectorAll('.item-check').forEach(btn=>{btn.setAttribute('aria-pressed','false');btn.textContent='○';btn.closest('li, .document-check-wrap')?.classList.remove('done');});
}

function makeCheckButton(key,label,kind='step'){
  const btn=document.createElement('button');
  btn.type='button';btn.className=`item-check ${kind}-check`;
  btn.setAttribute('aria-label',`${label} 완료 표시`);
  const apply=()=>{
    const checked=isChecked(key);
    btn.setAttribute('aria-pressed',checked?'true':'false');
    btn.textContent=checked?'✓':'○';
    btn.closest('li, .document-check-wrap')?.classList.toggle('done',checked);
  };
  btn.addEventListener('click',e=>{e.stopPropagation();setChecked(key,!isChecked(key));apply();});
  apply();
  return btn;
}

function uniqueValues(values){return [...new Set(values.map(x=>String(x||'').trim()).filter(Boolean))];}
function stableKeyPart(text=''){let h=2166136261;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function queryFacet(query=''){const q=String(query);return {phone:/전화|연락처/.test(q),location:/어디|위치|찾아가/.test(q),documents:/준비물|서류|뭐.{0,3}(필요|가져|내)/.test(q),period:/기간|언제|마감|신청일|몇\s*월|몇\s*일까지/.test(q),amount:/금액|얼마|수수료|비용|수강료|환불/.test(q),eligibility:/자격|조건|대상|가능(?:해|한|한가|한지|여부)/.test(q),schedule:/몇\s*시|시간|식사시간|아침|점심|저녁/.test(q),operations:/온수|냉방|난방|냉·난방|냉난방/.test(q)};}
function splitExplicitClauses(query=''){return splitMultiIntent(query).map(x=>x.trim()).filter(x=>x.length>=2);}
function meaningfulUnknown(route,clause){return route?.status==='unknown' && ['unsupported_item','ambiguous_location','ambiguous_term','unresolved_relation','not_found','no_signal'].includes(route.reason);}
// A sentence fragment is NOT a new administrative intent merely because punctuation or a
// conjunction split it from the previous sentence.  Missing-only Gemini assistance now uses a
// positive rule: a fragment must contain evidence of its OWN campus object/topic before it is
// eligible to become an unresolved task.  This prevents an open-ended list of Korean tail-question
// exceptions ("어디로 가?", "거기 몇 시까지 해?", "그거 뭐 챙겨?", etc.).
//
// Examples:
//   휴학하고 싶어. 어디로 가면 될까        -> second clause has no own object -> dependent
//   휴학하고 싶어. 그쪽 몇 시까지 해?     -> anaphoric/facet only -> dependent
//   휴학하고 싶어. 학교 카드 다시 받고 싶어 -> "카드" is a new object -> independent
//   휴학하고 싶어. 모임 가입도 하고 싶어    -> "모임" is a new object -> independent
function clauseCoreTokens(clause){
 const raw=String(clause||'').normalize('NFKC').toLowerCase();
 const parts=raw.replace(/[^0-9a-z가-힣]+/g,' ').split(/\s+/).filter(Boolean);
 const stripParticle=(token)=>{
   let t=normalizeQuery(token);
   if(!t)return '';
   // Remove only grammatical particles/endings. Do not stem arbitrary Korean nouns.
   const endings=['으로부터','에서부터','에게서','한테서','으로는','에서는','에게는','한테는','까지는','부터는','이라도','라도','이랑','랑','과','와','에게','한테','에서','으로','로는','에는','부터','까지','보다','처럼','만큼','조차','마저','밖에','도','만','은','는','이','가','을','를','에','로','의'];
   let changed=true;
   while(changed&&t.length>1){
     changed=false;
     for(const e of endings){
       if(t.endsWith(e)&&t.length-e.length>=1){t=t.slice(0,-e.length);changed=true;break;}
     }
   }
   return t;
 };
 return parts.map(stripParticle).filter(Boolean);
}
function hasIndependentTaskEvidence(clause){
 const raw=String(clause||'').trim();
 const n=normalizeQuery(raw);if(!n)return false;
 // Strong campus nouns (휴학/수강/기숙사/학생증...) are positive evidence even when Korean
 // particles or verb endings are attached. Unlike the broader semantic detector, this list does not
 // contain generic channel/facet words such as 홈페이지/시간/서류.
 if(hasExplicitCampusConceptWord(raw))return true;
 // A high-confidence local object+action interpretation is itself evidence of a new task,
 // even when the object is expressed indirectly (e.g. '교내 신원 확인 수단을 새로 준비').
 if(localNaturalRouteId(raw))return true;
 // We first extract the fragment's own lexical nucleus. A broad catalog/concept detector by itself
 // is not enough because channel/time words can appear in catalog metadata.

 const ignoredExact=new Set([
   // discourse / anaphora / pronouns
   '그리고','그럼','그러면','근데','그런데','그래서','그렇다면','또','또한','게다가','대신',
   '그거','그것','그건','그게','그걸','그곳','거기','거긴','거길','그쪽','그쪽','그부서','해당','해당부서',
   '이거','이것','이건','이게','이걸','이곳','여기','여긴','이쪽','저거','저것','저기','저쪽',
   '나','내','내가','저','제가','우리','본인','본인이','자기','자기가','거','것','건','게','곳','쪽',
   // question/facet vocabulary: attributes of a task, not a task object by themselves
   '어디','어느','어떻게','언제','누구','몇','얼마','뭐','무엇','무슨','어떤','왜','어디로','어디에','어디서',
   '담당','담당부서','담당자','부서','위치','연락처','전화번호','전화','연락','문의','방법','절차',
   '기간','마감','신청기간','신청일','준비물','필요서류','서류','증빙','증빙서류','양식','신청서','비용','수수료','금액','시간','운영시간','몇시','오전','오후','점심시간','평일','주말','토요일','일요일','오늘','내일',
   '온라인','오프라인','홈페이지','사이트','웹','방문','직접','먼저','나중','다시','관련','대해서','대해',
   // generic grammar/predicates that can attach to any prior task
   '좀','제발','혹시','그냥','자세히','구체적','구체적으로','알려','알려줘','알려주세요','궁금','궁금해','궁금해요','확인','확인해줘','맞아','맞나요','맞는지',
   '필요','필요해','필요한','가능','가능해','가능한','싶어','싶어요','싶음','할래','할래요',
   '하면','하면돼','하면될까','하면되','해야','해야해','해야돼','가면','가면돼','가면될까','가야','가야해','가야돼',
   '되는지','되나요','될까요','될까','돼','돼요','되어','되','해','해요','하나','하는','하려면','하려고',
   '있어','있나요','있는지','없어','없나요','열려','열려있어','열려있나요','챙겨','챙겨야','가져','가져가',
   // campus-context words alone do not identify a new service
   '학교','순천대','순천대학교','교내','학교안','학교내'
 ]);
 const ignoredStarts=[
   '알려','궁금','확인','필요','가능','문의','연락','전화','어떻게','어디','언제','누구','얼마','몇','뭐','뭔','무엇','왜',
   '하면','해야','가면','가야','되','돼','하나','하려','하는','챙기','챙겨','가져','열','운영','물어','말해','처리','쓰','써',
   '싶','있','없','먼저','나중','다시'
 ];
 const actionOnlyStarts=[
   // An action without its own object is normally a continuation of the preceding task.
   '신청','발급','재발급','등록','제출','예약','취소','조회','정정','변경','납부','결제','신고','방문','확인','문의'
 ];
 const tokens=clauseCoreTokens(raw);
 // Attribute questions about a previously mentioned task are dependent unless the fragment also
 // contains a strong action directed at its own object. This is category-based (location/contact/
 // documents/period/cost/eligibility/time), not a list of full Korean sentences.
 const facet=queryFacet(raw);
 const asksFacet=Object.values(facet).some(Boolean)||/(?:필요|챙겨|가져|준비|제출).{0,6}(?:해|돼|되|있|없|뭐|무엇|사진|서류|증빙|양식)/.test(n);
 const strongOwnAction=/(?:재발급|잃어버|분실|고장|가입|탈퇴|개설|대여|빌리|환불|정정|변경|바꾸|신고|예약|취소|다시.{0,5}(?:받|만들)|(?:받|만들|신청|발급|등록|납부|제출).{0,5}(?:싶|하려|해야|할래|받아|해줘))/.test(n);
 const content=[];
 for(let token of tokens){
   // "학교카드" is a colloquial object; remove only the generic school-context prefix.
   token=token.replace(/^(?:순천대학교|순천대|학교)/,'');
   if(!token||token.length<2)continue;
   if(ignoredExact.has(token))continue;
   if(ignoredStarts.some(x=>token.startsWith(x)))continue;
   if(actionOnlyStarts.some(x=>token.startsWith(x)))continue;
   // Common Korean connective/verb tails are not nouns. Keep lexical nouns such as 카드/모임/통장/버스.
   if(/(?:하고|하고싶어|하고싶어요|하려고|하려면|하는데|했는데|하면|해서|해도|받고|받아|받으|만들고|만들어|바꾸고|바꿔|잃어버|고장나|고장났|궁금하|필요하)$/.test(token))continue;
   content.push(token);
 }
 return content.length>0&&(!asksFacet||strongOwnAction);
}
function isDependentFollowupClause(clause){return !hasIndependentTaskEvidence(clause);}
function findUnresolvedClauses(query){
 const clauses=splitExplicitClauses(query);if(clauses.length<2)return [];
 const filler=new Set(['싶어','싶어요','싶음','하고싶어','하고싶어요','하고싶음','할래','할래요','해줘','해주세요','알려줘','알려주세요','문의드려요','문의드립니다']);
 const out=[];
 for(const clause of clauses){
   if(filler.has(normalizeQuery(clause))||isDependentFollowupClause(clause))continue;
   const r=searchCampusServices(clause,true);if(meaningfulUnknown(r,clause))out.push(clause);
 }
 return [...new Set(out)].slice(0,5);
}


function renderMultiSummary(items, query){
  const host=$('#resultSummary');if(!host)return;host.innerHTML='';
  const selected=items.slice(0,5).filter(x=>x?.service);
  const section=document.createElement('section');section.className='multi-summary';
  const top=document.createElement('div');top.className='multi-summary-top';
  const title=document.createElement('div');const kicker=document.createElement('span');kicker.className='summary-kicker';kicker.textContent='한 번에 확인하기';
  const h=document.createElement('h3');h.textContent=`${selected.length}개 업무를 한 번에 정리했어요.`;title.append(kicker,h);top.append(title);section.appendChild(top);
  const grid=document.createElement('div');grid.className='multi-summary-grid linked-summary-grid';
  selected.forEach(item=>{const service=item.service,box=document.createElement('div');box.className='summary-group linked-summary-item';
    const l=document.createElement('span');l.className='summary-label';l.textContent=item.display_title||service.title;box.appendChild(l);
    const dept=document.createElement('p');dept.className='summary-linked-line';dept.textContent=`담당: ${service.department?.name||'공식 출처 확인'}`;box.appendChild(dept);
    const docs=document.createElement('p');docs.className='summary-linked-line';docs.textContent=(service.documents||[]).length?`준비: ${(service.documents||[]).join(' · ')}`:'준비: 업무 카드/공식 출처에서 확인';box.appendChild(docs);grid.appendChild(box);
  });
  section.appendChild(grid);host.appendChild(section);
}

function clearResultSummary(){const host=$('#resultSummary');if(host)host.innerHTML='';}

function replaceClarifiedService(currentService, option){
  let targetId=currentService?.clarification?.target_ids?.[option]||null;
  if(!targetId){const r=searchCampusServices(`${currentService?.title||''} ${option}`,true);targetId=r?.status==='answer'?r.items?.[0]?.service?.id:null;}
  if(!targetId) return false;
  const targetService=services.find(s=>s.id===targetId);
  if(!targetService) return false;

  const grid=$('#resultGrid');
  const cards=[...grid.querySelectorAll('.service-card')];
  const oldCard=cards.find(card=>card.dataset.serviceId===currentService.id) || cards[0];
  const newNode=createServiceCard({service:targetService,score:999},true);

  if(oldCard) oldCard.replaceWith(newNode);
  else grid.appendChild(newNode);

  const box=$('#clarificationBox');box.classList.add('hidden');box.innerHTML='';
  pendingClarificationIds=pendingClarificationIds.filter(id=>id!==currentService.id);
  if(targetId!==currentService.id&&targetService?.clarification?.required&&!pendingClarificationIds.includes(targetService.id))pendingClarificationIds.unshift(targetService.id);
  if(grid.classList.contains('multi-result-grid')){
    const items=[...grid.querySelectorAll('.service-card')].map(card=>services.find(s=>s.id===card.dataset.serviceId)).filter(Boolean).map(service=>({service,score:999}));
    renderMultiSummary(items,activeResultQuery);
  }
  renderNextClarification();
  return true;
}

function handleClarificationChoice(service, option){
  if(replaceClarifiedService(service,option)) return;
}

function startClarificationQueue(serviceList=[]){
  pendingClarificationIds=[];
  for(const s of serviceList){if(s?.clarification?.required&&!pendingClarificationIds.includes(s.id))pendingClarificationIds.push(s.id);}
  renderNextClarification();
}
function renderNextClarification(){
  const grid=$('#resultGrid');
  while(pendingClarificationIds.length){
    const id=pendingClarificationIds[0];
    const present=grid?.querySelector(`.service-card[data-service-id=\"${CSS.escape(id)}\"]`);
    const service=services.find(s=>s.id===id);
    if(present&&service?.clarification?.required){renderClarificationPrompt(service);return;}
    pendingClarificationIds.shift();
  }
  const box=$('#clarificationBox');if(box){box.classList.add('hidden');box.innerHTML='';}
}

function renderClarificationPrompt(service){
  const box=$('#clarificationBox');
  box.innerHTML='';
  const c=service?.clarification;
  if(!c?.required||!c.question||!c.options?.length){box.classList.add('hidden');return;}
  box.classList.remove('hidden');
  const q=document.createElement('strong');q.textContent=c.question;box.appendChild(q);
  const opt=document.createElement('div');opt.className='clarify-options';
  c.options.forEach(o=>{
    const btn=document.createElement('button');btn.className='clarify-chip';btn.type='button';btn.textContent=o;
    btn.addEventListener('click',()=>handleClarificationChoice(service,o));opt.appendChild(btn);
  });
  box.appendChild(opt);
}

function sourceFreshness(source){
  const days=Number(dataset?.metadata?.freshness_policy?.review_days||365);
  const raw=source?.verified_at;if(!raw)return {known:false,stale:false};
  const d=new Date(`${raw}T00:00:00Z`);if(Number.isNaN(d.getTime()))return {known:false,stale:false};
  const age=Math.floor((Date.now()-d.getTime())/86400000);return {known:true,stale:age>days,age_days:age};
}

function createServiceCard(item, isPrimary=false){
  const {service} = item;
  const node = $('#serviceCardTemplate').content.cloneNode(true);
  const article = node.querySelector('.service-card');
  if(article) article.dataset.serviceId = service.id;

  node.querySelector('.category-pill').textContent = service.category;
  node.querySelector('.service-title').textContent = item.display_title || service.title;
  node.querySelector('.service-description').textContent = item.display_description || service.description || '공식 안내를 확인해주세요.';

  if(service.time_sensitive) node.querySelector('.time-warning').classList.remove('hidden');

  const steps = node.querySelector('.steps-list');
  const list = (service.steps && service.steps.length) ? service.steps : ['공식 안내 페이지에서 최신 절차를 확인합니다.'];
  list.forEach((step,i)=>{
    const li = document.createElement('li');
    const generic=/본인에게 해당하는 (?:신청 )?조건과 (?:필요한 서류를|제출사항을) 확인합니다\.?/.test(step);
    const shown=generic?'공식 공지에서 신청 조건·제출사항을 확인해야 합니다.':step;
    if(generic)li.classList.add('needs-official-check');
    const text=document.createElement('span');text.className='step-text';text.textContent=shown;
    li.appendChild(text);
    const key=`${service.id}:step:${stableKeyPart(step)}`;
    li.appendChild(makeCheckButton(key,shown,'step'));
    li.classList.toggle('done',isChecked(key));
    steps.appendChild(li);
  });

  const dept = service.department || {};
  node.querySelector('.department-name').textContent = dept.name || '공식 페이지 확인';
  const deptLines = [];
  if(dept.phone) deptLines.push(dept.phone);
  if(dept.location) deptLines.push(dept.location);
  node.querySelector('.department-location').textContent = deptLines.join(' · ') || '담당정보는 공식 출처에서 확인';

  const method = displayMethod(service);
  node.querySelector('.method-primary').textContent = method.primary;
  node.querySelector('.method-detail').textContent = method.detail;
  const facet=queryFacet(activeResultQuery);

  const docs = service.documents || [];
  if(docs.length){
    const sec = node.querySelector('.documents-section');
    sec.classList.remove('hidden');
    const wrap = sec.querySelector('.document-chips');
    docs.forEach((d,i)=>{
      const holder=document.createElement('span');holder.className='document-check-wrap';
      const text=document.createElement('span');text.className='document-chip';text.textContent=d;
      const key=`${service.id}:doc:${stableKeyPart(d)}`;
      holder.appendChild(makeCheckButton(key,d,'document'));
      holder.appendChild(text);holder.classList.toggle('done',isChecked(key));wrap.appendChild(holder);
    });
  }else if(facet.documents){
    const sec=node.querySelector('.documents-section');sec.classList.remove('hidden');
    const wrap=sec.querySelector('.document-chips');const text=document.createElement('span');text.className='document-chip';text.textContent='준비물 정보가 데이터에 확인되지 않았어요. 공식 출처에서 확인해주세요.';wrap.appendChild(text);
  }
  const facts=Array.isArray(service.facts)?service.facts:[];
  if(facts.length){
    const requested=new Set(Object.entries(facet).filter(([,v])=>v).map(([k])=>k));
    const ranked=facts.slice().sort((a,b)=>Number(requested.has(b.facet))-Number(requested.has(a.facet)));
    const sec=document.createElement('section');sec.className='facts-section';
    const fh=document.createElement('h4');fh.textContent='질문에 바로 답하기';sec.appendChild(fh);
    ranked.forEach(f=>{
      const row=document.createElement('div');row.className='fact-row';row.dataset.facet=f.facet||'';
      const label=document.createElement('span');label.className='fact-label';label.textContent=f.label||'공식 확인값';
      const value=document.createElement('strong');value.className='fact-value';value.textContent=f.value||'';
      row.append(label,value);
      if(f.applicability){const note=document.createElement('small');note.className='fact-applicability';note.textContent=f.applicability;row.appendChild(note);}
      if(f.source_url){const a=document.createElement('a');a.className='fact-source';a.href=safeUrl(f.source_url);a.target='_blank';a.rel='noopener';a.textContent=`공식 근거${f.verified_at?` · 확인 ${f.verified_at}`:''}`;row.appendChild(a);}
      sec.appendChild(row);
    });
    node.querySelector('.source-details')?.before(sec);
  }else if(facet.amount||facet.period||facet.eligibility||facet.schedule||facet.operations){
    const box=document.createElement('div');box.className='fact-missing';box.textContent='질문한 세부 정보는 현재 검증 데이터에 직접 확인값이 없어요. 아래 공식 출처에서 최신 내용을 확인해주세요.';node.querySelector('.source-details')?.before(box);
  }
  const notices=service.user_notice||[];if(notices.length){const box=document.createElement('div');box.className='user-notice';const b=document.createElement('b');b.textContent='확인할 점';box.appendChild(b);notices.slice(0,3).forEach(v=>{const p=document.createElement('p');p.textContent=v;box.appendChild(p);});node.querySelector('.source-details')?.before(box);}

  const locationCallout = node.querySelector('.location-callout');
  if(dept.location){
    locationCallout.classList.remove('hidden');
    locationCallout.querySelector('.location-text').textContent = dept.location;
    locationCallout.querySelector('.map-link').href = CAMPUS_MAP_URL;
  }

  const actions = node.querySelector('.card-actions');

  if(service.time_sensitive){
    const latest = document.createElement('a');
    latest.className = 'action-link secondary';
    latest.href = (service.sources && service.sources[0]?.url) ? safeUrl(service.sources[0].url) : 'https://www.scnu.ac.kr/SCNU/main.do';
    latest.target = '_blank'; latest.rel = 'noopener'; latest.textContent = '공식 안내·공지 확인';
    actions.appendChild(latest);
  }

  const actionSeen=new Set([...actions.querySelectorAll('a')].map(a=>a.href));
  (service.action_links || []).forEach((l)=>{
    const href=safeUrl(l.url);if(href==='#'||actionSeen.has(href))return;actionSeen.add(href);
    const a = document.createElement('a');
    a.className = actions.children.length===0 ? 'action-link' : 'action-link secondary';
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.label||'공식 페이지 열기';
    actions.appendChild(a);
  });
  if(!actions.children.length)actions.classList.add('hidden');

  const sources = node.querySelector('.source-list');const sourceSeen=new Set();
  (service.sources || []).forEach((src)=>{
    const href=safeUrl(src.url);if(href==='#'||sourceSeen.has(href))return;sourceSeen.add(href);
    const a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    const freshness=sourceFreshness(src);const stale=freshness.stale?' · 재확인 권장':'';
    a.textContent = `${src.label||'순천대 공식 출처'}${src.verified_at ? ` · 확인 ${src.verified_at}` : ' · 확인일 미기록'}${stale}`;
    a.title=src.url;
    sources.appendChild(a);
  });

  return node;
}

function relatedRecommendationItems(query, primaryService, alreadyShown=[], limit=5){
  if(!primaryService)return [];
  const excludedIds=new Set((alreadyShown||[]).map(x=>x?.service?.id).filter(Boolean));
  excludedIds.add(primaryService.id);
  const identity=s=>s?.canonical_id||s?.intent_group||s?.id||'';
  const excludedGroups=new Set((alreadyShown||[]).map(x=>identity(x?.service)).filter(Boolean));
  excludedGroups.add(identity(primaryService));
  const primaryEntry=SEARCH_INDEX.find(e=>e.service.id===primaryService.id);
  const primaryTokens=primaryEntry?.tokenSet||new Set();
  const dept=normalizeQuery(primaryService.department?.name||'');
  const category=normalizeQuery(primaryService.category||'');
  const domain=primaryService.domain||'';
  const concept=detectConcept(query);
  const loose=loosenQuery(query);
  const ranked=[];
  for(const e of SEARCH_INDEX){
    const s=e.service;
    if(!s||excludedIds.has(s.id)||excludedGroups.has(identity(s)))continue;
    const sameCategory=Boolean(category&&normalizeQuery(s.category||'')===category);
    const sameDomain=Boolean(domain&&s.domain===domain);
    const sameDept=Boolean(dept&&normalizeQuery(s.department?.name||'')===dept);
    const qScore=Math.max(scoreSearchEntry(e,query,concept),loose&&loose!==query?scoreSearchEntry(e,loose,concept):0);
    let shared=0;
    for(const t of e.tokenSet||[]){if(primaryTokens.has(t)&&!GENERIC_SEARCH_TERMS.has(t)&&!QUERY_STOP_WORDS.has(t))shared++;}
    const deptRelevant=sameDept&&qScore>=700;
    const domainRelevant=sameDomain&&qScore>=900;
    const strongQueryRelation=qScore>=1400;
    if(!(sameCategory||deptRelevant||domainRelevant||strongQueryRelation))continue;
    let score=qScore;
    if(sameCategory)score+=1800;
    if(sameDomain)score+=700;
    if(sameDept)score+=420;
    score+=Math.min(shared,4)*280;
    if(s.kind==='department_route')score-=180;
    if(s.browse_hidden)score-=250;
    ranked.push({service:s,score});
  }
  ranked.sort((a,b)=>b.score-a.score||a.service.title.localeCompare(b.service.title,'ko'));
  const out=[],seenTitles=new Set(),seenGroups=new Set();
  for(const item of ranked){
    const title=normalizeQuery(item.service.title||'');
    const group=identity(item.service);
    if(!title||seenTitles.has(title)||seenGroups.has(group))continue;
    seenTitles.add(title);seenGroups.add(group);out.push(item);
    if(out.length>=limit)break;
  }
  return out;
}

function renderAlternatives(primaryItem,candidates=[]){
  const primary=primaryItem?.service;
  if(!primary||!candidates.length)return null;
  const wrap = document.createElement('aside');wrap.className = 'alternatives';
  const h=document.createElement('h3');h.textContent='관련 업무';wrap.appendChild(h);
  const p=document.createElement('p');p.textContent='검색 결과와 함께 확인하면 좋은 관련 업무예요.';wrap.appendChild(p);
  const list = document.createElement('div');list.className = 'alt-list';
  candidates.slice(0,5).forEach(item=>{
    const b = document.createElement('button');b.className = 'alt-card';b.type = 'button';
    const dept=item.service.department?.name||'공식 부서 확인';
    const small=document.createElement('small');small.textContent=`${item.service.category} · ${dept}`;
    const strong=document.createElement('b');strong.textContent=item.service.title;
    const desc=document.createElement('span');desc.textContent=item.service.description||'';
    b.append(small,strong,desc);b.addEventListener('click',()=>showSpecific(item));list.appendChild(b);
  });
  wrap.appendChild(list);return wrap;
}

function showSpecific(item){
  cancelPendingClassifier();activeResultQuery='';clearResultSummary();
  $('#browseState').classList.add('hidden');$('#searchState').classList.remove('hidden');
  $('#resultHeading').textContent = '이 업무를 찾으셨나요?';
  renderClarificationPrompt(item.service);
  const grid = $('#resultGrid');grid.innerHTML = '';grid.style.gridTemplateColumns='';grid.classList.remove('multi-result-grid');
  grid.appendChild(createServiceCard(item,true));
  window.scrollTo({top:$('#searchState').offsetTop-40,behavior:'smooth'});
}

function unresolvedAfterClassifier(clauses=[],result={}){
  const input=[...new Set((clauses||[]).map(x=>String(x||'').trim()).filter(Boolean))];
  if(!input.length)return [];
  const statuses=Array.isArray(result?.intent_statuses)?result.intent_statuses:[];
  const matched=statuses.filter(x=>x?.status==='matched');
  const explicitlyUnresolved=statuses.filter(x=>['ambiguous','not_found','out_of_scope'].includes(x?.status));
  const spanMatchesClause=(span,clause)=>{const a=normalizeQuery(span),b=normalizeQuery(clause);return Boolean(a&&b&&(b.includes(a)||a.includes(b)));};
  const remaining=input.filter(clause=>{
    if(explicitlyUnresolved.some(x=>spanMatchesClause(x?.evidence_span,clause)))return true;
    if(matched.some(x=>spanMatchesClause(x?.evidence_span,clause)))return false;
    return true;
  });
  const hasUsableSpans=statuses.some(x=>String(x?.evidence_span||'').trim());
  if(!hasUsableSpans&&result?.coverage_complete===true&&(result?.service_ids||[]).length>=input.length)return [];
  return remaining;
}
function renderUnresolvedNotice(clauses=[]){
  const host=$('#resultSummary');if(!host||!clauses.length)return;
  const unique=[...new Set(clauses.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,5);if(!unique.length)return;
  const box=document.createElement('section');box.className='unresolved-notice partial-miss-notice';box.setAttribute('role','status');
  const head=document.createElement('div');head.className='partial-miss-head';
  const icon=document.createElement('span');icon.className='partial-miss-icon';icon.setAttribute('aria-hidden','true');icon.textContent='!';
  const text=document.createElement('div');const h=document.createElement('b');h.textContent=unique.length===1?'일부 요청은 찾지 못했어요.':`${unique.length}개의 요청은 찾지 못했어요.`;
  const lead=document.createElement('p');lead.className='partial-miss-lead';lead.textContent='구체적인 키워드로 바꿔 검색해보세요.';
  text.append(h,lead);head.append(icon,text);box.appendChild(head);
  const list=document.createElement('div');list.className='partial-miss-list';
  unique.forEach(c=>{const item=document.createElement('div');item.className='partial-miss-item';const label=document.createElement('span');label.textContent='찾지 못함';const q=document.createElement('strong');q.textContent=`“${c}”`;item.append(label,q);list.appendChild(item);});
  box.appendChild(list);host.appendChild(box);
}
function renderResultLimitNotice(route){const hidden=Math.max(0,Number(route?.truncated_count)||0);if(!hidden)return;const host=$('#resultSummary');if(!host)return;const box=document.createElement('section');box.className='unresolved-notice result-limit-notice';const b=document.createElement('b');const p=document.createElement('p');if(route?.broad&&route?.reason!=='multi_intent'){b.textContent='관련 업무가 많아 최대 5개를 먼저 안내해요.';p.textContent=`“${activeResultQuery}” 관련 업무 중 직접 관련도가 높은 5개를 우선 보여드려요. 찾는 내용이 없으면 키워드를 조금 더 구체적으로 입력해주세요.`;}else{b.textContent='한 번에 최대 5개 업무까지 안내해요.';p.textContent=`입력에서 ${Number(route?.total_intents)||5+hidden}개의 독립 업무를 찾았어요. 나머지 ${hidden}개는 별도로 검색해주세요.`;}box.append(b,p);host.appendChild(box);}
function shouldAssistMissingOnly(query,route){
  if(location.protocol==='file:'||!route||route.status!=='answer'||!(route.items||[]).length)return false;
  // Keyword results stay locked, but a genuinely independent clause that the keyword engine
  // did not resolve may still use missing-only Gemini to ADD the missing workflow.  Never let
  // Gemini re-judge or replace the already matched keyword IDs.  Pure keyword enumerations have
  // no unresolved independent clause, so they still make zero classifier calls.
  const unresolved=findUnresolvedClauses(query);
  if(!unresolved.length)return false;
  return (route.items||[]).length<5;
}

// FULL-assist gate -------------------------------------------------------------
// "로컬 검색 0건"은 곧바로 "Gemini 호출"을 뜻하지 않는다.
// Gemini는 (1) 캠퍼스 행정 대상/업무를 가리키는 명사 신호와 (2) 신청·발급·변경·문의·위치·기간 등
// 라우팅 의도가 함께 있을 때만 호출한다. 이 positive gate는 문장 예외목록이 아니라
// "업무 대상(object) + 행정 행위/질문(action)" 구조를 본다.
const FULL_ASSIST_STRONG_OBJECTS=[
  '학생증','신분증','성적표','재학증명','성적증명','졸업증명','증명서','장학재단','학자금','등록금','학비',
  '휴학','복학','자퇴','재입학','전과','다전공','복수전공','부전공','수강신청','수강정정','성적정정','졸업',
  '기숙사','생활관','통학버스','셔틀','동아리','학생회','교환학생','유학생','대학원','학군단','rotc','병역','군입대','군대',
  '보건진료','보건소','보건','진료','상담센터','인권','성폭력','성희롱','도서관','연구윤리','irb','창업','메이커스페이스',
  '향림통','lms','와이파이','wifi','주차','통학','분실물','졸업장','등록금분납','국가장학','근로장학'
];
const FULL_ASSIST_CONTEXT_OBJECTS=[
  '카드','버스','모임','통장','계좌','차량','방','에어컨','냉방','난방','누수','전기','조명','수도','화장실','강의실','실습실','연구실',
  '책','사물함','열람실','우산','노트북','프린터','증빙','서류','양식'
];
const FULL_ASSIST_ACTION_RE=/(신청|지원|접수|등록|발급|재발급|다시.{0,5}(?:받|만들)|받고\s*싶|받아야|받으려|만들고\s*싶|만들어야|잃어버|분실|훼손|정정|변경|바꾸|취소|철회|탈퇴|가입|예약|대여|빌리|반납|납부|내고\s*싶|환불|신고|고장|수리|안\s*(?:돼|되|나오|켜)|멈추|쉬고\s*싶|조회|확인|떼고\s*싶|출력|제출|문의|물어|찾아|찾고\s*싶|어디(?:로|에|서)?|어느\s*부서|연락처|전화번호|방법|절차|언제|기간|마감|얼마|비용|자격|조건|가능(?:해|한|한가|한지|여부)|누구(?:한테|에게)?)/i;
const FULL_ASSIST_CAMPUS_CONTEXT_RE=/(순천대|순천대학교|국립순천대학교|학교|교내|캠퍼스|학과|학부|전공|대학|학생|교수|강의실|실습실|연구실|기숙사|생활관)/i;
const FULL_ASSIST_EXTERNAL_CONTEXT_RE=/(넷플릭스|쿠팡|배민|배달의민족|은행|신용카드|체크카드|카드사|보험사|통신사|쇼핑몰|유튜브|인스타|틱톡|게임|카카오톡)/i;
function fullAssistObjectSignals(query){
  const n=normalizeQuery(query);const strong=[],contextual=[];
  const tokens=clauseCoreTokens(query).map(t=>t.replace(/^(?:국립순천대학교|순천대학교|순천대|학교|교내|캠퍼스)/,'')).filter(Boolean);
  const hasTerm=(term)=>{
    const x=normalizeQuery(term);if(!x)return false;
    // Very short nouns (방/책/차...) must be their own token. This prevents false hits such as 방 in 방법.
    if(x.length<=2)return tokens.some(t=>t===x||(t.startsWith(x)&&/^(?:받|신청|문의|예약|발급|재발급|잃|고장|수리|대여|빌|반납|가입|탈퇴|신고|납부|환불)/.test(t.slice(x.length))));
    return n.includes(x);
  };
  for(const term of FULL_ASSIST_STRONG_OBJECTS){if(hasTerm(term))strong.push(term);}
  for(const term of FULL_ASSIST_CONTEXT_OBJECTS){if(hasTerm(term))contextual.push(term);}
  return {strong:[...new Set(strong)].slice(0,5),contextual:[...new Set(contextual)].slice(0,5)};
}
const FULL_ASSIST_NOVEL_IGNORE=new Set([
  '학교','교내','캠퍼스','순천대','순천대학교','국립순천대학교','학생','대학','프로그램','업무','부서','담당','담당자',
  '어떻게','어디','어디로','어디에','언제','왜','뭐','무엇','어느','관련','문의','방법','절차','지원','신청','접수','등록',
  '하고','하고싶어','하고싶어요','하려고','하려면','해야','해야해','해야돼','하고자','되는','되려면','되고','싶어','싶어요','해','해주세요'
].map(normalizeQuery));
function hasNovelCampusTaskEvidence(query){
  const raw=String(query||'').trim();
  if(!FULL_ASSIST_CAMPUS_CONTEXT_RE.test(raw))return false;
  const tokens=clauseCoreTokens(raw).map(normalizeQuery).filter(Boolean);
  const meaningful=tokens.filter(t=>{
    if(t.length<2||FULL_ASSIST_NOVEL_IGNORE.has(t))return false;
    if(FULL_ASSIST_ACTION_RE.test(t))return false;
    if(/^(?:지원|신청|접수|등록|발급|재발급|문의|확인|조회|변경|정정|취소|제출|방법|절차|어떻게|어디|언제)/.test(t))return false;
    if(/(?:하려면|하려고|하고싶|해야|되는|되고|싶어|싶어요|해주세요|해줘)$/.test(t))return false;
    return true;
  });
  return meaningful.length>0;
}
function fullAssistGate(query,route={}){
  const raw=String(query||'').trim();const n=normalizeQuery(raw);
  if(!n)return {allow:false,reason:'empty',score:0,objects:[]};
  if(isObviousNonCampus(raw)||FULL_ASSIST_EXTERNAL_CONTEXT_RE.test(raw))return {allow:false,reason:'obvious_non_campus',score:0,objects:[]};
  const objects=fullAssistObjectSignals(raw);
  const explicitConcept=Boolean(hasExplicitCampusConceptWord(raw)||detectConcept(raw));
  const campusContext=FULL_ASSIST_CAMPUS_CONTEXT_RE.test(raw);
  const routingAction=FULL_ASSIST_ACTION_RE.test(raw);
  const strongObject=objects.strong.length>0||explicitConcept;
  const contextualObject=objects.contextual.length>0;
  const novelCampusObject=hasNovelCampusTaskEvidence(raw);
  const coreTokens=clauseCoreTokens(raw).filter(t=>t.length>=2&&!['학교','순천대','순천대학교','교내','캠퍼스','학생','대학'].includes(t));
  const keywordLike=coreTokens.length<=3&&!/[.!?。！？]/.test(raw)&&raw.length<=30;
  let score=0;if(strongObject)score+=4;if(contextualObject)score+=2;if(campusContext)score+=2;if(routingAction)score+=3;if(novelCampusObject)score+=2;
  // Normal sentence: a routing action/question must point to either a known campus object or a
  // meaningful *novel* object phrase in explicit campus context. This is what sends unfamiliar
  // wording such as "군 장교 되는 학교 프로그램에 지원..." to Gemini instead of silently
  // rendering no-result, while "학교 어디야" still fails closed as a facet-only question.
  if(routingAction&&(strongObject||contextualObject||novelCampusObject)){
    return {allow:true,reason:novelCampusObject&&!strongObject&&!contextualObject?'novel_campus_task':'task_signal',score,objects:[...objects.strong,...objects.contextual].slice(0,5)};
  }
  // Search boxes are also used as keyword boxes. Only strong campus/admin objects get this verb-less path.
  if(keywordLike&&strongObject)return {allow:true,reason:'campus_keyword',score,objects:[...objects.strong].slice(0,5)};
  return {allow:false,reason:'insufficient_admin_signal',score,objects:[...objects.strong,...objects.contextual].slice(0,5)};
}

function renderAssistPending(){
 activeResultQuery='';clearResultSummary();
 $('#resultHeading').textContent='입력 내용을 조금 더 확인하고 있어요.';
 const grid=$('#resultGrid');grid.innerHTML='';grid.setAttribute('role','status');grid.style.gridTemplateColumns='1fr';grid.classList.remove('multi-result-grid');
 const box=document.createElement('div');box.className='no-result assist-pending';
 const h=document.createElement('h3');h.textContent='기본 검색에서 확정하기 어려운 표현을 확인 중이에요.';
 const p=document.createElement('p');p.textContent='잠시 후에도 확정하기 어렵다면 더 구체적인 키워드와 공식 출처 확인 방법을 안내할게요.';
 box.append(h,p);grid.appendChild(box);
}
async function performSearch(options={}){
 const q=$('#searchInput').value.trim().slice(0,300);if(!q){$('#searchInput').focus();return;}
 cancelPendingClassifier();pendingClarificationIds=[];const requestId=searchSequence;
 $('#browseState').classList.add('hidden');$('#searchState').classList.remove('hidden');$('#clarificationBox').classList.add('hidden');clearResultSummary();setLoading(false);
 const t0=performance.now();let route;try{route=searchCampusServices(q);}catch(e){console.error(e);route={status:'unknown',items:[],reason:'error'};}const ms=performance.now()-t0;
 route.confidence=classifyRouteConfidence(route,q);route.evidence=buildSearchEvidence(q,route);
 if(route.status==='answer'&&route.items?.length){
   const unresolved=findUnresolvedClauses(q);route.unresolved_clauses=unresolved;
   if(options.saveRecent!==false)addRecentSearch(q);renderSearchResult(q,route,ms);
   if(!shouldAssistMissingOnly(q,route)){if(unresolved.length)renderUnresolvedNotice(unresolved);return;}
   setLoading(true);
   const initiallyMatched=route.items.slice(0,5).map(x=>x.service.id);
   const slots=Math.max(0,5-initiallyMatched.length);
   if(slots<=0){if(unresolved.length)renderUnresolvedNotice(unresolved);setLoading(false);return;}
   const vectorResult=await resolveVectorClausesSafely(unresolved,initiallyMatched,slots);
   if(requestId!==searchSequence||$('#searchInput').value.trim()!==q){setLoading(false);return;}
   let workingRoute=mergeVectorMatches(route,vectorResult,{partial:true});
   const mergedIds=new Set((workingRoute.items||[]).map(x=>x?.service?.id).filter(Boolean));
   const droppedVectorClauses=(vectorResult?.matches||[]).filter(x=>!mergedIds.has(x?.service_id)).map(x=>x?.clause).filter(Boolean);
   const remaining=[...new Set([...(vectorResult?.available?(vectorResult.unresolved_clauses||[]):unresolved),...droppedVectorClauses])];
   if(workingRoute!==route)renderSearchResult(q,workingRoute,ms);
   if(!remaining.length){setLoading(false);return;}
   const matched=workingRoute.items.slice(0,5).map(x=>x.service.id);
   // Exact/keyword results remain locked. Vector may fill only unresolved clauses; Gemini receives only
   // clauses that remain unresolved after Vector and can use only the remaining display slots.
   classifyUncertainQuery(q,{assist_mode:'missing_only',matched_service_ids:matched,unresolved_clauses:remaining}).then(r=>{
     if(requestId!==searchSequence||$('#searchInput').value.trim()!==q)return;
     if(r?.mode!=='classifier'){renderUnresolvedNotice(remaining);return;}
     if(r.confidence!=='high'||r.needs_clarification||r.coverage_complete!==true){renderUnresolvedNotice(remaining);renderAiClarification(r);return;}
     const merged=mergeClassifierResult(workingRoute,r,{partial:true,coverageAudit:false});
     const stillUnresolved=unresolvedAfterClassifier(remaining,r);
     if(merged!==workingRoute)renderSearchResult(q,merged,ms);
     if(stillUnresolved.length)renderUnresolvedNotice(stillUnresolved);
   }).catch(()=>{if(requestId===searchSequence)renderUnresolvedNotice(remaining);}).finally(()=>{if(requestId===searchSequence)setLoading(false);});return;
 }
 const hardAiBlockedReasons=new Set(['out_of_scope_other_university','role_mismatch']);
 // FULL Gemini is not a catch-all for every local miss.  The positive gate itself owns the
 // campus/admin decision; weak local labels such as no_signal/out_of_scope_general_advice must not
 // suppress a positively identified novel campus task before /api/classify is even attempted.
 const fullGate=fullAssistGate(q,route);
 const canAssist=location.protocol!=='file:' && !hardAiBlockedReasons.has(route.reason) && fullGate.allow;
 if(!canAssist){renderNoResult(q);return;}
 renderAssistPending();setLoading(true);
 const vectorResult=await resolveVectorClausesSafely([q],[],1);
 if(requestId!==searchSequence||$('#searchState').classList.contains('hidden')||$('#searchInput').value.trim()!==q){setLoading(false);return;}
 if(vectorResult?.matches?.length){
   const picked=mergeVectorMatches({status:'unknown',items:[],reason:route.reason},vectorResult,{partial:false});
   if(picked.status==='answer'&&picked.items?.length){
     if(options.saveRecent!==false)addRecentSearch(q);
     renderSearchResult(q,picked,ms);setLoading(false);return;
   }
 }
 classifyUncertainQuery(q,{assist_mode:'full'}).then(r=>{
   if(requestId!==searchSequence||$('#searchState').classList.contains('hidden')||$('#searchInput').value.trim()!==q)return;
   if(r?.mode!=='classifier'){renderNoResult(q);return;}
   if(r.confidence!=='high'||r.needs_clarification||r.coverage_complete!==true){renderNoResult(q);renderAiClarification(r);return;}
   const picked=mergeClassifierResult({status:'unknown',items:[],reason:route.reason},r,{partial:false,coverageAudit:false});
   if(picked.status!=='answer'||!picked.items?.length){renderNoResult(q);return;}
   if(options.saveRecent!==false)addRecentSearch(q);
   renderSearchResult(q,picked,ms);
 }).catch(()=>{if(requestId===searchSequence)renderNoResult(q);}).finally(()=>{if(requestId===searchSequence)setLoading(false);});
}

function renderSearchResult(q,route,ms=0){
 activeResultQuery=q;setLoading(false);clearResultSummary();
 const grid=$('#resultGrid');grid.innerHTML='';grid.removeAttribute('role');grid.style.gridTemplateColumns='';grid.classList.remove('multi-result-grid');
 const items=route.items||[];if(!items.length){renderNoResult(q);return;}
 if(route.reason==='multi_intent'){
   const full=items.slice(0,5);
   $('#resultHeading').textContent=`${full.length}개의 관련 업무를 함께 찾았어요.`;
   grid.classList.add('multi-result-grid');
   renderMultiSummary(full,q);
   renderResultLimitNotice(route);
   full.forEach(item=>grid.appendChild(createServiceCard(item,true)));
   startClarificationQueue(full.map(item=>item.service));
 }else if(route.broad&&items.length>=2){
   const full=items.slice(0,5);
   $('#resultHeading').textContent=`“${q}”와 관련된 업무를 모아봤어요.`;
   grid.classList.add('multi-result-grid');
   renderResultLimitNotice(route);
   full.forEach(item=>grid.appendChild(createServiceCard(item,true)));
   startClarificationQueue(full.map(item=>item.service));
 }else{
   $('#resultHeading').textContent=route.reason==='classifier'
     ? '입력 내용을 이렇게 이해했어요.'
     : route.reason==='semantic'
       ? `“${q}”의 의미와 가까운 공식 업무를 찾았어요.`
       : `“${q}”에 가장 가까운 공식 업무예요.`;
   grid.appendChild(createServiceCard(items[0],true));
   startClarificationQueue([items[0].service]);
   const recommendations=relatedRecommendationItems(q,items[0].service,items,5);
   const alt=renderAlternatives(items[0],recommendations);
   if(alt)grid.appendChild(alt);else grid.style.gridTemplateColumns='1fr';
 }
 $('#resultHeading').setAttribute('tabindex','-1');$('#resultHeading').focus({preventScroll:true});
 window.scrollTo({top:$('#searchState').offsetTop-35,behavior:'smooth'});
}
globalThis.EodigaDebug={
 version:'7.3.37-WIP',
 search(query){
   const q=String(query||'').slice(0,300);
   const route=searchCampusServices(q);
   route.confidence=classifyRouteConfidence(route,q);
   route.evidence=buildSearchEvidence(q,route);
   return route;
 },
 assistDecision(query){
   const q=String(query||'').slice(0,300);
   const route=searchCampusServices(q);
   const unresolved=route?.status==='answer'&&route?.items?.length?findUnresolvedClauses(q):[];
   const fullGate=fullAssistGate(q,route);
   return {version:'7.3.37-WIP',route_status:route?.status||null,route_reason:route?.reason||null,multi_source:route?.multi_source||null,matched_service_ids:(route?.items||[]).slice(0,5).map(x=>x.service?.id).filter(Boolean),unresolved_clauses:unresolved,full_gate:fullGate,vector_live_enabled:vectorRuntimeEnabled(),will_try_vector_full:vectorRuntimeEnabled()&&location.protocol!=='file:'&&route?.status!=='answer'&&!new Set(['out_of_scope_other_university','role_mismatch']).has(route?.reason)&&fullGate.allow,will_try_vector_missing_only:vectorRuntimeEnabled()&&Boolean(route?.status==='answer'&&route?.items?.length&&shouldAssistMissingOnly(q,route)),will_call_full:location.protocol!=='file:'&&route?.status!=='answer'&&!new Set(['out_of_scope_other_university','role_mismatch']).has(route?.reason)&&fullGate.allow,will_call_missing_only:location.protocol!=='file:'&&Boolean(route?.status==='answer'&&route?.items?.length&&shouldAssistMissingOnly(q,route))};
 }
};

function renderNoResult(q){
 activeResultQuery='';setLoading(false);clearResultSummary();
 $('#resultHeading').textContent='가장 가까운 업무를 찾기 어려워요.';
 const grid=$('#resultGrid');grid.innerHTML='';grid.setAttribute('role','status');grid.style.gridTemplateColumns='1fr';grid.classList.remove('multi-result-grid');
 grid.innerHTML=`<div class="no-result">
   <h3>관련 키워드를 조금 더 구체적으로 입력해보세요.</h3>
   <p class="no-result-copy">
     <span>찾고 있는 업무와 가까운 키워드를 한두 개 더 함께 적으면 더 정확하게 찾을 수 있어요.</span>
     <span>예: ‘장학금’보다 ‘국가장학금 신청’, ‘기숙사’보다 ‘기숙사 시설 고장’처럼 입력해보세요.</span>
   </p>
   <div class="no-result-category"><strong>검색이 잘 되지 않으면 아래 카테고리에서 직접 찾아볼 수도 있어요.</strong><button type="button" class="browse-help-btn">카테고리로 찾아보기</button></div>
 </div>`;
 const b=grid.querySelector('.browse-help-btn');
 if(b)b.addEventListener('click',()=>{cancelPendingClassifier();$('#searchState').classList.add('hidden');$('#browseState').classList.remove('hidden');setQuickBrowseExpanded(true);const qsec=document.querySelector('.quick-section');if(qsec)window.scrollTo({top:qsec.getBoundingClientRect().top+window.scrollY-18,behavior:'smooth'});});
 window.scrollTo({top:$('#searchState').offsetTop-35,behavior:'smooth'});
}

function getBrowseServices(){return services.filter(s=>!s.browse_hidden);}
function getBrowseCategoryCounts(){
 const counts={};for(const s of getBrowseServices())counts[s.category]=(counts[s.category]||0)+1;return counts;
}

function setQuickBrowseExpanded(expanded){
  const section=$('#quickSection');
  const toggle=$('#quickToggle');
  const strip=$('#categoryStrip');
  if(!section||!toggle||!strip)return;
  const open=Boolean(expanded);
  section.classList.toggle('is-collapsed',!open);
  toggle.setAttribute('aria-expanded',open?'true':'false');
  strip.hidden=!open;
}

function toggleQuickBrowse(){
  const toggle=$('#quickToggle');
  if(!toggle)return;
  setQuickBrowseExpanded(toggle.getAttribute('aria-expanded')!=='true');
}

function setBrowseExpanded(expanded){
  const section=$('#browseState');
  const toggle=$('#browseToggle');
  const grid=$('#popularGrid');
  if(!section||!toggle||!grid)return;
  const open=Boolean(expanded);
  section.classList.toggle('is-collapsed',!open);
  toggle.setAttribute('aria-expanded',open?'true':'false');
  grid.hidden=!open;
}
function toggleBrowse(){
  const toggle=$('#browseToggle');
  if(!toggle)return;
  setBrowseExpanded(toggle.getAttribute('aria-expanded')!=='true');
}

function renderCategories(){
  const strip = $('#categoryStrip');
  const counts = getBrowseCategoryCounts();
  const existing=Object.keys(counts);
  const ordered=preferredCategoryOrder.filter(c=>counts[c]);
  const rest=existing.filter(c=>!ordered.includes(c)).sort((a,b)=>(counts[b]||0)-(counts[a]||0));
  const cats=['전체',...ordered,...rest];
  strip.innerHTML = '';
  cats.forEach(cat=>{
    const b = document.createElement('button');
    b.className = 'category-chip' + (cat===currentCategory ? ' active':'');
    b.type = 'button';
    b.setAttribute('aria-pressed',cat===currentCategory?'true':'false');
    b.textContent = cat === '전체' ? '전체 업무' : `${categoryIcons[cat]||'•'} ${cat}`;
    b.addEventListener('click',()=>{
      cancelPendingClassifier();setLoading(false);
      currentCategory=cat;
      if(cat==='전체')browseShowAllCategories=false;
      renderCategories();
      renderPopular();
      $('#browseState').classList.remove('hidden');
      $('#searchState').classList.add('hidden');
      if(cat!=='전체'){
        window.scrollTo({top:$('#browseState').offsetTop-30,behavior:'smooth'});
      }
    });
    strip.appendChild(b);
  });
}

function makePopularCard(category,title,description,countText,onClick){
  const b=document.createElement('button');b.className='popular-card';b.type='button';
  const icon=document.createElement('span');icon.className='popular-icon';icon.textContent=categoryIcons[category]||'•';
  const count=document.createElement('span');count.className='count';count.textContent=countText;
  const h=document.createElement('h3');h.textContent=title;
  const p=document.createElement('p');p.textContent=description||'';
  b.append(icon,count,h,p);b.addEventListener('click',onClick);return b;
}

function renderPopular(){
  const grid = $('#popularGrid');const counts = getBrowseCategoryCounts();
  const cats=currentCategory==='전체'?[...preferredCategoryOrder.filter(c=>counts[c]),...Object.keys(counts).filter(c=>!preferredCategoryOrder.includes(c)).sort((a,b)=>(counts[b]||0)-(counts[a]||0))]:[currentCategory];
  grid.innerHTML='';
  if(currentCategory !== '전체'){
    const subset = getBrowseServices().filter(s=>s.category===currentCategory);
    subset.forEach(s=>grid.appendChild(makePopularCard(s.category,s.title,s.description||'',s.category,()=>showSpecific({service:s,score:100}))));
    return;
  }
  const visibleCats=browseShowAllCategories?cats:cats.slice(0,BROWSE_PREVIEW_LIMIT);
  visibleCats.forEach(cat=>grid.appendChild(makePopularCard(cat,cat,categoryCopy(cat),`${counts[cat]||0}개`,()=>{currentCategory=cat;browseShowAllCategories=false;renderCategories();renderPopular();})));
  if(cats.length>BROWSE_PREVIEW_LIMIT){
    const wrap=document.createElement('div');wrap.className='popular-more-wrap';
    const btn=document.createElement('button');btn.type='button';btn.className='popular-more-btn';
    btn.setAttribute('aria-expanded',browseShowAllCategories?'true':'false');
    btn.textContent=browseShowAllCategories?'간단히 보기':`전체 ${cats.length}개 카테고리 보기`;
    btn.addEventListener('click',()=>{browseShowAllCategories=!browseShowAllCategories;renderPopular();});
    wrap.appendChild(btn);grid.appendChild(wrap);
  }
}

function categoryCopy(cat){
  const copy={
  "휴학·복학": "휴학 신청, 병역·질병휴학, 복학과 휴학기간 변경",
  "수업·수강": "수강신청, 정정·재이수, 시간표와 계절학기",
  "장학·학자금": "국가·교내·교외장학, 국가근로와 학자금대출",
  "성적·시험": "성적 조회·정정, 시험, 강의평가와 출석 기준",
  "학생증": "학생증 최초 발급, 분실·훼손 재발급과 IC 학생증",
  "다전공": "복수·부전공, 융합·연계전공과 다전공 변경·취소",
  "증명서": "재학·성적·졸업 등 각종 증명서 발급",
  "등록금": "등록금 고지서, 납부 확인, 분할납부와 반환",
  "학생생활관": "입사·퇴사, 생활관비, 룸메이트, 식사와 시설 문의",
  "진로·취업": "진로상담, 자소서·면접 클리닉, 채용·현장실습",
  "IT·온라인서비스": "향림통, 포털, Wi-Fi, LMS, 메일·소프트웨어 지원",
  "도서관": "대출·반납, 열람실, 학습공간과 도서관 이용 문의",
  "학적": "전과·전공변경, 자퇴·재입학과 학적부 정정",
  "졸업": "졸업요건, 조기졸업, 수료·유예와 졸업자격인증",
  "학점인정": "외부시험·자격증, 국내외 학점교류와 편입학점 인정",
  "교통": "통학버스 노선·이용과 예약·탑승 안내",
  "교통·주차": "교내 정기주차 등록과 기존 정기권 연장",
  "보건": "보건진료실, 응급처치, 학생보험과 보조물품 대여",
  "상담·인권": "개인·집단상담, 심리검사와 성희롱·성폭력 상담",
  "국제교류": "교환·파견학생, 해외프로그램, 외국어강좌와 모의토익",
  "장애학생지원": "수강·학습·이동 지원과 보조기기·도우미",
  "학생생활": "교내 분실물·습득물과 고시원 등 생활 관련 안내",
  "학생활동": "총학생회·중앙동아리와 학생자치·활동 지원",
  "시설": "강의실·교내 시설 고장, 체육시설과 시설물 사용",
  "입학": "수시·정시·편입·외국인전형과 입학상담",
  "교육과정": "본인 적용 교육과정과 편입생 교육과정 확인",
  "교직": "교직과정, 교직 복수전공과 교원자격증",
  "학생지원": "봉사·해외탐방·학생복지 등 학생지원 프로그램",
  "교육혁신": "비교과, 교양교육, 학생역량과 LMS 교육지원",
  "창업": "창업교육·동아리·지원사업과 메이커스페이스",
  "학과·전공 찾기": "스쿨·대학과 소속 학과·전공 공식 홈페이지 찾기",
  "대학원": "일반·특수대학원의 입시, 학적, 논문과 장학 문의",
  "병무·ROTC": "학군단 제도와 ROTC 모집·선발 안내",
  "AI인재양성부트캠프": "바이브코딩, AI교육, A.U.R.A·AX OPEN LAB 등 사업단 프로그램",
  "사업단·특별프로그램": "SW중심대학, AI부트캠프, RISE, GTEP 등 사업단 안내",
  "연구·산학협력": "연구과제·R&D 공고, 연구비·중앙구매와 산학협력",
  "인권·연구윤리": "인권 사건, IRB, 연구윤리·연구진실성 관련 업무",
  "평생교육": "평생교육원 강좌, 수강신청과 교육과정 문의",
  "학교 부속기관": "박물관·언론사·공동실험실습관·농업과학교육원 등",
  "학교생활·기관": "대학 언론·행사 방송 등 교내 기관 서비스",
  "행정·총무": "정보공개, 주차관리, 대관과 총무 행정",
  "행정·재무": "등록금·세입, 계약·지출 등 재무 행정",
  "학사·교무": "수강·성적·졸업·학적 등 교무학사과 담당 업무",
  "발전기금·기부": "발전기금 기탁, 기부금영수증, 장학과 후원의 집",
  "홍보·대외협력": "대학홍보, MOU, 보도자료와 교내 전광판",
  "기획·평가": "대학 발전계획, 재정지원사업과 공간조정",
  "교원·인사": "전임·비전임교원 채용과 교원평가·겸직",
  "교직원·인사": "공무원·대학회계직 인사와 복무",
  "기관·센터 찾기": "사업단·센터·연구소 등 공식 조직과 문의처 찾기",
  "도움말": "학사 FAQ와 공식 학사안내 찾기"
};
  return copy[cat] || '관련 공식 업무와 담당부서를 확인할 수 있습니다.';
}

function resetSearch(){
 cancelPendingClassifier();activeResultQuery='';
 $('#searchInput').value='';clearResultSummary();
 $('#clarificationBox').classList.add('hidden');$('#clarificationBox').innerHTML='';
 $('#searchState').classList.add('hidden');$('#browseState').classList.remove('hidden');
 currentCategory='전체';browseShowAllCategories=false;renderCategories();renderPopular();
 const shell=$('#searchShell');const top=shell?shell.getBoundingClientRect().top+window.scrollY-100:0;
 window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
 setTimeout(()=>$('#searchInput').focus(),220);
}

async function init(){
  const grid=$('#popularGrid');
  try{
    if(grid)grid.setAttribute('aria-busy','true');
    const res = await fetch(`./scnu_services.json?v=${encodeURIComponent(DATA_CACHE_VERSION)}`,{cache:'no-cache'});
    if(!res.ok)throw new Error(`data_http_${res.status}`);
    dataset = await res.json();
    services = Array.isArray(dataset.services)?dataset.services:[];
    if(!services.length)throw new Error('empty_dataset');
    buildSearchIndex();
    renderCategories();
    renderPopular();
    setQuickBrowseExpanded(true);
    setBrowseExpanded(true);
    renderRecentSearches();
  }catch(e){
    console.error('데이터 초기화 오류',e);
    if(grid){grid.innerHTML='';const box=document.createElement('div');box.className='no-result';box.setAttribute('role','alert');const h=document.createElement('h3');h.textContent='업무 데이터를 불러오지 못했어요.';const p=document.createElement('p');p.textContent='네트워크 상태를 확인한 뒤 다시 시도해주세요.';const b=document.createElement('button');b.type='button';b.className='browse-help-btn';b.textContent='다시 불러오기';b.addEventListener('click',init);box.append(h,p,b);grid.appendChild(box);}
  }finally{if(grid)grid.removeAttribute('aria-busy');}
}

$('#searchBtn').addEventListener('click',performSearch);
$('#searchInput').addEventListener('input',()=>{if(pendingClassifierController){cancelPendingClassifier();setLoading(false);}});
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!$('#searchBtn')?.disabled) performSearch();});
$$('.example-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $('#searchInput').value=btn.textContent.trim();
    performSearch();
  });
});

const resetSearchBtn=$('#resetSearchBtn');if(resetSearchBtn)resetSearchBtn.addEventListener('click',resetSearch);
const quickToggle=$('#quickToggle');if(quickToggle)quickToggle.addEventListener('click',toggleQuickBrowse);
const browseToggle=$('#browseToggle');if(browseToggle)browseToggle.addEventListener('click',toggleBrowse);

init();
