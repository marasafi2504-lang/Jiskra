// Ukázkový režim Plamínku (?ukazka) – vymyšlená data, nic se neposílá na server ani neukládá.
// Skutečné profily, algoritmus ani statistiky se tím vůbec neovlivní.
const q = new URLSearchParams(location.search);
const state = 'user';
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();

const me = {
  id: 'me', name: 'Host', birthdate: '1996-05-14', gender: 'muz', looking_for: 'zeny', mode: 'laska',
  bio: 'Ukázkový profil – takhle může vypadat ten tvůj.', city: 'Brno', job: 'Designér',
  interests: ['Túry na hory', 'Káva', 'Cestování', 'Fotografie', 'Kolo', 'Houbaření', 'Lyže', 'Horské chaty a restaurace', 'Astrologie'], interest_love: ['Túry na hory', 'Káva'], relax: ['priroda', 'tv', 'pratele'], ascendant: 'Váhy', photos: ['demo/p5.jpg', 'demo/p1.jpg', 'demo/p3.jpg'], photo_url: 'demo/p5.jpg',
  prompts: [{ q: 'Ideální rande je…', a: 'procházka po Špilberku a večeře v bistru, kde vaří babička' }],
  personality: 'ENFP', min_age: 22, max_age: 34, max_distance_km: 50, lat: 49.2, lng: 16.6, verified: true,
  verification_status: 'approved', is_admin: false, banned: false,
  height_cm: 182, goal: 'vztah', education: 'vysoka', smoking: 'ne', drinking: 'obcas', kids: 'nemam_chci', religion: 'zadne', paused: false, notify: { matches: true, messages: true, likes: true }, filters: {},
};

const cands = [
  { id: 'c1', name: 'Tereza', age: 26, bio: 'Víkendy trávím na horách, přes týden u kafe a skicáku.', city: 'Brno', job: 'Grafička',
    interests: ['Túry na hory', 'Káva', 'Jóga', 'Houbaření', 'Výklad karet', 'Horské chaty a restaurace', 'Zpěv'], photos: ['demo/p0.jpg', 'demo/p2.jpg', 'demo/p4.jpg'],
    prompts: [{ q: 'Neodolám…', a: 'čerstvému croissantu a západu slunce z Pálavy' }, { q: 'Hledám někoho, kdo…', a: 'se se mnou nebojí vyrazit na výlet bez plánu' }],
    personality: 'INFJ', zodiac: 'Lev', mode: 'laska', verified: true, distance_km: 3, compat: 93, active_recently: true, super_liked_me: false,
    height_cm: 168, goal: 'vztah', education: 'vysoka', smoking: 'ne', drinking: 'obcas', kids: 'nemam_chci', religion: 'zadne', boosted: true },
  { id: 'c2', name: 'Klára', age: 24, bio: 'Knihomol s vášní pro tanec.', city: 'Brno', job: 'Studentka medicíny',
    interests: ['Knihy', 'Tanec', 'Psi'], photos: ['demo/p4.jpg', 'demo/p0.jpg'], prompts: [], personality: 'ISFJ', zodiac: 'Ryby',
    mode: 'oboje', verified: false, distance_km: 8, compat: 72, active_recently: false, super_liked_me: true, height_cm: 172, goal: 'nevim' },
];

const matches = [
  { match_id: 'm1', other_id: 'c1', name: 'Tereza', age: 26, photo_url: 'demo/p0.jpg', verified: true, active_recently: true,
    last_body: 'Jasně, v sobotu mám čas! Kam vyrazíme? 🏔', last_kind: 'text', last_at: iso(3), last_from_me: false, unread: 2, created_at: iso(300) },
  { match_id: 'm2', other_id: 'c3', name: 'Lucie', age: 28, photo_url: 'demo/p2.jpg', verified: false, active_recently: false,
    last_body: 'Haha, to se mi stává pořád', last_kind: 'text', last_at: iso(200), last_from_me: true, unread: 0, created_at: iso(2000) },
  { match_id: 'm3', other_id: 'c4', name: 'Adéla', age: 25, photo_url: 'demo/p4.jpg', verified: true, active_recently: true,
    last_body: null, last_kind: null, last_at: null, last_from_me: null, unread: 0, created_at: iso(30) },
  { match_id: 'm4', other_id: 'c5', name: 'Nikola', age: 27, photo_url: 'demo/p3.jpg', verified: false, active_recently: false,
    last_body: null, last_kind: null, last_at: null, last_from_me: null, unread: 0, created_at: iso(60) },
];

const messages = [
  { id: 1, match_id: 'm1', sender: 'me', body: 'Ahoj Terezo! Zaujala mě tvoje odpověď o Pálavě – byla jsi tam letos?', kind: 'text', created_at: iso(40), read_at: iso(38) },
  { id: 2, match_id: 'm1', sender: 'c1', body: 'Ahoj! Jo, v září. Ten západ slunce byl neskutečnej 😍', kind: 'text', created_at: iso(35), reaction: '❤️' },
  { id: 3, match_id: 'm1', sender: 'c1', body: '📷', kind: 'image', image_url: 'demo/p2.jpg', created_at: iso(34) },
  { id: 4, match_id: 'm1', sender: 'me', body: 'Wow, to je krása! Tak to musíme dát spolu 🙂', kind: 'text', created_at: iso(10), read_at: iso(5), reaction: '🔥' },
    { id: 6, match_id: 'm1', sender: 'me', body: '✨', kind: 'image', media_type: 'sticker', image_url: 'demo/st.png', created_at: iso(3.5) },
  { id: 7, match_id: 'm1', sender: 'c1', body: 'Jasně, v sobotu mám čas! Kam vyrazíme? 🏔', kind: 'text', created_at: iso(3) },
];

