어디가? Vector audit build

- Main production app is unchanged from pre-Vector v7.3.34.
- app.js/index.html/search_core.js/scnu_services.json/styles.css/api/classify.js remain identical to the verified production rollback point.
- Added only development files:
  vector_build.html
  vector_semantic.js
  vector_service_texts.json
  vector_audit_cases.json
- Vector live search is NOT enabled in this package.
- Open /vector_build.html after deployment to locally generate service embeddings and run calibration audit.
