let dataset = null;
let services = [];
let currentCategory = '전체';
let pendingClassifierController = null;
let searchSequence = 0;
let activeResultQuery = '';
const RECENT_SEARCH_KEY = 'eodiga_recent_searches_v1';
const CHECK_STATE_KEY = 'eodiga_check_state_v1';
const CAMPUS_MAP_URL = 'https://www.scnu.ac.kr/SCNU/cm/cntnts/cntntsView.do?cntntsId=1046&mi=1182';

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
   const high=[s.title,s.department?.name,...(s.route_keywords||[])].filter(Boolean).map(normalizeQuery);
   const mid=[s.category,...(s.search_terms||[]),...(s.situations||[])].filter(Boolean).map(normalizeQuery);
   const low=[s.description,...(s.notes||[])].filter(Boolean).map(normalizeQuery);
   const all=[...high,...mid,...low].filter(Boolean);
   return {service:s,high,mid,low,all,joined:all.join(' '),title:normalizeQuery(s.title),dept:normalizeQuery(s.department?.name||'')};
 });
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
 const toks=splitQuery(q).map(normalizeQuery).filter(x=>x.length>=2);if(toks.length>1){let hit=0;for(const t of toks)if(e.joined.includes(t))hit++;s+=hit*105;if(hit===toks.length)s+=220;}
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
 return candidates.sort((a,b)=>b.score-a.score);
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
 return out.sort((a,b)=>b.score-a.score);
}

function isObviousNonCampus(q){
 const n=normalizeQuery(q);
 if(n.includes('연애')&&n.includes('상담')&&!['순천대','학교','교내','학생상담','상담센터'].some(x=>n.includes(normalizeQuery(x))))return true;
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
 if(hasCampusIntentSignal(q)||BROAD_CONCEPTS.has(n)||STANDALONE_CAMPUS_TERMS.has(n))return true;
 if(SEARCH_CONCEPTS.some(c=>(c.aliases||[]).some(a=>normalizeQuery(a)===n)))return true;
 return SEARCH_INDEX.some(e=>['academic_directory','academic_directory_general','organization_registry'].includes(e.service.kind)&&(e.service.route_keywords||[]).some(k=>normalizeQuery(k)===n));
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
 return out.sort((a,b)=>b.score-a.score);
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
 return out.sort((a,b)=>b.score-a.score);
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
 const dirIntent=['어디','찾','학과','전공','소속','스쿨','대학','학부','목록','안내'].some(x=>n.includes(normalizeQuery(x)));
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
 return out.sort((a,b)=>b.score-a.score);
}

function contrastTail(q){
 const raw=String(q||'').trim();
 const m=raw.match(/(?:말고|아니고|아니라|말고요|보다는|대신)\s*(.+)$/);
 if(!m)return null;
 const tail=(m[1]||'').trim();return normalizeQuery(tail).length>=2?tail:null;
}
const DOMAIN_ANCHOR={
 dorm:'기숙사',student:'학생',academic:'학사',finance:'등록금',admission:'입학',facilities:'시설',it:'학교 전산',international:'국제',career:'취업',research:'연구',research_ethics:'연구윤리',counseling:'상담',startup:'창업',development:'발전기금',library:'도서관',admin:'학교 행정',graduate_school:'대학원',education_innovation:'교육혁신'
};
function partHasExplicitConcept(part){
 if(detectConcept(part))return true;
 const n=normalizeQuery(part);
 if(!n)return false;
 const domainWords=['기숙사','생활관','학생증','신분증','장학','등록금','학비','휴학','복학','자퇴','재입학','전과','수강','성적','학점','졸업','입학','수시','정시','편입','시설','강의실','연구실','와이파이','향림통','lms','교환학생','유학생','취업','진로','연구','irb','창업','발전기금','도서관','대학원','rotc','학군단','학생군사교육단','증명서','재학증명','성적증명','졸업증명','인권','성희롱','성폭력','상담센터','보건진료실','메이커스페이스'];
 return domainWords.some(x=>n.includes(normalizeQuery(x)));
}