const res = (data, error = null) => Promise.resolve({ data, error });

function builder(table) {
  const st = { table, op: 'select', single: false };
  const exec = () => {
    if (st.op !== 'select') return res(st.op === 'insert' && st.wantRow ? { id: 99, ...st.row, created_at: new Date().toISOString() } : null);
    if (table === 'profiles') {
      if (state === 'wizard') return res(null);
      return res(st.single ? me : [me]);
    }
    if (table === 'subscriptions') return res(null ? { plan: null, valid_until: '2027-05-01T00:00:00Z' } : null);
    if (table === 'support_messages') return res([{ id: 1, from_admin: false, body: 'Ahoj, nejde mi nahrát fotka.', created_at: iso(300) }, { id: 2, from_admin: true, body: 'Ahoj, zkus prosím fotku menší než 10 MB. Pokud to nepůjde, pošli screenshot 🙂', created_at: iso(120) }]);
    if (table === 'messages') return res(messages.filter((m) => m.match_id === 'm1'));
    if (table === 'matches') return res(st.single ? null : []);
    return res(st.single ? null : []);
  };
  const b = {
    select() { if (st.op === 'insert') st.wantRow = true; return b; },
    eq() { return b; }, order() { return b; }, limit() { return b; },
    maybeSingle() { st.single = true; return exec(); }, single() { st.single = true; return exec(); },
    insert(row) { st.op = 'insert'; st.row = row; return b; },
    update() { st.op = 'update'; return b; }, delete() { st.op = 'delete'; return b; }, upsert() { st.op = 'upsert'; return b; },
    then(ok, bad) { return exec().then(ok, bad); },
  };
  return b;
}

export function createClient() {
  const session = state === 'anon' ? null : { user: { id: 'me', email: 'ukazka@plaminek.app', user_metadata: { given_name: 'Host' }, identities: [{ provider: 'google' }, { provider: 'email' }] } };
  const ch = { on() { return ch; }, subscribe() { return ch; }, send() {} };
  return {
    auth: {
      getSession: () => res({ session }),
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
      signOut: () => res(null), getSession2: 0, signInWithOAuth: () => res(null),
      signUp: () => res({ session: null }), signInWithPassword: () => res(null),
    },
    from: builder,
    rpc(name) {
      if (name === 'discover3') return res(cands);
      if (name === 'my_matches3') return res(matches);
      if (name === 'top_picks') return res(cands.map((c, i) => ({ ...c, shared: 2 - i, total: 8 })));
      if (name === 'viewers_count') return res(5);
      if (name === 'boost_status') return res([{ active_until: null, used: 0, allowed: null ? 1 : 0 }]);
      if (name === 'my_blocks') return res([]);
      if (name === 'requests_count') return res(2);
      if (name === 'support_unread') return res(1);
      if (name === 'requests_inbox') return res([
        { id: 'r1', created_at: iso(12), visible: true, sender: 'c2', name: 'Klára', age: 24, photo_url: 'demo/p4.jpg', verified: false, body: 'Ahoj! Taky miluju hory 🏔 Kam nejradši vyrážíš?' },
        { id: 'r2', created_at: iso(90), visible: false, preview: 'Čau…' }]);
      if (name === 'my_coins') return res(350);
      if (name === 'revealed_likes_list') return res([cands[1]]);
      if (name === 'my_coin_history') return res([{ delta: -500, reason: 'boost', created_at: iso(60) }, { delta: 500, reason: 'verify_bonus', created_at: iso(3000) }, { delta: 1000, reason: 'purchase', created_at: iso(4000) }]);
      if (name === 'likes_me_count') return res(7);
      if (name === 'souzneni_data') return res([{ relax: ['priroda', 'pratele', 'zpev'], interest_love: ['Túry na hory', 'Houbaření'], ascendant: 'Blíženci' }]);
      if (name === 'profile_card3') return res([cands[0]]);
      return res(null);
    },
    channel: () => ch, removeChannel() {},
    storage: { from: () => ({ upload: () => res({}), getPublicUrl: (p) => ({ data: { publicUrl: p } }), createSignedUrl: () => res({ signedUrl: '' }) }) },
    functions: { invoke: (n, { body }) => { const t = (body.text || '').toLowerCase();
      if (/^ahoj/.test(t)) return res({ kind: 'greet', answer: 'Ahoj! 👋 Já jsem Flami 🔥 a pomáhám s Plamínkem. V ukázce odpovídám jen naoko – po registraci ti poradím doopravdy.' });
      if (t.includes('počasí')) return res({ kind: 'offtopic', answer: 'S tímhle ti bohužel neporadím 🙂 Pomáhám jen s Plamínkem. Když máš problém s aplikací, popiš mi ho a pomůžu, případně ho předám týmu.' });
      if (t.includes('první zpráv')) return res({ kind: 'unsure', ctx: [] });
      return res({ kind: 'answer', q: 'Co je Souznění?', answer: 'Souznění je srdíčko s procenty v detailu profilu. Počítá, jak moc si sedíte…' }); } },
  };
}
