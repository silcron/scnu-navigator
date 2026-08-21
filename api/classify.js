const dataset = require("../scnu_services.json");

const services = dataset.services || [];
const validIds = new Set(services.map((s) => s.id));
const serviceIndex = services.map((s) => {
  const situations = (s.situations || []).slice(0, 3).join(" / ");
  return `${s.id} | ${s.title} | ${s.category} | ${situations}`;
}).join("\n");

const buckets = new Map();
function allowRequest(req) {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 24;
  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const prev = buckets.get(ip) || { start: now, count: 0 };
  if (now - prev.start > windowMs) { prev.start = now; prev.count = 0; }
  prev.count += 1; buckets.set(ip, prev);
  if (buckets.size > 500) for (const [key, val] of buckets) if (now - val.start > windowMs * 2) buckets.delete(key);
  return prev.count <= limit;
}

function getOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text.trim();
  const chunks = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n").trim();
}

function sanitize(result) {
  if (!result || !validIds.has(result.service_id)) return null;
  return {
    mode: "classifier",
    service_id: result.service_id,
    confidence: ["high", "medium", "low"].includes(result.confidence) ? result.confidence : "low",
    needs_clarification: Boolean(result.needs_clarification),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const origin = req.headers?.origin;
  const host = req.headers?.host;
  if (origin && host) {
    try { if (new URL(origin).host !== host) return res.status(403).json({ error: "forbidden" }); }
    catch (_) { return res.status(403).json({ error: "forbidden" }); }
  }
  if (!allowRequest(req)) return res.status(429).json({ mode: "unavailable", reason: "rate_limited" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(200).json({ mode: "unavailable", reason: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const query = String(body?.query || "").trim().slice(0, 300);
  if (!query) return res.status(400).json({ error: "query is required" });

  const instructions = `국립순천대학교 학생 서비스 문의를 아래 목록의 service_id 하나로만 분류한다.\n` +
    `행정 사실을 생성하거나 추측하지 않는다. 관련성이 낮거나 여러 업무가 비슷하면 needs_clarification=true로 표시한다.\n` +
    `업무 목록:\n${serviceIndex}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3600);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
        instructions,
        input: query,
        reasoning: { effort: "none" },
        max_output_tokens: 90,
        text: {
          format: {
            type: "json_schema",
            name: "service_intent",
            strict: true,
            schema: {
              type: "object",
              properties: {
                service_id: { type: "string" },
                confidence: { type: "string", enum: ["high", "medium", "low"] },
                needs_clarification: { type: "boolean" }
              },
              required: ["service_id", "confidence", "needs_clarification"],
              additionalProperties: false
            }
          }
        }
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) return res.status(200).json({ mode: "unavailable", reason: "classification_failed" });
    let parsed = null;
    try { parsed = JSON.parse(getOutputText(payload)); } catch (_) { }
    const result = sanitize(parsed);
    return result ? res.status(200).json(result) : res.status(200).json({ mode: "unavailable", reason: "classification_invalid" });
  } catch (error) {
    return res.status(200).json({ mode: "unavailable", reason: error?.name === "AbortError" ? "classification_timeout" : "classification_error" });
  } finally { clearTimeout(timeout); }
};
