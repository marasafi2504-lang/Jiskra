// Plamínek – worker: statický web + asistent Flami AI
// Šetrně: Flami AI se volá jen tehdy, když hotové odpovědi (zdarma) nestačí.
// Běží na Cloudflare Workers AI v rámci bezplatného denního limitu; po vyčerpání aplikace přepne zpět na hotové odpovědi.
const SB = 'https://itfcekypwboljvwyzfkg.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZmNla3lwd2JvbGp2d3l6ZmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzk0MjUsImV4cCI6MjEwOTkxNTQyNX0.5xhst48-6yek7JliVjQ89qi3iQ1KY8AKZ9YrieTmhnc';
const MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8-fast';

const SYSTEM = `Jsi Flami, přátelský AI asistent české seznamovací aplikace Plamínek.
Pravidla:
- Odpovídej vždy česky, tykej, buď vřelý a stručný (nejvýš 4 krátké věty).
- Pomáháš jen s aplikací Plamínek (profil, fotky, zprávy, shody, Souznění, předplatné, coiny, ověření, bezpečnost, přihlášení, nastavení). Na nic jiného neodpovídej – slušně řekni, že pomáháš jen s Plamínkem.
- Vycházej POUZE z podkladů níže. Nevymýšlej funkce, ceny ani postupy, které v podkladech nejsou.
- Nikdy nechtěj heslo, kód z SMS ani platební údaje.
- Když odpověď v podkladech není, nebo jde o problém, který musí řešit člověk (platby, chyba aplikace, zablokovaný účet, obtěžování), napiš krátce, že to předáš týmu, a na úplný konec dej značku [PREDAT].
- Na seznamovací rady (jak napsat první zprávu, tipy na rande, bezpečnost na schůzce) smíš odpovědět obecně a laskavě.`;

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function amor(req, env) {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'auth' }, 401);
  // Jen přihlášení uživatelé + denní limit na osobu (hlídá databáze)
  const tick = await fetch(`${SB}/rest/v1/rpc/zarka_tick`, { method: 'POST', headers: { apikey: ANON, Authorization: auth, 'Content-Type': 'application/json' }, body: '{}' });
  if (tick.status === 401 || tick.status === 403) return json({ error: 'auth' }, 401);
  if (!tick.ok) return json({ error: (await tick.text()).includes('limit') ? 'limit' : 'tick' }, 429);
  let body; try { body = await req.json(); } catch { return json({ error: 'body' }, 400); }
  const text = String(body.text || '').slice(0, 800).trim();
  if (!text) return json({ error: 'empty' }, 400);
  const ctx = (Array.isArray(body.ctx) ? body.ctx : []).slice(0, 4).map((k) => `• ${String(k.q).slice(0, 120)}: ${String(k.a).slice(0, 600)}`).join('\n');
  const hist = (Array.isArray(body.history) ? body.history : []).slice(-4)
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 400) }));
  const messages = [{ role: 'system', content: `${SYSTEM}\n\nPodklady o aplikaci:\n${ctx || '(žádné konkrétní podklady – pokud jde o aplikaci, předej týmu)'}` }, ...hist, { role: 'user', content: text }];
  try {
    const r = await env.AI.run(MODEL, { messages, max_tokens: 260, temperature: 0.3 });
    let answer = String(r.response || '').trim();
    const handoff = /\[PREDAT\]/i.test(answer);
    answer = answer.replace(/\[PREDAT\]/gi, '').trim();
    if (!answer) return json({ error: 'empty_answer' }, 502);
    return json({ answer, handoff });
  } catch (e) {
    return json({ error: 'ai', detail: String(e).slice(0, 200) }, 503);
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/amor') return amor(req, env);
    return env.ASSETS.fetch(req);
  },
};
