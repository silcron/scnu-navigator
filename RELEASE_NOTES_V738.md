# 어디가? v7.3.38 — Fresh Natural-Language Generalization

## Why this release exists
After v7.3.37 passed the existing final release gate, a brand-new set of colloquial student queries exposed gaps that the prior corpus did not cover. v7.3.38 fixes the structural cause rather than memorizing those sentences.

## Structural change
- Adds a deterministic high-confidence `object + action/state` natural-language layer.
- Supports multiple independent object/action pairs in one sentence while preserving explicit keyword LOCKs.
- Requires sentence-like Korean morphology before this layer can activate, so whitespace keyword enumerations remain on the mature keyword engine.
- Specificity ordering fixes include:
  - military return / pre-discharge return / military leave
  - illness leave vs general leave
  - dorm counseling vs physical facility faults vs move-out
  - sports-facility use requests
  - resume + interview clinic separation without false AI-job expansion
  - transcript vs enrollment certificate
  - major/department transfer vs ordinary course changes
  - PC/device support vs network support
  - startup club/program participation specificity

## Fresh local release gate
- Official service titles: 413/413 correct department
- Registered situations: 1,942 checked; 5 known non-blocking ambiguity/specificity cases preserved
- Strong literals: 1,178/1,178 correct department
- Facets: 2,478/2,478 same organization
- 2–5 intent aggressive corpus: 20,000/20,000 correct department; 10 raw-ID differences are same-department canonical/route twins
- Brand-new natural-language regressions: 52/52 PASS
- Specificity/anti-overreach guards: 22/22 correct department

## Unchanged
- 413-service catalog/data
- SearchCore
- Vector model/vectors/thresholds
- Gemini API
- 3.5s Vector cold-start fallback
- Max 5 results
