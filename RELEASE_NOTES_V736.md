# 어디가? v7.3.36 Cold-start Guard

Changes from deployed v7.3.35:
- Vector resolve gets a 3500ms first-response budget.
- If Vector is not ready within 3.5s, search immediately falls through to the existing Gemini path.
- The Vector promise is not cancelled, so model loading may finish in the background and later unresolved searches can use it.
- Existing deterministic keyword/exact search core is unchanged.
- Vector model, vectors, thresholds, and `return` no-auto-accept policy are unchanged.

Local checks:
- app.js syntax PASS
- vector_semantic.js syntax PASS
- fast Vector path PASS
- slow 5s Vector -> vector_timeout at ~3.5s PASS
- thrown Vector error -> Gemini fallback result PASS
- deterministic core function bodies identical to v7.3.34 stable

Production verification is still required after deployment.
