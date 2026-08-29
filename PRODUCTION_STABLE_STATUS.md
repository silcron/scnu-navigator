# v7.3.34 production stable — pre-Vector rollback point

Production smoke performed in the user's browser on 2026-08-27.

- origin: https://scnu-navigator.vercel.app
- deployed app.js SHA256: bdf05cdd516ce1e229279b53cf3e800173fcd2a8edf1c60cef62db626315b276
- static five-file hash match: PASS
- /api/classify health: 200 / configured=true / gemini-3.7-flash
- FULL: novel ROTC wording -> rotc_application: PASS
- missing_only: locked student_id_reissue + Gemini adds rotc_application: PASS
- browser smoke overall: true

This folder is the rollback point before Vector semantic fallback is introduced.