function splitMultiIntent(q){
 const raw=String(q||'').trim();if(!raw)return [];
 let marked=raw;

 marked=marked.replace(/[.!?。！？]+/g,'|||');
 marked=marked.replace(/[;,，；/＋+&＆|\n]+/g,'|||');
 marked=marked.replace(/\s*(?:그리고|또한|또|및)\s*/g,'|||');

 const nextConcept='(?:휴학|복학|자퇴|재입학|전과|학과|다전공|복수전공|부전공|학생증|신분증|국가장학금|장학금|등록금|학비|수강|성적|학점|졸업|기숙사|생활관|도서관|통학버스|주차|ROTC|rotc|학군단|교환학생|취업|진로|상담|인권|보건|시설|누수|에어컨|와이파이|향림통|LMS|lms|증명서|재학증명서|대학원|창업|연구|IRB|irb|사업단)';
 marked=marked.replace(new RegExp('([가-힣A-Za-z0-9]{2,}?)(?:이랑|랑|과|와)\\s+(?='+nextConcept+')','gi'),'$1|||');

 const sentenceEnd=new RegExp('(싶어요|싶습니다|싶어|궁금해요|궁금합니다|궁금해|필요해요|필요합니다|필요해|알고 싶어요|알고싶어요|알고 싶어|알고싶어)\\s+(?='+nextConcept+')','g');
 marked=marked.replace(sentenceEnd,'$1|||');

 marked=marked.replace(/\s*첨삭하고\s+/g,' 첨삭|||');
 marked=marked.replace(/(발전기금|발전지원금)\s*내고\s+/g,'$1 내고|||');
 marked=marked.replace(/\s*(확인|변경|재발급|발급|신청|예약|납부|결제|취소|조회|정정|등록|제출|신고|문의)(?:도)?하고\s+(?!싶(?:어|어요|다|습니다|고))/g,' $1|||');
 marked=marked.replace(new RegExp('('+nextConcept+')(?:도)?하고\\s+(?='+nextConcept+')','gi'),'$1|||');
 marked=marked.replace(/([가-힣A-Za-z0-9]+(?:했(?:었)?고|했고|됐고|있고|없고|렸고|냈고|안되고|되고|싶고|궁금하고|필요하고))\s+/g,'$1|||');
 marked=marked.replace(/\s+(?:받고|받았고)\s+(?!싶(?:어|어요|다|습니다))/g,'|||');
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
 return uniq.slice(0,5);
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
 return out.sort((a,b)=>b.score-a.score);
}

function explicitAcademicDirectoryMatches(q){
 const n=normalizeQuery(q);if(!n)return [];
 const explicit=['어디','위치','소속','학과찾','전공찾','학과어디','전공어디','알려','안내','목록'].some(x=>n.includes(normalizeQuery(x)));
 if(!explicit)return [];
 return academicDirectoryIntentMatches(q);
}

