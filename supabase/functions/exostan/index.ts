import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
let PAGE_CACHE: { html: string; at: number } | null = null;
async function getPage(): Promise<string> {
  if (PAGE_CACHE && Date.now() - PAGE_CACHE.at < 60_000) return PAGE_CACHE.html;
  const { data, error } = await supa().from("exostan_assets").select("seq, content").eq("name", "page").order("seq", { ascending: true });
  if (error) throw error;
  const html = (data ?? []).map((r) => r.content as string).join("");
  PAGE_CACHE = { html, at: Date.now() };
  return html;
}
async function pageHash(html: string) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(html)); return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join(""); }

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ACCESS_CODE = Deno.env.get("EXOSTAN_ACCESS_CODE") ?? "";
const MODELS: Record<string, string> = {
  quick: Deno.env.get("EXOSTAN_MODEL_QUICK") ?? "claude-haiku-4-5-20251001",
  default: Deno.env.get("EXOSTAN_MODEL_DEFAULT") ?? "claude-sonnet-5-5",
  complex: Deno.env.get("EXOSTAN_MODEL_COMPLEX") ?? "claude-opus-5-5",
};
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-exostan-code, authorization",
  "access-control-allow-methods": "GET, POST, PATCH, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });

function supa() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  // path after /exostan
  const sub = url.pathname.replace(/^\/(functions\/v1\/)?exostan/, "").replace(/\/+$/, "") || "/";

  if (req.method === "GET" && sub === "/") {
    try { return new Response(await getPage(), { headers: { ...CORS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }); }
    catch (e) { return new Response("Exostan page not available: " + ((e as Error).message || e), { status: 500, headers: CORS }); }
  }
  if (req.method === "GET" && sub === "/health") {
    try { const html = await getPage(); return json({ ok: true, ai: !!ANTHROPIC_KEY, access_code_set: !!ACCESS_CODE, models: MODELS, page_sha256: await pageHash(html), page_bytes: new TextEncoder().encode(html).length }); }
    catch (e) { return json({ ok: false, error: (e as Error).message || String(e) }, 500); }
  }

  // access gate for everything else
  if (ACCESS_CODE && req.headers.get("x-exostan-code") !== ACCESS_CODE) return json({ error: "Access code required" }, 401);

  try {
    if (req.method === "POST" && sub === "/ai") {
      if (!ANTHROPIC_KEY) return json({ error: "ANTHROPIC_API_KEY is not set on the server. Add it in Supabase, Edge Functions, Secrets." }, 500);
      const body = await req.json();
      const prompt = String(body.prompt ?? "");
      const images: { media_type: string; data: string }[] = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
      const tier = MODELS[String(body.tier)] ? String(body.tier) : "default";
      const content: unknown[] = images.map((im) => ({ type: "image", source: { type: "base64", media_type: im.media_type || "image/jpeg", data: im.data } }));
      content.push({ type: "text", text: prompt + (body.json ? "\nRespond with the JSON object only, no markdown fences." : "") });
      const messages: unknown[] = [{ role: "user", content }];
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: MODELS[tier], max_tokens: 3000, temperature: 0, messages }),
      });
      const out = await r.json();
      if (!r.ok) return json({ error: out?.error?.message || "Anthropic API error", detail: out }, r.status === 429 ? 429 : 502);
      let text = (out.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
      return json({ text, truncated: out.stop_reason === "max_tokens", model: out.model, usage: out.usage });
    }

    if (sub === "/cases" && req.method === "GET") {
      const { data, error } = await supa().from("exostan_cases").select("code, body, outcome, outcome_at, created_at").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return json((data ?? []).map((r) => ({ ...(r.body as Record<string, unknown>), code: r.code, outcome: r.outcome, outcomeAt: r.outcome_at })));
    }
    if (sub === "/cases" && req.method === "POST") {
      const { code, body } = await req.json();
      if (!code || !body) return json({ error: "code and body required" }, 400);
      const { error } = await supa().from("exostan_cases").upsert({ code, body }, { onConflict: "code" });
      if (error) throw error;
      return json({ ok: true, code });
    }
    const m = sub.match(/^\/cases\/([^/]+)$/);
    if (m && req.method === "PATCH") {
      const code = decodeURIComponent(m[1]);
      const patch = await req.json();
      const upd: Record<string, unknown> = {};
      if (patch.outcome !== undefined) { upd.outcome = patch.outcome; upd.outcome_at = new Date().toISOString(); }
      const { error } = await supa().from("exostan_cases").update(upd).eq("code", code);
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
});
