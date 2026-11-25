// 접속 IP 허용 목록 (docs/game/AI_REDESIGN_DECISIONS.md 7.3).
// 환경 변수 ALLOWED_IPS: 쉼표로 구분한 IP 또는 IPv4 CIDR (예: "203.0.113.7, 198.51.100.0/24").
// 비어 있으면 제한하지 않는다. 실제 IP 값은 저장소에 쓰지 않고 Cloudflare 변수나 로컬 .dev.vars 에만 둔다.
// workers.dev 주소에서는 방화벽 규칙을 쓸 수 없어서 Worker 입구에서 비교한다.

import { say } from "../game/data/thoughts.mjs";

export function parseAllowList(text) {
  return String(text ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

/** ip 가 목록의 IP(정확히 같음) 또는 IPv4 CIDR 범위에 드는지 */
export function ipAllowed(ip, list) {
  if (!ip) return false;
  const addr = ip.trim().toLowerCase();
  return list.some((entry) => {
    const rule = entry.toLowerCase();
    if (!rule.includes("/")) return rule === addr;
    const [base, bitsText] = rule.split("/");
    const bits = Number(bitsText);
    const a = ipv4ToInt(addr);
    const b = ipv4ToInt(base);
    if (a == null || b == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    // 앞쪽 bits 비트가 같으면 같은 범위 (정수 나눗셈으로 비교해 32비트 부호 문제를 피한다)
    const size = 2 ** (32 - bits);
    return Math.floor(a / size) === Math.floor(b / size);
  });
}

/**
 * 허용되지 않은 접속이면 403 응답을, 허용이면 null 을 돌려준다.
 * API 는 JSON { error }, 화면은 짧은 안내 페이지.
 */
export function guardRequest(request, env) {
  const list = parseAllowList(env?.ALLOWED_IPS);
  if (!list.length) return null;
  if (ipAllowed(request.headers.get("cf-connecting-ip"), list)) return null;

  const message = say("ipBlocked");
  const headers = { "Cache-Control": "no-store" };
  if (new URL(request.url).pathname.startsWith("/api/")) {
    return Response.json({ error: message }, { status: 403, headers });
  }
  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>방과후 탐정단</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#1b1a2e;color:#f4ecd8;font:18px/1.6 sans-serif;padding:16px"><p>${message}</p></body></html>`;
  return new Response(html, { status: 403, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
}
