// Plamínek – AmorAI, asistent podpory (šetrná část zdarma)
// 1) pozdravy a řeči mimo aplikaci odbude (nic neposílá adminovi)
// 2) dotazy k aplikaci zodpoví ze znalostní báze (klíčová slova + embeddingy gte-small)
// 3) skutečné problémy předá adminovi do e-mailu s celým textem (přes support_send → trigger)
// 4) učí se: když admin odpoví na dotaz, uloží se dvojice otázka/odpověď do support_kb
// 5) triage: když hotová odpověď není, vrátí podklady pro chytrý model AmorAI (Cloudflare Workers AI)
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
let session: any = null;
const embed = async (t: string): Promise<number[]> => Array.from(await (session ||= new (globalThis as any).Supabase.ai.Session('gte-small')).run(t.slice(0, 1000), { mean_pool: true, normalize: true }) as number[]);
const cos = (a: number[], b: number[]) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const GREET = /^(ahoj+|cau+|caues|nazdar|zdar|dobry (den|vecer|rano)|zdravim|hej|hi|hello|hezky den|jak se mas|jak se mate|jak je|co delas|co ty|kdo jsi|diky|dekuji|dekuju|dik|ok|oki|okay|jo|jj|ne|ano|super|fajn|dobre|hm+|aha|cus|cs|lol|haha+|:\)|:-\))[\s!?.,]*$/;
const APP = ['aplikac', 'apk', 'plamin', 'profil', 'ucet', 'uctu', 'fotk', 'fotku', 'zprav', 'chat', 'shod', 'lajk', 'like', 'swip', 'predplat', 'plus', 'gold', 'platinum', 'platb', 'zaplat', 'penize', 'coin', 'boost', 'prihl', 'odhl', 'heslo', 'email', 'over', 'selfie', 'notifik', 'upozorn', 'filtr', 'smaz', 'blok', 'nahlas', 'seznam', 'rande', 'match', 'chyb', 'nefung', 'nejde', 'nemuz', 'zasek', 'pad', 'nacit', 'google', 'instagram', 'kontakt', 'objevuj', 'souzn', 'zajm', 'zalib', 'horoskop', 'znameni', 'ascend', 'hovor', 'video', 'poloh', 'vzdalen', 'nikoho', 'nikdo', 'vazn', 'kamarad', 'obtez', 'podvod', 'fake', 'reklam', 'refund', 'vrat', 'strh', 'amor', 'schuzk', 'prvni zprav', 'oslovit', 'napsat'];
const PROBLEM = ['nefung', 'nejde', 'chyb', 'pad', 'zasek', 'nemuz', 'nenac', 'nenaj', 'nevidi', 'neprisl', 'neprij', 'strh', 'zaplatil', 'refund', 'vrat', 'penize', 'ukrad', 'hack', 'vyhroz', 'obtez', 'zablokov', 'ban', 'smazal', 'zmizel', 'bug', 'error', 'reklamac', 'stiznost'];

type Kb = { id: number; q: string; a: string; k?: string[]; emb?: number[] | null };
let KB: Kb[] | null = null, kbAt = 0;
async function loadKb(admin: ReturnType<typeof createClient>) {
  if (KB && Date.now() - kbAt < 5 * 60_000) return KB;
  const { data } = await admin.from('support_kb').select('id,q,a,k,emb').neq('source', 'test').order('id').limit(500);
  KB = ((data || []) as Kb[]).map((r) => ({ ...r, k: (r.k || []).map(norm), emb: r.emb && r.emb.length ? r.emb : null })); kbAt = Date.now();
  return KB;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(URL, SERVICE);
    const auth = req.headers.get('Authorization') || '';
    const user = auth ? createClient(URL, ANON, { global: { headers: { Authorization: auth } } }) : null;
    const me = user ? (await user.auth.getUser()).data.user : null;

    // Učení – jen admin
    if (body.learn) {
      if (!me) return json({ error: 'auth' }, 401);
      const { data: p } = await admin.from('profiles').select('is_admin').eq('id', me.id).single();
      if (!p?.is_admin) return json({ error: 'forbidden' }, 403);
      const q = String(body.learn.q || '').trim().slice(0, 1000), a = String(body.learn.a || '').trim().slice(0, 2000);
      if (q.length < 8 || a.length < 8 || GREET.test(norm(q))) return json({ ok: false });
      let emb: number[] | null = null;
      try { emb = await embed(q); } catch { emb = null; }
      const stems = [...new Set(norm(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 6).map((w) => w.slice(0, 6)))].slice(0, 6);
      await admin.from('support_kb').insert({ q, a, emb, k: emb ? null : stems, source: 'learned' });
      KB = null;
      return json({ ok: true });
    }

    const text = String(body.text || '').trim().slice(0, 2000);
    if (!text) return json({ kind: 'empty' });
    const n = norm(text);
    if (GREET.test(n) || (n.split(' ').length <= 4 && /^(ahoj|cau|dobry|zdravim|nazdar|hej|diky|dekuj|jak se)/.test(n)))
      return json({ kind: 'greet', answer: 'Ahoj! 👋 Já jsem AmorAI 💘 a pomáhám s Plamínkem – s profilem, zprávami, platbami nebo když něco nefunguje. S čím ti můžu pomoct?' });

    const appish = APP.some((k) => n.includes(k));
    const problem = PROBLEM.some((k) => n.includes(k));
    const kb = await loadKb(admin);
    let e: number[] | null = null;
    if (kb.some((f) => f.emb)) { try { e = await embed(text); } catch { e = null; } }
    let best: Kb | null = null, bestS = 0, kwBest: Kb | null = null, kwN = 0;
    const ranked: [number, Kb][] = [];
    for (const f of kb) {
      const s = e && f.emb ? cos(e, f.emb) : 0;
      const hits = (f.k || []).filter((k) => n.includes(k)).length;
      ranked.push([hits + s, f]);
      if (s > bestS) { bestS = s; best = f; }
      if (hits > kwN) { kwN = hits; kwBest = f; }
    }
    const pick = kwBest || (bestS >= 0.88 ? best : null);
    if (!appish && !pick && bestS < 0.84)
      return json({ kind: 'offtopic', answer: 'S tímhle ti bohužel neporadím 🙂 Pomáhám jen s Plamínkem. Když máš s aplikací problém nebo otázku, napiš mi ji a pomůžu, případně ji předám týmu.', score: Math.round(bestS * 100) / 100 });

    if (pick && !problem) return json({ kind: 'answer', answer: pick.a, q: pick.q, score: Math.round(bestS * 100) / 100 });

    // Šetrný režim: když hotová odpověď není a nejde o problém pro člověka, vrátí podklady pro chytrého AmorAI
    if (body.triage && !pick && !problem) {
      const ctx = ranked.sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, f]) => ({ q: f.q, a: f.a }));
      return json({ kind: 'unsure', ctx });
    }
    if (body.probe) return json({ kind: 'would_escalate', pick: pick?.q || null, score: Math.round(bestS * 100) / 100, problem });
    // Skutečný problém nebo nevím → předat člověku (celý text přijde adminovi e-mailem)
    if (!me || !user) return json({ kind: 'needs_login', answer: pick?.a || null });
    const { error } = await user.rpc('support_send', { msg: text });
    if (error) return json({ kind: 'error', error: error.message }, 400);
    return json({ kind: 'escalated', answer: pick?.a || null, q: pick?.q || null });
  } catch (err) {
    return json({ kind: 'error', error: String(err) }, 500);
  }
});
