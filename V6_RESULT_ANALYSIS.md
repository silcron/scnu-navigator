# v6 calibration result analysis

Source: user-provided vector_calibration_audit_v6.json

## Summary
- total 136
- positives 113
- abstain 23
- positive top1 correct 111
- positive forbidden top1 2
- score>=0.92 & margin>=0.01: accepted 86, correct positive 85, wrong positive 0, wrong abstain 1
- score>=0.925 & margin>=0.01: accepted 76, correct 76, wrong positive 0, wrong abstain 0

## Remaining failures
1. v6_military_return_2
   - query: 전역하고 학교로 복귀해서 수업을 계속 듣고 싶어요
   - expected military_return, top1 return
   - military_return was excluded by phrase guard because return-context vocabulary did not include 학교로 복귀 / 수업 계속.
2. v6_military_return_3
   - query: 군 복무를 끝냈고 이제 다시 학교에 다닐 예정이에요
   - expected military_return, top1 rotc_application
   - military_return was excluded because military-completion vocabulary did not cover 군 복무를 끝... and required_any did not robustly cover this paraphrase.
3. v6_abstain_return
   - query: 다음 학기 학교에 다시 가야 할 것 같아요
   - abstain case was accepted as return at score 0.924158 / margin 0.024832.
   - cause: return candidate required only a broad return phrase and did not require prior leave/rest context.

## v7 structural fix
- military_return requires BOTH military-completion context and return-to-school context.
- military-completion vocabulary expanded with 끝/마치 variants.
- return requires BOTH prior leave/rest context and return-to-school intent.
- no embedding regeneration; static 2,393 prototype vectors are reused.
- provisional threshold remains 0.92 / 0.01 until v7 audit proves safety.
