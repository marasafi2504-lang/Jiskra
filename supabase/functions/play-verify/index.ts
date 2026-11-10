// Jiskra – ověření nákupu z Google Play (Supabase Edge Function)
// Aplikace pošle purchaseToken, funkce ho ověří u Googlu, potvrdí (acknowledge)
// a zapíše předplatné do tabulky public.subscriptions.
//
// Tajné hodnoty (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT  = celý obsah JSON klíče servisního účtu (Google Cloud),
//                             který má v Play Console oprávnění „Zobrazit finanční údaje“ a „Spravovat objednávky“
//   ANDROID_PACKAGE         = název balíčku aplikace z PWABuilderu, např. cz.jiskra.app

import { createClient } from "npm:@supabase/supabase-js@2";
import { importPKCS8, SignJWT } from "npm:jose@5";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function googleToken(): Promise<string> {
  const sa = JSON.parse(Deno.env.get("GOOGLE_SERVICE_ACCOUNT")!);
  const key = await importPKCS8(sa.private_key, "RS256");
  const jwt = await new SignJWT({ scope: "https://www.googleapis.com/auth/androidpublisher" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!res.ok) throw new Error("Google token: " + (await res.text()));
  return (await res.json()).access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Kdo volá? (přihlášený uživatel aplikace)
  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "not_signed_in" }, 401);

  const { sku, purchaseToken } = await req.json().catch(() => ({}));
  const m = /^jiskra_(plus|gold|platinum)_(1|6|12)m$/.exec(String(sku ?? ""));
  if (!m || !purchaseToken) return json({ error: "bad_request" }, 400);
  const plan = m[1];

  try {
    const pkg = Deno.env.get("ANDROID_PACKAGE")!;
    const token = await googleToken();
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases`;

    const res = await fetch(`${base}/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return json({ error: "google_rejected", detail: await res.text() }, 400);
    const sub = await res.json();

    const line = (sub.lineItems ?? []).find((l: any) => l.productId === sku) ?? sub.lineItems?.[0];
    const expiry = line?.expiryTime;
    const okStates = ["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD", "SUBSCRIPTION_STATE_CANCELED"];
    if (!expiry || !okStates.includes(sub.subscriptionState) || new Date(expiry) < new Date()) {
      return json({ error: "not_active" }, 400);
    }

    // Jeden nákup = jeden účet (ochrana proti sdílení tokenu)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: other } = await admin.from("subscriptions").select("user_id").eq("stripe_sub", "play:" + purchaseToken.slice(0, 200)).maybeSingle();
    if (other && other.user_id !== user.id) return json({ error: "token_used" }, 409);

    const { error } = await admin.from("subscriptions").upsert({
      user_id: user.id,
      plan,
      valid_until: expiry,
      stripe_sub: "play:" + purchaseToken.slice(0, 200),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;

    // Potvrzení nákupu (jinak ho Google do 3 dnů vrátí)
    if (sub.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED") {
      await fetch(`${base}/subscriptions/${sku}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      });
    }

    return json({ ok: true, plan, valid_until: expiry });
  } catch (err) {
    console.error(err);
    return json({ error: "server_error" }, 500);
  }
});
