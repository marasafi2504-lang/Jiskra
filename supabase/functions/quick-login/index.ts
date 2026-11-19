// Osobní přihlašovací odkaz (pro lidi, kterým dělá potíže e-mail/heslo).
// GET /quick-login?k=<tajný klíč> → přihlásí příslušný účet a otevře aplikaci.
// Klíče jsou v private.quick_login; odkaz lze kdykoli zrušit (revoked = true).
import { createClient } from "npm:@supabase/supabase-js@2";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP = "https://plaminek.marasafi2504.workers.dev/";

Deno.serve(async (req) => {
  const k = new URL(req.url).searchParams.get("k") ?? "";
  if (!/^[a-f0-9]{32,64}$/.test(k)) return Response.redirect(APP, 302);
  const db = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: email } = await db.rpc("quick_login_email", { tok: k });
  if (!email) return Response.redirect(`${APP}#/?login_error=${encodeURIComponent("Tento odkaz už neplatí.")}`, 302);
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: `${APP}?vitej=1` } });
  if (error || !data?.properties?.action_link) return Response.redirect(`${APP}#/?login_error=${encodeURIComponent("Přihlášení se nepodařilo, zkus to znovu.")}`, 302);
  return Response.redirect(data.properties.action_link, 302);
});
