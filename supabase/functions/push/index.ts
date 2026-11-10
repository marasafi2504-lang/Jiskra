// Jiskra – odesílání push notifikací (Supabase Edge Function)
// Volá ji databáze (trigger notify_push) při nové zprávě nebo shodě.
// Klíče VAPID a tajný klíč jsou v tabulce private.settings, ne v kódu.
import postgres from "npm:postgres@3.4.5";
import webpush from "npm:web-push@3.6.7";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

let cfg: Record<string, string> | null = null;
async function settings() {
  if (cfg) return cfg;
  const rows = await sql`select key, value from private.settings`;
  cfg = Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
  webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);
  return cfg;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const s = await settings();
  if (req.headers.get("x-push-secret") !== s.push_secret) return new Response("Forbidden", { status: 403 });

  const { to, title, body, url, tag } = await req.json().catch(() => ({}));
  if (!to || !title) return new Response("Bad request", { status: 400 });

  const subs = await sql`select endpoint, p256dh, auth from public.push_subscriptions where user_id = ${to}`;
  const payload = JSON.stringify({ title, body: body ?? "", url: url ?? "./", tag: tag ?? "jiskra" });

  let sent = 0;
  await Promise.all(subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 * 60 * 24 },
      );
      sent++;
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await sql`delete from public.push_subscriptions where endpoint = ${sub.endpoint}`;
      } else {
        console.error("push error", code, (err as Error).message);
      }
    }
  }));

  return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
});
