# 어디가? v7.3.37 Final Search Integrity Release

Production URL: https://scnu-navigator.vercel.app/

## Scope
v7.3.37 is a narrow final integrity patch on top of v7.3.36. Vector/Gemini architecture, service data, thresholds and cold-start policy are unchanged.

### Search fixes
- Preserve complete official workflow titles when followed only by harmless inquiry/method facets (`문의`, `담당부서`, `위치`, `필요서류`, `방법`, `신청방법`).
- Preserve `생활관 상담`, `풋살구장 사용 신청`, `실내체육관(농구장) 사용 신청` ownership under those facets.
- Preserve specific startup workflow ownership such as `창업 비교과` / `창업동아리 문의` instead of broad route fragmentation.
- Prevent the whitespace keyword enumerator from splitting SearchCore-proven atomic relationship workflows (for example `일반휴학 → 병역휴학 변경`) into an extra broad slot in 2–5 intent searches.

## Fresh final verification on the v7.3.37 candidate
- Dataset: 413 services / 50 categories / 96 department labels; duplicate IDs 0; missing department/source 0; invalid source URL 0.
- Official service titles: 413/413 correct department ownership.
- Registered student situations: 1,942 tested. Five non-department matches were inspected: four intentionally ambiguous `컴퓨터 학과/전공` cases route to the general academic-directory resolver; one `창업동아리 문의` resolves to the more specific 창업교육센터 workflow.
- Title + facet matrix: 2,478 tested. Three string mismatches are only `도서관 학술정보과` vs `학술정보과` naming of the same library organization; no wrong organization was identified.
- Strong standalone literals: 1,178/1,178 correct department ownership.
- Fresh 2–5 intent aggressive corpus: 20,000 tested; 19,990 raw-ID exact, 10 canonical-twin substitutions within the same owning organization, 0 wrong-department cases.
- Targeted regressions PASS: 생활관 상담 facets, 풋살구장/실내체육관 신청 방법, 창업 비교과, 창업동아리 문의, ROTC application, multi-sentence 휴학+국가장학금.

## Architecture retained from v7.3.36
Exact/Keyword LOCK → unresolved clauses only → Vector (`min_score=0.92`, `min_margin=0.01`, `return` no-auto-accept) → Gemini fallback. Vector wait is capped at 3.5s; timeout does not cancel background model loading.