function searchCampusServices(query,metaGuard=false){
 const q=String(query||'').trim().slice(0,300),n=normalizeQuery(q),qLoose=loosenQuery(q),nLoose=normalizeQuery(qLoose);if(!n)return {status:'unknown',items:[]};
 const fillerOnly=new Set(['싶어','싶어요','하고싶어','하고싶어요','할래','할래요','해줘','해주세요','알려줘','알려주세요','문의드려요','문의드립니다']);if(fillerOnly.has(n))return {status:'unknown',items:[],reason:'filler'};
 if(isObviousNonCampus(q))return {status:'unknown',items:[],reason:'out_of_scope'};
 const genericInstitutionQueries=new Set(['순천대','순천대학교','국립순천대학교','순천대전화번호','순천대학교전화번호','국립순천대학교전화번호','학교전화번호']);
 if(genericInstitutionQueries.has(n))return {status:'unknown',items:[],reason:'no_signal'};
 const hasMultipleIntents=!metaGuard&&splitMultiIntent(q).length>=2;

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
   const tail=contrastTail(q);
   if(tail&&normalizeQuery(tail)!==n){
     const tr=searchCampusServices(tail,true);if(tr.status==='answer'&&(tr.items||[]).length)return {...tr,reason:'contrast'};
     const marker=q.match(/^(.*?)(?:말고|아니고|아니라|말고요|보다는|대신)\s*(.+)$/);
     if(marker){const words=marker[1].trim().split(/\s+/).filter(Boolean);if(words.length>1){words.pop();const augmented=(words.join(' ')+' '+tail).trim();const ar=searchCampusServices(augmented,true);if(ar.status==='answer'&&(ar.items||[]).length)return {...ar,reason:'contrast_context'};}}
   }
   const parts=splitMultiIntent(q);
   if(parts.length>=2){
     const collected=[];const seen=new Set();
     let sharedDomain=null;
     for(const part of parts){
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
       const it=pr.items[0];
       if(!sharedDomain)sharedDomain=it.service.domain;
       if(!seen.has(it.service.id)){seen.add(it.service.id);collected.push(it);}
     }
     if(collected.length>=2)return {status:'answer',items:collected.slice(0,7),reason:'multi_intent',broad:true};
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
 const earlyConcept=detectConcept(q);const typoAll=typoCandidates(q);const typoDomains=new Set(typoAll.map(x=>x.service.domain));if(typoAll.length&&typoAll.length<=3&&typoDomains.size===1)return {status:'answer',items:typoAll.slice(0,7),reason:'typo_strong'};const typo=typoAll.filter(x=>!earlyConcept||x.service.domain===earlyConcept.domain);if(typo.length&&typo.length<=4)return {status:'answer',items:typo.slice(0,7),reason:'typo'};const typoPhraseAll=typoPhraseCandidates(q);const typoPhraseDomains=new Set(typoPhraseAll.map(x=>x.service.domain));const conceptLooksTypo=earlyConcept&&normalizeQuery(earlyConcept.alias)!==n&&editDistanceOne(n,normalizeQuery(earlyConcept.alias));if(typoPhraseAll.length&&typoPhraseAll.length<=3&&typoPhraseDomains.size===1&&(!earlyConcept||(conceptLooksTypo&&typoPhraseAll.every(x=>x.service.domain===earlyConcept.domain))))return {status:'answer',items:typoPhraseAll.slice(0,7),reason:'typo_phrase'};
 const directoryMatch=academicDirectoryMatches(q);if(directoryMatch.length)return {status:'answer',items:directoryMatch.slice(0,7),reason:'academic_directory'};
 if(splitQuery(q).length===1&&!isSafeStandaloneQuery(q))return {status:'unknown',items:[],reason:'no_signal'};
 let strongRoute=strongRouteKeywordMatches(q);if(!strongRoute.length&&qLoose&&qLoose!==q)strongRoute=strongRouteKeywordMatches(qLoose);if(strongRoute.length)return {status:'answer',items:strongRoute.slice(0,7),reason:'route_keyword'};
 if((n.includes('자퇴')||n.includes('제적'))&&(n.includes('다시')||n.includes('복귀')||n.includes('재입학'))){const s=services.find(x=>x.id==='readmission');if(s)return {status:'answer',items:[{service:s,score:5100}],reason:'context'};}
 const cid=compositeRouteId(q);if(cid){const s=services.find(x=>x.id===cid);if(s)return {status:'answer',items:[{service:s,score:5000}],reason:'composite'};}
 if(n.includes('버스')&&(n.includes('대절')||n.includes('대졀')||n.includes('행사')||n.includes('견학')||n.includes('빌리'))){const s=services.find(x=>x.id==='school_vehicle');if(s)return {status:'answer',items:[{service:s,score:4900}],reason:'context'};}
 if((n.includes('통학')||n.includes('셔틀')||n==='버스')&&(n.includes('예약')||n.includes('qr')||n.includes('유니버스'))){const s=services.find(x=>x.id==='shuttle_reserve');if(s)return {status:'answer',items:[{service:s,score:4900}],reason:'context'};}
 const concept=detectConcept(q);
 if(!concept&&!hasCampusIntentSignal(q)&&splitQuery(q).length>=3)return {status:'unknown',items:[],reason:'no_signal'};
 let ranked=SEARCH_INDEX.map(e=>({service:e.service,score:Math.max(scoreSearchEntry(e,q,concept),qLoose&&qLoose!==q?scoreSearchEntry(e,qLoose,concept):0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
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

function displayMethod(service){
  const m = service.method || {};
  let detail = [];
  if(m.online === true) detail.push('온라인 가능');
  if(m.visit === true) detail.push('방문 가능/필요');
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
  if($('#searchBtn')) $('#searchBtn').textContent = on ? '찾는 중…' : '어디가?';
}

async function classifyUncertainQuery(query){
  if(location.protocol === 'file:') return {mode:'unavailable',reason:'local_file'};
  if(pendingClassifierController) pendingClassifierController.abort();
  const controller=new AbortController();
  pendingClassifierController=controller;
  const timer=setTimeout(()=>controller.abort(),4200);
  try{
    const res = await fetch('/api/classify', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query}),
      signal:controller.signal
    });
    if(!res.ok) return {mode:'unavailable'};
    return await res.json();
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
  if(!q) return;
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

function renderMultiSummary(items, query){
  const host=$('#resultSummary');
  if(!host)return;
  host.innerHTML='';
  const selected=items.slice(0,5).map(x=>x.service);
  const depts=uniqueValues(selected.map(s=>s.department?.name));
  const docs=uniqueValues(selected.flatMap(s=>s.documents||[]));
  const section=document.createElement('section');section.className='multi-summary';
  const top=document.createElement('div');top.className='multi-summary-top';
  const title=document.createElement('div');
  const kicker=document.createElement('span');kicker.className='summary-kicker';kicker.textContent='한 번에 확인하기';
  const h=document.createElement('h3');h.textContent=`${selected.length}개 업무를 한 번에 정리했어요.`;
  title.append(kicker,h);
  top.append(title);section.appendChild(top);
  const grid=document.createElement('div');grid.className='multi-summary-grid';
  const groups=[
    ['확인할 업무',selected.map(s=>s.title)],
    ['담당부서',depts],
    ['준비할 것',docs.length?docs:['각 업무 카드에서 준비사항을 확인하세요.']]
  ];
  groups.forEach(([label,vals])=>{
    const box=document.createElement('div');box.className='summary-group';
    const l=document.createElement('span');l.className='summary-label';l.textContent=label;box.appendChild(l);
    const wrap=document.createElement('div');wrap.className='summary-chips';
    vals.slice(0,6).forEach(v=>{const chip=document.createElement('span');chip.textContent=v;wrap.appendChild(chip);});
    box.appendChild(wrap);grid.appendChild(box);
  });
  section.appendChild(grid);host.appendChild(section);
}

function clearResultSummary(){const host=$('#resultSummary');if(host)host.innerHTML='';}

const STATIC_CLARIFICATION_TARGETS = {
  leave_general:{
    '개인사정':'leave_general',
    '군입대':'leave_military',
    '질병':'leave_illness',
    '임신·출산·육아':'leave_parental',
    '창업':'leave_startup',
    '대학 추천 국외수학':'leave_overseas'
  },
  withdrawal:{
    '휴학':'leave_general',
    '자퇴':'withdrawal'
  }
};

function replaceClarifiedService(currentService, option){
  const targetId=STATIC_CLARIFICATION_TARGETS[currentService?.id]?.[option];
  if(!targetId) return false;
  const targetService=services.find(s=>s.id===targetId);
  if(!targetService) return false;

  const grid=$('#resultGrid');
  const cards=[...grid.querySelectorAll('.service-card')];
  const oldCard=cards.find(card=>card.dataset.serviceId===currentService.id) || cards[0];
  const newNode=createServiceCard({service:targetService,score:999},true);

  if(oldCard) oldCard.replaceWith(newNode);
  else grid.appendChild(newNode);

  const box=$('#clarificationBox');
  box.classList.add('hidden');
  box.innerHTML='';

  if(grid.classList.contains('multi-result-grid')){
    const items=[...grid.querySelectorAll('.service-card')].map(card=>services.find(s=>s.id===card.dataset.serviceId)).filter(Boolean).map(service=>({service,score:999}));
    renderMultiSummary(items,activeResultQuery);
  }
  if(currentService.id==='withdrawal' && targetId==='leave_general'){
    renderClarificationPrompt(targetService);
  }
  return true;
}

function handleClarificationChoice(service, option){
  if(replaceClarifiedService(service,option)) return;
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

function createServiceCard(item, isPrimary=false){
  const {service} = item;
  const node = $('#serviceCardTemplate').content.cloneNode(true);
  const article = node.querySelector('.service-card');
  if(article) article.dataset.serviceId = service.id;

  node.querySelector('.category-pill').textContent = service.category;
  node.querySelector('.service-title').textContent = service.title;
  node.querySelector('.service-description').textContent = service.description || '공식 안내를 확인해주세요.';

  if(service.time_sensitive) node.querySelector('.time-warning').classList.remove('hidden');

  const steps = node.querySelector('.steps-list');
  const list = (service.steps && service.steps.length) ? service.steps : ['공식 안내 페이지에서 최신 절차를 확인합니다.'];
  list.forEach((step,i)=>{
    const li = document.createElement('li');
    const text=document.createElement('span');text.className='step-text';text.textContent=step;
    li.appendChild(text);
    const key=`${service.id}:step:${i}`;
    li.appendChild(makeCheckButton(key,step,'step'));
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

  const docs = service.documents || [];
  if(docs.length){
    const sec = node.querySelector('.documents-section');
    sec.classList.remove('hidden');
    const wrap = sec.querySelector('.document-chips');
    docs.forEach((d,i)=>{
      const holder=document.createElement('span');holder.className='document-check-wrap';
      const text=document.createElement('span');text.className='document-chip';text.textContent=d;
      const key=`${service.id}:doc:${i}`;
      holder.appendChild(makeCheckButton(key,d,'document'));
      holder.appendChild(text);holder.classList.toggle('done',isChecked(key));wrap.appendChild(holder);
    });
  }

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
    latest.target = '_blank'; latest.rel = 'noopener'; latest.textContent = '최신 공식안내 확인';
    actions.appendChild(latest);
  }

  (service.action_links || []).slice(0,3).forEach((l,i)=>{
    const a = document.createElement('a');
    a.className = i===0 ? 'action-link' : 'action-link secondary';
    a.href = safeUrl(l.url); a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.label;
    actions.appendChild(a);
  });
  if(!actions.children.length)actions.classList.add('hidden');

  const sources = node.querySelector('.source-list');
  (service.sources || []).forEach((s,i)=>{
    const a = document.createElement('a');
    a.href = safeUrl(s.url); a.target = '_blank'; a.rel = 'noopener';
    a.textContent = `공식 출처 ${i+1}`;
    a.title=s.url;
    sources.appendChild(a);
  });

  return node;
}

function renderAlternatives(items){
  const primary=items[0]?.service;
  const seen=new Set(primary?[primary.title]:[]);
  const candidates=[];
  for(const item of items.slice(1)){
    if(seen.has(item.service.title))continue;
    seen.add(item.service.title);candidates.push(item);
    if(candidates.length>=5)break;
  }
  if(!candidates.length)return null;
  const wrap = document.createElement('aside');wrap.className = 'alternatives';
  const h=document.createElement('h3');h.textContent='관련 업무';wrap.appendChild(h);
  const p=document.createElement('p');p.textContent='입력한 키워드와 가까운 다른 업무도 함께 확인해보세요.';wrap.appendChild(p);
  const list = document.createElement('div');list.className = 'alt-list';
  candidates.forEach(item=>{
    const b = document.createElement('button');b.className = 'alt-card';b.type = 'button';
    const small=document.createElement('small');small.textContent=item.service.category;
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

async function performSearch(options={}){
 const q=$('#searchInput').value.trim().slice(0,300);if(!q){$('#searchInput').focus();return;}
 cancelPendingClassifier();const requestId=searchSequence;
 $('#browseState').classList.add('hidden');$('#searchState').classList.remove('hidden');$('#clarificationBox').classList.add('hidden');clearResultSummary();setLoading(false);
 const t0=performance.now();let route;try{route=searchCampusServices(q);}catch(e){console.error(e);route={status:'unknown',items:[]};}const ms=performance.now()-t0;
 if(route.status==='answer'&&route.items?.length){if(options.saveRecent!==false)addRecentSearch(q);renderSearchResult(q,route,ms);return;}
 renderNoResult(q);
 if(route.reason==='out_of_scope'||route.reason==='no_signal'||location.protocol==='file:')return;
 if(!hasCampusIntentSignal(q)&&!detectConcept(q)&&!isSafeStandaloneQuery(q))return;
 classifyUncertainQuery(q).then(r=>{
   if(requestId!==searchSequence||$('#searchState').classList.contains('hidden')||$('#searchInput').value.trim()!==q)return;
   if(r?.mode!=='classifier'||r?.confidence!=='high'||r?.needs_clarification||!r.service_id)return;
   const s=services.find(x=>x.id===r.service_id);if(!s)return;
   const c=detectConcept(q);if(c&&s.domain!==c.domain)return;
   if(options.saveRecent!==false)addRecentSearch(q);
   renderSearchResult(q,{status:'answer',items:[{service:s,score:999}],reason:'classifier'},ms);
 }).catch(()=>{});
}
function renderSearchResult(q,route,ms=0){
 activeResultQuery=q;setLoading(false);clearResultSummary();
 const grid=$('#resultGrid');grid.innerHTML='';grid.style.gridTemplateColumns='';grid.classList.remove('multi-result-grid');
 const items=route.items||[];if(!items.length){renderNoResult(q);return;}
 if(route.reason==='multi_intent'){
   const full=items.slice(0,5);
   $('#resultHeading').textContent=`${full.length}개의 관련 업무를 함께 찾았어요.`;
   grid.classList.add('multi-result-grid');
   const clarifyTarget=full.find(item=>item.service?.clarification?.required)?.service || full[0].service;
   renderClarificationPrompt(clarifyTarget);renderMultiSummary(full,q);
   full.forEach(item=>grid.appendChild(createServiceCard(item,true)));
 }else{
   $('#resultHeading').textContent=route.broad
     ? `“${q}”와 관련된 업무를 모아봤어요.`
     : route.reason==='semantic'
       ? `“${q}”의 의미와 가까운 공식 업무를 찾았어요.`
       : `“${q}”에 가장 가까운 공식 업무예요.`;
   renderClarificationPrompt(items[0].service);
   grid.appendChild(createServiceCard(items[0],true));
   if(items.length>1){const alt=renderAlternatives(items);if(alt)grid.appendChild(alt);}
 }
 window.scrollTo({top:$('#searchState').offsetTop-35,behavior:'smooth'});
}
function renderNoResult(q){
 activeResultQuery='';setLoading(false);clearResultSummary();
 $('#resultHeading').textContent='가장 가까운 업무를 찾기 어려워요.';
 const grid=$('#resultGrid');grid.innerHTML='';grid.style.gridTemplateColumns='1fr';grid.classList.remove('multi-result-grid');
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
    b.textContent = cat === '전체' ? '전체 업무' : `${categoryIcons[cat]||'•'} ${cat}`;
    b.addEventListener('click',()=>{
      currentCategory=cat;
      renderCategories();
      renderPopular();
      if(cat!=='전체'){
        $('#browseState').classList.remove('hidden');
        $('#searchState').classList.add('hidden');
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
  const cats=currentCategory==='전체'?featuredCategories.filter(c=>counts[c]):[currentCategory];
  grid.innerHTML='';
  if(currentCategory !== '전체'){
    const subset = getBrowseServices().filter(s=>s.category===currentCategory).slice(0,24);
    subset.forEach(s=>grid.appendChild(makePopularCard(s.category,s.title,s.description||'',s.category,()=>showSpecific({service:s,score:100}))));
    return;
  }
  cats.forEach(cat=>grid.appendChild(makePopularCard(cat,cat,categoryCopy(cat),`${counts[cat]||0}개`,()=>{currentCategory=cat;renderCategories();renderPopular();})));
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
 currentCategory='전체';renderCategories();renderPopular();
 const shell=$('#searchShell');const top=shell?shell.getBoundingClientRect().top+window.scrollY-100:0;
 window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
 setTimeout(()=>$('#searchInput').focus(),220);
}

async function init(){
  try{
    const res = await fetch('./scnu_services.json');
    dataset = await res.json();
    services = dataset.services || [];
    buildSearchIndex();
    renderCategories();
    renderPopular();
    setQuickBrowseExpanded(true);
    renderRecentSearches();
  }catch(e){
    console.error('데이터 초기화 오류',e);
  }
}

$('#searchBtn').addEventListener('click',performSearch);
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter') performSearch();});
$$('.example-chip').forEach(btn=>{
  btn.addEventListener('click',()=>{
    $('#searchInput').value=btn.textContent.trim();
    performSearch();
  });
});

const resetSearchBtn=$('#resetSearchBtn');if(resetSearchBtn)resetSearchBtn.addEventListener('click',resetSearch);
const quickToggle=$('#quickToggle');if(quickToggle)quickToggle.addEventListener('click',toggleQuickBrowse);

init();
