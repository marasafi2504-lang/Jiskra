// Přihlášení přes Seznam (OAuth 2.0) pro Plamínek.
// 1) GET /seznam-auth?redirect=<adresa aplikace>  → přesměruje na Seznam
// 2) GET /seznam-auth/callback?code&state         → ověří uživatele u Seznamu,
//    založí/najde účet v Supabase a přihlásí ho jednorázovým odkazem.
// Tajemství (nastavují se v Supabase → Edge Functions → Secrets):
//   SEZNAM_CLIENT_ID, SEZNAM_CLIENT_SECRET
import { createClient } from "npm:@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("SEZNAM_CLIENT_ID") || "4c861b343f8c79f3bdb571798dce078e8ac7dc11e349a308";
const CLIENT_SECRET = Deno.env.get("SEZNAM_CLIENT_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SZN = "https://login.seznam.cz/api/v1";
const ALLOWED = [/^https:\/\/plaminek\.marasafi2504\.workers\.dev(\/|$)/, /^https:\/\/([a-z0-9-]+\.)?plaminek\.cz(\/|$)/, /^http:\/\/localhost(:\d+)?(\/|$)/];
const DEFAULT_APP = "https://plaminek.marasafi2504.workers.dev/";
const CALLBACK = `${SB_URL}/functions/v1/seznam-auth/callback`;

const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(data: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode("plaminek-state:" + CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}
const safeApp = (u: string | null) => (u && ALLOWED.some((r) => r.test(u)) ? u : DEFAULT_APP);
const back = (app: string, err: string) => Response.redirect(`${app}#/?login_error=${encodeURIComponent(err)}`, 302);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (!CLIENT_ID || !CLIENT_SECRET) return new Response("Přihlášení přes Seznam není nastavené (chybí SEZNAM_CLIENT_SECRET).", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  // 1) start
  if (!url.pathname.endsWith("/callback")) {
    const app = safeApp(url.searchParams.get("redirect"));
    const payload = b64u(enc.encode(JSON.stringify({ a: app, e: Date.now() + 10 * 60_000, n: crypto.randomUUID() })));
    const state = `${payload}.${await hmac(payload)}`;
    const q = new URLSearchParams({ client_id: CLIENT_ID, scope: "identity,adulthood,avatar", response_type: "code", redirect_uri: CALLBACK, state });
    return Response.redirect(`${SZN}/oauth/auth?${q}`, 302);
  }

  // 2) callback
  const state = url.searchParams.get("state") ?? "";
  const [payload, sig] = state.split(".");
  let app = DEFAULT_APP;
  try {
    if (!payload || !sig || sig !== (await hmac(payload))) throw new Error("state");
    const s = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    if (Date.now() > s.e) throw new Error("expired");
    app = safeApp(s.a);
  } catch {
    return back(app, "Přihlášení vypršelo, zkus to znovu.");
  }
  const code = url.searchParams.get("code");
  if (!code) return back(app, "Přihlášení přes Seznam bylo zrušeno.");

  const tr = await fetch(`${SZN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "authorization_code", code, redirect_uri: CALLBACK, client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  });
  if (!tr.ok) return back(app, "Seznam přihlášení neověřil. Zkus to prosím znovu.");
  const tok = await tr.json();
  const ur = await fetch(`${SZN}/user`, { headers: { Authorization: `bearer ${tok.access_token}`, Accept: "application/json" } });
  if (!ur.ok) return back(app, "Nepodařilo se načíst účet Seznamu.");
  const u = await ur.json();
  const email = String(u.email ?? "").trim().toLowerCase();
  if (!email) return back(app, "Tvůj účet Seznamu nemá e-mail. Přihlas se prosím e-mailem.");

  const admin = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const meta = {
    full_name: [u.firstname, u.lastname].filter(Boolean).join(" ") || undefined,
    name: u.firstname || undefined,
    avatar_url: u.avatar_url || undefined,
    provider_seznam: true,
    seznam_id: tok.oauth_user_id ?? u.oauth_user_id,
    seznam_adult: u.adulthood === true,
  };
  const { error: ce } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
  if (ce && !/already|registered|exists/i.test(ce.message)) return back(app, "Účet se nepodařilo založit. Zkus to prosím znovu.");
  const { data: link, error: le } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: app } });
  if (le || !link?.properties?.action_link) return back(app, "Přihlášení se nepodařilo dokončit.");
  return Response.redirect(link.properties.action_link, 302);
});
