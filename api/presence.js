// Vercel serverless function: GET /api/presence?id=<sessionId>
//
// Counts distinct session ids that have checked in within the last 75s.
// Each browser tab pings this every 30s (see script.js) with a random id
// stored in sessionStorage; hidden tabs stop pinging and age out on their
// own. Uses Upstash Redis (REST API, free tier) when configured; falls back
// to an in-memory count for local `vercel dev` testing when no Upstash
// credentials are set (resets on cold start, not consistent across
// instances -- fine for local testing, not for production).

const WINDOW_MS = 75_000;
const KEY = "presence";

let memoryStore = null; // Map<sessionId, timestamp>

async function upstashPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
  return res.json();
}

async function countWithUpstash(id, now) {
  const cutoff = now - WINDOW_MS;
  const results = await upstashPipeline([
    ["ZADD", KEY, String(now), id],
    ["ZREMRANGEBYSCORE", KEY, "-inf", String(cutoff)],
    ["ZCARD", KEY],
  ]);
  return Number(results?.[2]?.result ?? 0);
}

function countInMemory(id, now) {
  if (!memoryStore) memoryStore = new Map();
  memoryStore.set(id, now);
  const cutoff = now - WINDOW_MS;
  for (const [sid, ts] of memoryStore) {
    if (ts < cutoff) memoryStore.delete(sid);
  }
  return memoryStore.size;
}

module.exports = async function handler(req, res) {
  const id = typeof req.query.id === "string" ? req.query.id : null;
  if (!id) {
    res.status(400).json({ error: "missing id" });
    return;
  }

  const now = Date.now();
  const hasUpstash = Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );

  try {
    const count = hasUpstash ? await countWithUpstash(id, now) : countInMemory(id, now);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ count });
  } catch (err) {
    res.status(500).json({ error: "presence store unavailable" });
  }
};
