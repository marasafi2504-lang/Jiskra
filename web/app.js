// =====================================================================
// Jiskra – seznamka (PWA)
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as C from './config.js';

const app = document.getElementById('app');
// Na bezplatném Netlify je dole odznak – necháme pod menu volné místo
if (location.hostname.endsWith('netlify.app')) document.documentElement.classList.add('has-badge');
const configured = !C.SUPABASE_URL.includes('DOPLN') && !C.SUPABASE_ANON_KEY.includes('DOPLN');
const sb = configured ? createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

const S = {
  session: null,
  me: null,
  plan: null,          // 'plus' | 'gold' | 'platinum' | null
  planUntil: null,
  candidates: [],
  loadingCandidates: false,
  lastSwiped: null,
  matches: [],
  chatChannel: null,
  globalChannel: null,
  premiumTier: 'gold',
  premiumPeriod: 6,
};

// ---------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };
const initial = (name) => esc((name || '?').trim().charAt(0).toUpperCase());
const bgImg = (url) => (url ? `background-image:url('${esc(url)}')` : '');
const ageOf = (d) => { if (!d) return ''; const b = new Date(d), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const planName = { plus: 'Plus', gold: 'Gold', platinum: 'Platinum' };

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Včera';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

const store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* nic */ } },
};

function errText(e) {
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  if (m.includes('Invalid login credentials')) return 'Špatný e-mail nebo heslo.';
  if (m.includes('User already registered')) return 'Tento e-mail už je zaregistrovaný. Přihlas se.';
  if (m.includes('Password should be')) return 'Heslo musí mít aspoň 6 znaků.';
  if (m.includes('Email not confirmed')) return 'Nejdřív potvrď e-mail – poslali jsme ti odkaz.';
  if (m.includes('under_18')) return 'Aplikace je jen pro lidi starší 18 let.';
  if (m.includes('like_limit')) return 'Dnešní lajky došly. S předplatným jsou neomezené.';
  if (m.includes('super_limit')) return 'Super Like ti tento týden došly.';
  if (m.includes('premium_required')) return 'Tahle funkce je v předplatném Gold.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Nejde se připojit. Zkontroluj internet.';
  return 'Něco se pokazilo: ' + m;
}

// ---------------------------------------------------------------------
// Ikony (inline SVG)
// ---------------------------------------------------------------------
const svg = (body, { size = 24, color = 'currentColor', fill = 'none', sw = 2 } = {}) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${fill === 'none' ? color : 'none'}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const I = {
  flame: (o) => svg('<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z"/>', o),
  heart: (o) => svg('<path d="M12 21l-1.4-1.3C5.4 15 2 12 2 8.3 2 5.3 4.4 3 7.4 3c1.7 0 3.4.8 4.6 2.1C13.2 3.8 14.9 3 16.6 3 19.6 3 22 5.3 22 8.3c0 3.7-3.4 6.7-8.6 11.4z"/>', o),
  heartLine: (o) => svg('<path d="M12 20l-1.2-1.1C6 14.6 3 11.9 3 8.6 3 6 5 4 7.6 4c1.5 0 3 .7 4.4 2 1.4-1.3 2.9-2 4.4-2C19 4 21 6 21 8.6c0 3.3-3 6-7.8 10.3z"/>', o),
  chat: (o) => svg('<path d="M4 5h16v11H8l-4 4z"/>', o),
  user: (o) => svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>', o),
  x: (o) => svg('<path d="M6 6l12 12M18 6L6 18"/>', o),
  star: (o) => svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>', o),
  bolt: (o) => svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', o),
  undo: (o) => svg('<path d="M4 9h11a5 5 0 0 1 0 10H9"/><path d="M8 5L4 9l4 4"/>', o),
  crown: (o) => svg('<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>', o),
  sliders: (o) => svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>', o),
  pin: (o) => svg('<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>', o),
  bag: (o) => svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2"/>', o),
  shield: (o) => svg('<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>', o),
  back: (o) => svg('<path d="M15 5l-7 7 7 7"/>', o),
  chevron: (o) => svg('<path d="M9 5l7 7-7 7"/>', o),
  send: (o) => svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>', o),
  dots: (o) => svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', { ...o, fill: 'currentColor' }),
  camera: (o) => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', o),
  check: (o) => svg('<path d="M5 12l5 5 9-10"/>', o),
  arrow: (o) => svg('<path d="M5 12h19M13 6l6 6-6 6"/>', o),
};
const verifiedBadge = (size = 22) =>
  `<svg role="img" aria-label="Ověřený profil" width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" fill="#A855F7" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const logo = (size = 40) => `<div class="logo-mark" style="width:${size}px;height:${size}px">${I.flame({ size: Math.round(size * 0.55), color: '#fff' })}</div>`;

const waves = (variant = 'top') => variant === 'top'
  ? `<svg class="waves" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMaxYMin slice" fill="none">
      <path d="M140 0 C220 60 300 40 390 120" stroke="#C084FC" stroke-opacity=".7" stroke-width="2"/>
      <path d="M180 0 C250 80 320 70 390 170" stroke="#A855F7" stroke-opacity=".5" stroke-width="1.5"/>
      <path d="M230 0 C280 90 340 110 390 220" stroke="#C084FC" stroke-opacity=".35" stroke-width="1"/>
      <path d="M0 700 C90 750 140 844 260 844" stroke="#9333EA" stroke-opacity=".5" stroke-width="2"/>
      <path d="M0 750 C70 780 110 830 170 844" stroke="#C084FC" stroke-opacity=".35" stroke-width="1.5"/></svg>`
  : `<svg class="waves" aria-hidden="true" viewBox="0 0 390 844" preserveAspectRatio="xMidYMin slice" fill="none">
      <path d="M0 180 C120 120 260 240 390 140" stroke="#A855F7" stroke-opacity=".45" stroke-width="2"/>
      <path d="M0 220 C140 160 250 290 390 190" stroke="#C084FC" stroke-opacity=".3" stroke-width="1.5"/>
      <path d="M0 700 C120 640 270 780 390 660" stroke="#9333EA" stroke-opacity=".5" stroke-width="2"/></svg>`;

function tabbar(active) {
  const unread = countUnread();
  const t = (hash, key, label, icon) => `
    <a href="${hash}" ${active === key ? 'aria-current="page"' : ''}>
      ${icon({ color: active === key ? '#C084FC' : '#A897C4' })}${label}
      ${key === 'chats' && unread ? `<span class="dot">${unread}</span>` : ''}
    </a>`;
  return `<nav class="tabbar" aria-label="Hlavní menu">
    ${t('#/discover', 'discover', 'Objevuj', I.flame)}
    ${t('#/likes', 'likes', 'Lajky', I.heartLine)}
    ${t('#/chats', 'chats', 'Zprávy', I.chat)}
    ${t('#/profile', 'profile', 'Profil', I.user)}
  </nav>`;
}

function countUnread() {
  const read = store.get('jiskra-read', {});
  return S.matches.filter((m) => m.last_at && !m.last_from_me && (!read[m.match_id] || read[m.match_id] < m.last_at)).length;
}

function loading() {
  app.innerHTML = `<div class="splash">${logo(72)}</div>`;
  $('.logo-mark', app).classList.add('big');
}

// ---------------------------------------------------------------------
// Načtení uživatele
// ---------------------------------------------------------------------
async function loadMe() {
  if (!S.session) { S.me = null; S.plan = null; return; }
  const uid = S.session.user.id;
  const [{ data: me }, { data: sub }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
    sb.from('subscriptions').select('plan, valid_until').eq('user_id', uid).maybeSingle(),
  ]);
  S.me = me || null;
  S.plan = sub && new Date(sub.valid_until) > new Date() ? sub.plan : null;
  S.planUntil = sub ? sub.valid_until : null;
  if (S.me) { await loadMatches(); subscribeGlobal(); }
}

async function loadMatches() {
  const { data, error } = await sb.rpc('my_matches');
  if (!error) S.matches = data || [];
}

function subscribeGlobal() {
  if (S.globalChannel) return;
  S.globalChannel = sb.channel('jiskra-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, async () => {
      await loadMatches();
      toast('Máš novou shodu! 💜');
      if (['chats', 'discover'].includes(currentView())) route();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
      const openChat = location.hash.startsWith('#/chat/') && location.hash.split('/')[2] === p.new.match_id;
      if (openChat) return;
      await loadMatches();
      if (p.new.sender !== S.session.user.id) {
        const m = S.matches.find((x) => x.match_id === p.new.match_id);
        toast(`${m ? m.name : 'Nová zpráva'}: ${p.new.body.slice(0, 60)}`);
      }
      if (currentView() === 'chats') renderChats(); else updateTabbar();
    })
    .subscribe();
}

function updateTabbar() {
  const nav = $('.tabbar');
  if (!nav) return;
  const active = currentView();
  nav.outerHTML = tabbar(active);
}

const currentView = () => (location.hash.replace('#/', '').split('/')[0] || 'discover');

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
async function route() {
  if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
  window.scrollTo(0, 0);
  if (!configured) return renderSetup();
  if (!S.session) return renderAuth();
  if (!S.me) return renderProfileForm(true);
  const [view, arg] = location.hash.replace('#/', '').split('/');
  switch (view) {
    case 'likes': return renderLikes();
    case 'chats': return renderChats();
    case 'chat': return renderChat(arg);
    case 'profile': return renderProfile();
    case 'edit': return renderProfileForm(false);
    case 'premium': return renderPremium();
    default: return renderDiscover();
  }
}

// ---------------------------------------------------------------------
// Chybí nastavení
// ---------------------------------------------------------------------
function renderSetup() {
  app.innerHTML = `${waves()}<div class="screen pad" style="justify-content:center;gap:16px">
    <div class="brand">${logo()}<div><div class="brand-name">Jiskra</div><div class="brand-sub">seznamka</div></div></div>
    <h1>Skoro hotovo</h1>
    <p class="lead">Aplikace ještě není propojená s databází. Otevři soubor <b>config.js</b> a vyplň adresu a klíč ze Supabase (návod je v souboru NAVOD.md).</p>
  </div>`;
}

// ---------------------------------------------------------------------
// Přihlášení / registrace
// ---------------------------------------------------------------------
function renderAuth(mode = 'welcome') {
  if (mode === 'welcome') {
    app.innerHTML = `${waves()}
    <div class="screen pad" style="padding-top:40px;padding-bottom:calc(32px + var(--safe-b))">
      <div class="brand">${logo(44)}<div><div class="brand-name">Jiskra</div><div class="brand-sub">seznamka</div></div></div>
      <div style="margin-top:64px">
        <p class="script">ahoj, rádi tě poznáme!</p>
        <h1 class="hero-title">Najdi svou<br><em>jiskru</em></h1>
        <div class="bar"></div>
        <p class="lead">Seznamuj se s lidmi ve svém okolí. Ověřené profily, chytré doporučení a bezpečný chat.</p>
      </div>
      <div style="flex:1;min-height:32px"></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <button class="btn btn-primary" data-act="signup">Vytvořit účet ${I.arrow({ size: 18, color: '#fff' })}</button>
        <button class="btn btn-outline" data-act="signin">Už mám účet – přihlásit se</button>
        <p class="small muted" style="text-align:center;margin:6px 0 0">Pokračováním souhlasíš s <a href="${esc(C.TERMS_URL)}" target="_blank" rel="noopener">podmínkami</a> a <a href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener">zásadami ochrany soukromí</a>. Jen pro 18+.</p>
      </div>
    </div>`;
    $('[data-act=signup]').onclick = () => renderAuth('signup');
    $('[data-act=signin]').onclick = () => renderAuth('signin');
    return;
  }

  const signup = mode === 'signup';
  app.innerHTML = `${waves()}
  <div class="screen pad" style="padding-top:24px">
    <button class="icon-btn" data-act="back" aria-label="Zpět">${I.back({ size: 22 })}</button>
    <div style="margin:36px 0 26px">
      <p class="script">${signup ? 'začínáme!' : 'vítej zpátky'}</p>
      <h1 style="font-size:36px">${signup ? 'Vytvoř si <span style="color:var(--accent)">účet</span>' : 'Přihlas <span style="color:var(--accent)">se</span>'}</h1>
    </div>
    <form id="authForm" novalidate>
      <div class="field"><label for="email">E-mail</label>
        <input class="input" id="email" type="email" autocomplete="email" inputmode="email" required placeholder="tvuj@email.cz"></div>
      <div class="field"><label for="pass">Heslo</label>
        <input class="input" id="pass" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" required placeholder="aspoň 6 znaků"></div>
      <button class="btn btn-primary" type="submit" style="margin-top:8px">${signup ? 'Zaregistrovat se' : 'Přihlásit se'}</button>
    </form>
    <div style="display:flex;justify-content:space-between;margin-top:10px">
      <button class="link-btn" data-act="switch">${signup ? 'Už mám účet' : 'Nemám účet'}</button>
      ${signup ? '' : '<button class="link-btn" data-act="reset">Zapomenuté heslo</button>'}
    </div>
  </div>`;
  $('[data-act=back]').onclick = () => renderAuth('welcome');
  $('[data-act=switch]').onclick = () => renderAuth(signup ? 'signin' : 'signup');
  const reset = $('[data-act=reset]');
  if (reset) reset.onclick = async () => {
    const email = $('#email').value.trim();
    if (!email) return toast('Napiš nahoru svůj e-mail.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    toast(error ? errText(error) : 'Poslali jsme ti e-mail s odkazem na nové heslo.');
  };
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#email').value.trim(), password = $('#pass').value;
    if (!email || password.length < 6) return toast('Vyplň e-mail a heslo (aspoň 6 znaků).');
    const btn = $('#authForm button[type=submit]');
    btn.disabled = true;
    try {
      if (signup) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { toast('Hotovo! Potvrď registraci odkazem v e-mailu.', 5000); renderAuth('signin'); return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast(errText(err));
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------
// Vytvoření / úprava profilu
// ---------------------------------------------------------------------
const INTERESTS = ['Cestování', 'Hory', 'Příroda', 'Káva', 'Vaření', 'Hudba', 'Koncerty', 'Sport', 'Běh', 'Fitness', 'Jóga',
  'Knihy', 'Film', 'Seriály', 'Hry', 'Tanec', 'Umění', 'Fotografie', 'Psi', 'Kočky', 'Víno', 'Pivo', 'Technologie', 'Móda'];

async function resizeImage(file, max = 1080) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

function renderProfileForm(isNew) {
  const p = S.me || { gender: 'muz', looking_for: 'zeny', interests: [], min_age: 18, max_age: 45 };
  const chosen = new Set(p.interests || []);
  let gender = p.gender, looking = p.looking_for, photoFile = null;
  const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - 18);

  app.innerHTML = `${waves()}
  <div class="screen">
    <div class="topbar">
      ${isNew ? '<span></span>' : `<a class="icon-btn" href="#/profile" aria-label="Zpět">${I.back({ size: 22 })}</a>`}
      <h1 style="flex:1;${isNew ? '' : 'text-align:center'}">${isNew ? 'Tvůj profil' : 'Upravit profil'}</h1>
      ${isNew ? '<button class="link-btn" data-act="logout">Odhlásit</button>' : '<span style="width:44px"></span>'}
    </div>
    <form id="pf" class="scroll pad" style="padding-top:6px" novalidate>
      ${isNew ? '<p class="lead" style="margin-bottom:18px">Pár údajů a můžeš začít. Profil s fotkou dostává mnohem víc lajků.</p>' : ''}
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:18px">
        <label class="photo-pick ${p.photo_url ? 'has' : ''}" id="photoBox" style="${bgImg(p.photo_url)}">
          ${I.camera({ size: 28, color: '#A897C4' })}<span>Přidat fotku</span>
          <input type="file" id="photo" accept="image/*" class="sr-only">
        </label>
        <p class="small muted" style="margin:0">Fotka, kde je dobře vidět tvůj obličej. Žádné cizí osoby ani děti.</p>
      </div>
      <div class="field"><label for="name">Jméno</label><input class="input" id="name" maxlength="40" required value="${esc(p.name)}" placeholder="Jak ti říkají"></div>
      <div class="field"><label for="birth">Datum narození</label><input class="input" id="birth" type="date" required max="${maxBirth.toISOString().slice(0, 10)}" value="${esc(p.birthdate)}"></div>
      <div class="field"><span class="lbl" id="gL">Jsem</span>
        <div class="seg" role="group" aria-labelledby="gL" id="gender">
          <button type="button" data-v="muz">Muž</button><button type="button" data-v="zena">Žena</button><button type="button" data-v="jine">Jiné</button></div></div>
      <div class="field"><span class="lbl" id="lL">Hledám</span>
        <div class="seg" role="group" aria-labelledby="lL" id="looking">
          <button type="button" data-v="muze">Muže</button><button type="button" data-v="zeny">Ženy</button><button type="button" data-v="vsechny">Všechny</button></div></div>
      <div class="row">
        <div class="field"><label for="minAge">Věk od</label><input class="input" id="minAge" type="number" min="18" max="99" value="${esc(p.min_age)}"></div>
        <div class="field"><label for="maxAge">Věk do</label><input class="input" id="maxAge" type="number" min="18" max="99" value="${esc(p.max_age)}"></div>
      </div>
      <div class="row">
        <div class="field"><label for="city">Město</label><input class="input" id="city" maxlength="60" value="${esc(p.city)}" placeholder="Praha"></div>
        <div class="field"><label for="job">Práce / škola</label><input class="input" id="job" maxlength="60" value="${esc(p.job)}" placeholder="Grafička"></div>
      </div>
      <div class="field"><label for="bio">O mně</label><textarea class="input" id="bio" maxlength="500" placeholder="Co tě baví, co hledáš…">${esc(p.bio)}</textarea></div>
      <div class="field"><span class="lbl">Zájmy (max. 6)</span>
        <div class="chips" id="ints">${INTERESTS.map((i) => `<button type="button" class="chip" data-v="${esc(i)}" aria-pressed="${chosen.has(i)}">${esc(i)}</button>`).join('')}</div></div>
      ${isNew ? `<label class="consent" for="consent">
        <input type="checkbox" id="consent">
        <span>Souhlasím se zpracováním údajů o mém pohlaví a o tom, koho hledám, aby mi Jiskra mohla ukazovat vhodné lidi. Souhlas můžu kdykoli odvolat smazáním účtu. <a href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener">Zásady ochrany osobních údajů</a></span>
      </label>` : ''}
      <button class="btn btn-primary" type="submit" style="margin:12px 0 calc(24px + var(--safe-b))">${isNew ? 'Začít objevovat' : 'Uložit změny'}</button>
    </form>
  </div>`;

  const setSeg = (id, val) => $$(`#${id} button`).forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === val));
  setSeg('gender', gender); setSeg('looking', looking);
  $$('#gender button').forEach((b) => (b.onclick = () => { gender = b.dataset.v; setSeg('gender', gender); }));
  $$('#looking button').forEach((b) => (b.onclick = () => { looking = b.dataset.v; setSeg('looking', looking); }));
  $$('#ints button').forEach((b) => (b.onclick = () => {
    const v = b.dataset.v;
    if (chosen.has(v)) chosen.delete(v); else { if (chosen.size >= 6) return toast('Maximálně 6 zájmů.'); chosen.add(v); }
    b.setAttribute('aria-pressed', chosen.has(v));
  }));
  $('#photo').onchange = (e) => {
    photoFile = e.target.files[0] || null;
    if (photoFile) { const box = $('#photoBox'); box.style.backgroundImage = `url('${URL.createObjectURL(photoFile)}')`; box.classList.add('has'); }
  };
  const lo = $('[data-act=logout]');
  if (lo) lo.onclick = () => sb.auth.signOut();

  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#name').value.trim(), birthdate = $('#birth').value;
    if (!name) return toast('Vyplň jméno.');
    if (!birthdate) return toast('Vyplň datum narození.');
    if (ageOf(birthdate) < 18) return toast('Aplikace je jen pro lidi starší 18 let.');
    if (isNew && !$('#consent').checked) return toast('Pro pokračování potvrď souhlas dole u tlačítka.');
    let minAge = Math.max(18, parseInt($('#minAge').value, 10) || 18);
    let maxAge = Math.min(99, parseInt($('#maxAge').value, 10) || 99);
    if (minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];
    const btn = $('#pf button[type=submit]'); btn.disabled = true;
    try {
      const uid = S.session.user.id;
      let photo_url = p.photo_url || null;
      if (photoFile) {
        const blob = await resizeImage(photoFile);
        const path = `${uid}/${Date.now()}.jpg`;
        const { error: upErr } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
        if (upErr) throw upErr;
        photo_url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
      }
      const row = { name, birthdate, gender, looking_for: looking, min_age: minAge, max_age: maxAge,
        city: $('#city').value.trim(), job: $('#job').value.trim(), bio: $('#bio').value.trim(), interests: [...chosen], photo_url };
      const q = isNew ? sb.from('profiles').insert({ id: uid, ...row }) : sb.from('profiles').update(row).eq('id', uid);
      const { error } = await q;
      if (error) throw error;
      await loadMe();
      S.candidates = [];
      toast(isNew ? 'Vítej v Jiskře! 💜' : 'Uloženo.');
      go(isNew ? '#/discover' : '#/profile');
    } catch (err) {
      toast(errText(err));
    } finally {
      btn.disabled = false;
    }
  };
}

// ---------------------------------------------------------------------
// Objevuj (swipování)
// ---------------------------------------------------------------------
async function fetchCandidates() {
  if (S.loadingCandidates) return;
  S.loadingCandidates = true;
  const { data, error } = await sb.rpc('get_candidates', { lim: 20 });
  S.loadingCandidates = false;
  if (error) { toast(errText(error)); return; }
  const have = new Set(S.candidates.map((c) => c.id));
  S.candidates.push(...(data || []).filter((c) => !have.has(c.id)));
}

function cardHTML(p, back = false) {
  return `<article class="card ${back ? 'back' : ''}" style="${bgImg(p.photo_url)}" aria-label="${esc(p.name)}, ${esc(p.age)} let">
    ${p.photo_url ? '' : `<div class="placeholder">${I.user({ size: 120, color: '#6D3FC0', sw: 1 })}</div>`}
    ${p.super_liked_me ? `<span class="super-badge">${I.star({ size: 12, fill: '#08142B' })} Dal ti Super Like</span>` : ''}
    <span class="stamp like">LÍBÍ</span><span class="stamp nope">NE</span>
    <div class="info">
      <div class="name">${esc(p.name)}, ${esc(p.age)} ${p.verified ? verifiedBadge(24) : ''}</div>
      <div class="meta">
        ${p.job ? `<span>${I.bag({ size: 15, color: '#C084FC' })}${esc(p.job)}</span>` : ''}
        ${p.city ? `<span>${I.pin({ size: 15, color: '#C084FC' })}${esc(p.city)}</span>` : ''}
      </div>
      ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : '<div style="height:10px"></div>'}
      <div class="chips">${(p.interests || []).slice(0, 5).map((i) => `<span class="chip">${esc(i)}</span>`).join('')}</div>
    </div>
  </article>`;
}

async function renderDiscover() {
  app.innerHTML = `${waves()}
  <div class="screen">
    <div class="topbar">
      <div class="brand">${logo(36)}<h1>Objevuj</h1></div>
      <div class="actions">
        <a class="icon-btn" href="#/premium" aria-label="Předplatné">${I.crown({ size: 20, color: '#FBBF24' })}</a>
        <a class="icon-btn" href="#/edit" aria-label="Koho hledám – filtry">${I.sliders({ size: 20, color: '#fff' })}</a>
      </div>
    </div>
    <div class="deck" id="deck"><div class="empty"><div class="spinner"></div></div></div>
    <div class="swipe-actions" id="actions">
      <button class="round md" data-k="undo" aria-label="Vrátit poslední">${I.undo({ size: 22, color: '#FBBF24' })}</button>
      <button class="round lg" data-k="pass" aria-label="Přeskočit">${I.x({ size: 26, color: '#F87171', sw: 2.6 })}</button>
      <button class="round like" data-k="like" aria-label="Líbí se mi">${I.heart({ size: 30, fill: '#fff' })}</button>
      <button class="round md" data-k="super" aria-label="Super Like">${I.star({ size: 22, fill: '#60A5FA' })}</button>
    </div>
    ${tabbar('discover')}
  </div>`;
  $$('#actions button').forEach((b) => (b.onclick = () => (b.dataset.k === 'undo' ? rewind() : swipe(b.dataset.k))));
  if (S.candidates.length < 3) await fetchCandidates();
  drawDeck();
}

function drawDeck() {
  const deck = $('#deck');
  if (!deck) return;
  const [a, b] = S.candidates;
  if (!a) {
    deck.innerHTML = `<div class="empty">
      <p class="script" style="transform:none">zatím je to všechno</p>
      <h1>Nikoho dalšího jsme nenašli</h1>
      <p class="lead">Zkus rozšířit věkové rozmezí nebo se vrať později – noví lidé přibývají každý den.</p>
      <a class="btn btn-outline btn-sm" href="#/edit">Upravit, koho hledám</a>
    </div>`;
    $('#actions').style.visibility = 'hidden';
    return;
  }
  $('#actions').style.visibility = 'visible';
  deck.innerHTML = (b ? cardHTML(b, true) : '') + cardHTML(a);
  attachDrag(deck.lastElementChild);
}

function attachDrag(card) {
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false;
  const like = $('.stamp.like', card), nope = $('.stamp.nope', card);
  card.addEventListener('pointerdown', (e) => {
    dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    card.setPointerCapture(e.pointerId); card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 100));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    if (dx > 110) swipe('like');
    else if (dx < -110) swipe('pass');
    else if (dy < -140) swipe('super');
    else {
      card.style.transition = 'transform .25s'; card.style.transform = '';
      like.style.opacity = 0; nope.style.opacity = 0;
    }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

async function swipe(kind) {
  const p = S.candidates[0];
  if (!p) return;
  const card = $('#deck .card:last-child');
  if (card) {
    const x = kind === 'pass' ? -600 : kind === 'like' ? 600 : 0;
    const y = kind === 'super' ? -900 : 40;
    card.style.transition = 'transform .3s ease-in';
    card.style.transform = `translate(${x}px, ${y}px) rotate(${x / 20}deg)`;
  }
  S.candidates.shift();
  setTimeout(drawDeck, 250);

  const { error } = await sb.from('swipes').insert({ swiper: S.session.user.id, swipee: p.id, kind });
  if (error) {
    S.candidates.unshift(p);
    setTimeout(drawDeck, 300);
    toast(errText(error), 3500);
    if (String(error.message).includes('like_limit')) setTimeout(() => go('#/premium'), 900);
    return;
  }
  S.lastSwiped = p;
  if (S.candidates.length < 4) fetchCandidates().then(() => { if (currentView() === 'discover' && !$('#deck .card')) drawDeck(); });
  if (kind !== 'pass') checkMatch(p);
}

async function checkMatch(p) {
  const me = S.session.user.id;
  const [a, b] = me < p.id ? [me, p.id] : [p.id, me];
  const { data } = await sb.from('matches').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (data) { await loadMatches(); showMatch(p, data.id); }
}

async function rewind() {
  if (!S.plan) { toast('Vrácení swipu je v předplatném Plus a vyšším.'); return go('#/premium'); }
  const p = S.lastSwiped;
  if (!p) return toast('Není co vrátit.');
  const { error } = await sb.from('swipes').delete().eq('swiper', S.session.user.id).eq('swipee', p.id);
  if (error) return toast(errText(error));
  S.lastSwiped = null;
  S.candidates.unshift(p);
  drawDeck();
}

function showMatch(p, matchId) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', 'Máte shodu');
  ov.innerHTML = `${waves('mid')}
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:100%;max-width:360px">
      <p class="script" style="font-size:40px;transform:rotate(-5deg)">Jiskra přeskočila!</p>
      <h1 style="font-size:50px;line-height:1">To je <span style="color:var(--accent)">shoda</span></h1>
      <p class="lead" style="margin-top:14px">Ty a ${esc(p.name)} jste se navzájem lajkli. Napiš první a prolom ledy.</p>
      <div class="match-pics">
        <div class="pic a" style="${bgImg(S.me.photo_url)}">${S.me.photo_url ? '' : initial(S.me.name)}</div>
        <div class="pic b" style="${bgImg(p.photo_url)}">${p.photo_url ? '' : initial(p.name)}</div>
        <div class="heart">${I.heart({ size: 26, fill: '#fff' })}</div>
      </div>
      <button class="btn btn-primary" data-act="write">${I.send({ size: 20, color: '#fff' })} Napsat zprávu</button>
      <button class="btn btn-outline" data-act="close" style="margin-top:12px">Pokračovat v objevování</button>
    </div>`;
  document.body.appendChild(ov);
  $('[data-act=write]', ov).onclick = () => { ov.remove(); go(`#/chat/${matchId}`); };
  $('[data-act=close]', ov).onclick = () => ov.remove();
}

// ---------------------------------------------------------------------
// Lajky (kdo mě lajkl)
// ---------------------------------------------------------------------
async function renderLikes() {
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><h1>Lajky</h1><a class="icon-btn" href="#/premium" aria-label="Předplatné">${I.crown({ size: 20, color: '#FBBF24' })}</a></div>
    <div class="scroll pad" id="likesBody" style="padding-top:4px"><div class="empty"><div class="spinner"></div></div></div>
    ${tabbar('likes')}</div>`;
  const body = $('#likesBody');
  const premium = S.plan === 'gold' || S.plan === 'platinum';
  if (!premium) {
    const { data: count } = await sb.rpc('likes_me_count');
    const n = count || 0;
    body.innerHTML = `
      <p class="lead" style="margin-bottom:18px">${n ? `Lajklo tě <b style="color:#fff">${n}</b> ${n === 1 ? 'člověk' : n < 5 ? 'lidi' : 'lidí'}.` : 'Zatím tě nikdo nelajkl. Doplň fotku a popis – pomůže to.'}</p>
      ${n ? `<div class="grid2" aria-hidden="true">${Array.from({ length: Math.min(n, 6) }, () => '<div class="like-tile blur"><div class="shade"></div></div>').join('')}</div>` : ''}
      <div class="panel" style="margin-top:20px;text-align:center">
        <p class="script" style="transform:none">kdo to asi je?</p>
        <h1 style="font-size:22px;margin:4px 0 8px">Uvidíš je všechny s <span style="color:var(--gold)">Gold</span></h1>
        <p class="lead" style="font-size:14px;margin-bottom:14px">Stačí lajknout zpátky a máte shodu.</p>
        <a class="btn btn-primary" href="#/premium">Zobrazit, kdo mě lajkl</a>
      </div>`;
    return;
  }
  const { data, error } = await sb.rpc('likes_me');
  if (error) { body.innerHTML = `<p class="lead">${esc(errText(error))}</p>`; return; }
  if (!data.length) { body.innerHTML = '<div class="empty"><h1>Zatím nic</h1><p class="lead">Jakmile tě někdo lajkne, uvidíš ho tady.</p></div>'; return; }
  body.innerHTML = `<div class="grid2">${data.map((p, i) => `
    <button class="like-tile" data-i="${i}" style="${bgImg(p.photo_url)};border-color:${p.super_liked_me ? '#60A5FA' : 'var(--line-strong)'}" aria-label="${esc(p.name)}, ${esc(p.age)}">
      <div class="shade"></div><span>${esc(p.name)}, ${esc(p.age)}</span></button>`).join('')}</div>`;
  $$('.like-tile', body).forEach((b) => (b.onclick = () => openLikeSheet(data[+b.dataset.i])));
}

function openLikeSheet(p) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(p.name)}">
    <div style="display:flex;gap:14px;align-items:center">
      <div class="avatar ring" style="${bgImg(p.photo_url)}">${p.photo_url ? '' : initial(p.name)}</div>
      <div><b style="font-size:20px">${esc(p.name)}, ${esc(p.age)}</b> ${p.verified ? verifiedBadge(18) : ''}
      <div class="muted small">${esc([p.job, p.city].filter(Boolean).join(' · '))}</div></div>
    </div>
    ${p.bio ? `<p class="lead" style="font-size:14px">${esc(p.bio)}</p>` : ''}
    <div class="row" style="margin-top:6px">
      <button class="btn btn-outline" data-k="pass">Přeskočit</button>
      <button class="btn btn-primary" data-k="like">${I.heart({ size: 20, fill: '#fff' })} Lajknout</button>
    </div></div>`;
  document.body.appendChild(w);
  w.onclick = (e) => { if (e.target === w) w.remove(); };
  $$('[data-k]', w).forEach((b) => (b.onclick = async () => {
    const kind = b.dataset.k;
    const { error } = await sb.from('swipes').insert({ swiper: S.session.user.id, swipee: p.id, kind });
    w.remove();
    if (error) return toast(errText(error));
    if (kind === 'like') await checkMatch(p);
    renderLikes();
  }));
}

// ---------------------------------------------------------------------
// Zprávy
// ---------------------------------------------------------------------
async function renderChats() {
  await loadMatches();
  const fresh = S.matches.filter((m) => !m.last_at);
  const convos = S.matches.filter((m) => m.last_at);
  const read = store.get('jiskra-read', {});
  app.innerHTML = `<div class="screen">
    <div class="topbar"><h1>Zprávy</h1></div>
    <div class="scroll">
      ${fresh.length ? `<p class="label-caps" style="padding:0 24px">Nové shody</p>
      <div class="hscroll">${fresh.map((m) => `
        <a href="#/chat/${m.match_id}"><div class="avatar ring" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>${esc(m.name)}</a>`).join('')}
      </div>` : ''}
      <div class="pad" style="padding-top:${fresh.length ? 20 : 4}px">
        <p class="label-caps" style="margin-bottom:2px">Konverzace</p>
        ${convos.length ? convos.map((m) => {
          const unread = !m.last_from_me && (!read[m.match_id] || read[m.match_id] < m.last_at);
          return `<a class="list-item" href="#/chat/${m.match_id}">
            <div class="avatar" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>
            <div class="body"><div class="top"><span class="title">${esc(m.name)}</span><span class="small muted">${timeLabel(m.last_at)}</span></div>
            <div class="sub ${unread ? 'new' : ''}">${m.last_from_me ? 'Ty: ' : ''}${esc(m.last_body)}</div></div></a>`;
        }).join('') : `<p class="lead" style="margin-top:14px">${fresh.length ? 'Napiš některé ze svých shod nahoře.' : 'Zatím tu nic není. Jdi objevovat a lajkuj lidi, kteří tě zaujmou.'}</p>`}
      </div>
    </div>
    ${tabbar('chats')}</div>`;
}

async function renderChat(matchId) {
  let m = S.matches.find((x) => x.match_id === matchId);
  if (!m) { await loadMatches(); m = S.matches.find((x) => x.match_id === matchId); }
  if (!m) { toast('Tahle konverzace už neexistuje.'); return go('#/chats'); }
  const me = S.session.user.id;
  const seen = new Set();

  app.innerHTML = `<div class="screen" style="height:calc(100dvh - var(--badge) - var(--safe-t))">
    <div class="chat-head">
      <a class="icon-btn ghost" href="#/chats" aria-label="Zpět na zprávy">${I.back({ size: 22, color: '#fff' })}</a>
      <div class="avatar sm" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>
      <div class="who"><b>${esc(m.name)}, ${esc(m.age)} ${m.verified ? verifiedBadge(16) : ''}</b></div>
      <button class="icon-btn ghost" data-act="menu" aria-label="Možnosti – zrušit shodu nebo nahlásit">${I.dots({ size: 22 })}</button>
    </div>
    <div class="messages" id="msgs">
      <div class="notice">${I.shield({ size: 14, color: '#C084FC' })} Shoda ${timeLabel(m.created_at)} · Nikdy neposílej peníze lidem, které neznáš osobně.</div>
    </div>
    <div class="tips" id="tips"></div>
    <form class="composer" id="composer">
      <label for="msgIn" class="sr-only">Napiš zprávu</label>
      <input class="input" id="msgIn" autocomplete="off" maxlength="2000" placeholder="Napiš zprávu…" enterkeyhint="send">
      <button class="send" type="submit" aria-label="Odeslat">${I.send({ size: 20, color: '#fff' })}</button>
    </form>
  </div>`;

  const box = $('#msgs');
  const add = (msg) => {
    if (seen.has(msg.id)) return;
    seen.add(msg.id);
    const el = document.createElement('div');
    el.className = 'msg' + (msg.sender === me ? ' me' : '');
    el.innerHTML = `${esc(msg.body)}<time>${timeLabel(msg.created_at)}</time>`;
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
    const read = store.get('jiskra-read', {}); read[matchId] = msg.created_at; store.set('jiskra-read', read);
    $('#tips').innerHTML = '';
  };

  const { data: msgs } = await sb.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(300);
  (msgs || []).forEach(add);
  const read = store.get('jiskra-read', {}); read[matchId] = new Date().toISOString(); store.set('jiskra-read', read);

  if (!msgs || !msgs.length) {
    const tips = ['Ahoj! Jak se máš? 👋', 'Co tě baví o víkendech?', 'Kafe nebo čaj?'];
    $('#tips').innerHTML = tips.map((t) => `<button type="button">${esc(t)}</button>`).join('');
    $$('#tips button').forEach((b) => (b.onclick = () => { $('#msgIn').value = b.textContent; $('#msgIn').focus(); }));
  }

  S.chatChannel = sb.channel('chat-' + matchId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (p) => add(p.new))
    .subscribe();

  $('#composer').onsubmit = async (e) => {
    e.preventDefault();
    const input = $('#msgIn');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    const { data, error } = await sb.from('messages').insert({ match_id: matchId, sender: me, body }).select().single();
    if (error) { input.value = body; return toast(errText(error)); }
    add(data);
  };

  $('[data-act=menu]').onclick = () => {
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="dialog" aria-label="Možnosti">
      <button class="btn btn-outline" data-k="unmatch">Zrušit shodu</button>
      <button class="btn btn-outline" data-k="report" style="color:#FCA5A5;border-color:#7F1D1D">Nahlásit a zablokovat</button>
      <button class="btn" data-k="close" style="background:transparent;color:var(--muted)">Zavřít</button></div>`;
    document.body.appendChild(w);
    w.onclick = (e) => { if (e.target === w) w.remove(); };
    $('[data-k=close]', w).onclick = () => w.remove();
    $('[data-k=unmatch]', w).onclick = async () => {
      if (!confirm(`Opravdu zrušit shodu s ${m.name}? Konverzace se smaže.`)) return;
      w.remove();
      const { error } = await sb.from('matches').delete().eq('id', matchId);
      if (error) return toast(errText(error));
      await loadMatches(); toast('Shoda zrušena.'); go('#/chats');
    };
    $('[data-k=report]', w).onclick = async () => {
      const reason = prompt('Co se stalo? (např. falešný profil, obtěžování, spam)');
      if (!reason || !reason.trim()) return;
      w.remove();
      const { error } = await sb.from('reports').insert({ reporter: me, reported: m.other_id, reason: reason.trim().slice(0, 500) });
      if (error) return toast(errText(error));
      await sb.from('matches').delete().eq('id', matchId);
      await loadMatches(); toast('Děkujeme, nahlášení prověříme.'); go('#/chats');
    };
  };
}

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------
function renderProfile() {
  const p = S.me;
  const fields = [p.photo_url, p.bio, p.city, p.job, (p.interests || []).length >= 3, p.verified];
  const pct = Math.round((fields.filter(Boolean).length / fields.length) * 100);
  const dash = Math.round(390 * pct / 100);
  app.innerHTML = `${waves('mid')}<div class="screen">
    <div class="topbar"><h1>Profil</h1></div>
    <div class="scroll">
      <div style="display:flex;flex-direction:column;align-items:center;padding-top:6px">
        <div style="position:relative;width:132px;height:132px">
          <svg aria-hidden="true" width="132" height="132" viewBox="0 0 132 132" style="position:absolute;inset:0">
            <circle cx="66" cy="66" r="62" fill="none" stroke="#24153D" stroke-width="6"/>
            <circle cx="66" cy="66" r="62" fill="none" stroke="#A855F7" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash} 390" transform="rotate(-90 66 66)"/></svg>
          <div class="avatar" style="position:absolute;top:12px;left:12px;width:108px;height:108px;font-size:40px;${bgImg(p.photo_url)}">${p.photo_url ? '' : initial(p.name)}</div>
          <span style="position:absolute;left:50%;bottom:-10px;transform:translateX(-50%);padding:4px 10px;border-radius:12px;background:var(--primary);font-size:12px;font-weight:700;white-space:nowrap">${pct} % hotovo</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:22px"><span style="font-size:24px;font-weight:800">${esc(p.name)}, ${ageOf(p.birthdate)}</span>${p.verified ? verifiedBadge(20) : ''}</div>
        <span class="muted" style="font-size:14px;margin-top:2px">${esc([p.city, p.job].filter(Boolean).join(' · '))}</span>
        <a class="btn btn-outline btn-sm" href="#/edit" style="margin-top:14px">Upravit profil</a>
      </div>
      <div class="pad" style="padding-top:22px">
        <a class="promo" href="#/premium">
          <div class="logo-mark" style="width:48px;height:48px;border-radius:16px;background:#2A1650">${I.crown({ size: 26, color: '#FBBF24' })}</div>
          <div style="flex:1">
            ${S.plan
              ? `<b style="font-size:17px">Jiskra <span style="color:var(--gold)">${planName[S.plan]}</span></b><div class="small" style="color:#C9BCE0">Aktivní do ${new Date(S.planUntil).toLocaleDateString('cs-CZ')}</div>`
              : `<b style="font-size:17px">Jiskra <span style="color:var(--gold)">Gold</span></b><div class="small" style="color:#C9BCE0">Uvidíš, kdo tě lajkl, a získáš víc shod</div>`}
          </div>${I.chevron({ size: 20, color: '#C084FC' })}
        </a>
        <div style="margin-top:12px">
          <a class="settings-row" href="#/edit"><span>Koho hledám</span><span class="small muted">${esc(p.min_age)}–${esc(p.max_age)} let</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
          <a class="settings-row" href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener"><span>Ochrana soukromí</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
          <a class="settings-row" href="${esc(C.TERMS_URL)}" target="_blank" rel="noopener"><span>Podmínky používání</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
          <a class="settings-row" href="mailto:${esc(C.SUPPORT_EMAIL)}"><span>Napsat podpoře</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
          <button class="settings-row" data-act="logout"><span>Odhlásit se</span></button>
          <button class="settings-row" data-act="delete" style="color:#FCA5A5"><span>Smazat účet</span></button>
        </div>
      </div>
    </div>
    ${tabbar('profile')}</div>`;
  $('[data-act=logout]').onclick = () => sb.auth.signOut();
  $('[data-act=delete]').onclick = async () => {
    if (!confirm('Opravdu smazat účet? Smaže se profil, shody i všechny zprávy. Nejde to vrátit.')) return;
    if (S.plan) alert('Nezapomeň zrušit předplatné v Google Play (nebo ve správě předplatného), jinak se bude dál strhávat.');
    const { error } = await sb.rpc('delete_my_account');
    if (error) return toast(errText(error));
    await sb.auth.signOut();
    toast('Účet byl smazán.');
  };
}

// ---------------------------------------------------------------------
// Předplatné
// ---------------------------------------------------------------------
const TIERS = {
  plus: ['Neomezené lajky', 'Vrácení posledního swipu', 'Žádné reklamy'],
  gold: ['Vše z Plus', 'Uvidíš, kdo tě lajkl', '5 Super Like každý týden'],
  platinum: ['Vše z Gold', 'Tvoje lajky uvidí jako první', 'Přednostní zobrazení v okolí'],
};
const PERIOD_LABEL = { 1: '1 měsíc', 6: '6 měsíců', 12: '12 měsíců' };
const PERIOD_BADGE = { 1: '', 6: 'Oblíbené', 12: 'Nejvýhodnější' };
// ID produktů v Google Play Console (Monetizace → Předplatná) – musí přesně sedět
const playSku = (tier, months) => `jiskra_${tier}_${months}m`;
const inPlayApp = () => 'getDigitalGoodsService' in window;

function renderPremium() {
  const tier = S.premiumTier, period = S.premiumPeriod;
  const price = C.PRICES[tier][period];
  const total = price * period;
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar">
      <a class="icon-btn" href="#/discover" aria-label="Zavřít">${I.x({ size: 20, color: '#fff' })}</a>
      ${inPlayApp() ? '<button class="link-btn" data-act="restore">Obnovit nákup</button>'
        : C.CUSTOMER_PORTAL_URL && S.plan ? `<a class="link-btn" href="${esc(C.CUSTOMER_PORTAL_URL)}" target="_blank" rel="noopener">Spravovat</a>` : '<span></span>'}
    </div>
    <div class="scroll pad" style="padding-top:0">
      <p class="script" style="font-size:28px">víc shod, méně čekání</p>
      <h1 style="font-size:34px;line-height:1.05;letter-spacing:-.03em">Vyber si své<br><span style="color:var(--accent)">předplatné</span></h1>
      ${S.plan ? `<p class="lead" style="margin-top:10px;font-size:14px">Teď máš <b>${planName[S.plan]}</b> do ${new Date(S.planUntil).toLocaleDateString('cs-CZ')}.</p>` : ''}
      <div class="seg" role="group" aria-label="Tarif" style="margin-top:18px" id="tiers">
        ${Object.keys(TIERS).map((t) => `<button type="button" data-v="${t}" aria-pressed="${t === tier}">${planName[t]}</button>`).join('')}
      </div>
      <div class="panel" style="margin-top:14px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${I.crown({ size: 24, color: tier === 'gold' ? '#FBBF24' : tier === 'plus' ? '#C084FC' : '#E9D5FF' })}<b style="font-size:18px">Jiskra ${planName[tier]}</b></div>
        ${TIERS[tier].map((f) => `<div class="feature"><span class="tick">${I.check({ size: 13, color: '#fff', sw: 3.2 })}</span>${esc(f)}</div>`).join('')}
      </div>
      <div class="periods" role="group" aria-label="Délka předplatného" style="margin-top:20px" id="periods">
        ${[1, 6, 12].map((m) => `<button type="button" class="period" data-v="${m}" aria-pressed="${m === period}">
          ${PERIOD_BADGE[m] ? `<span class="badge">${PERIOD_BADGE[m]}</span>` : ''}
          <span class="small" style="color:#C9BCE0;font-weight:600">${PERIOD_LABEL[m]}</span>
          <span class="price">${C.PRICES[tier][m]}</span><span class="small muted">Kč / měsíc</span></button>`).join('')}
      </div>
      <label class="consent" for="waiver" style="margin-top:20px">
        <input type="checkbox" id="waiver">
        <span>Chci, aby mi placené funkce začaly hned po zaplacení, a beru na vědomí, že tím ztrácím právo odstoupit od smlouvy do 14 dnů. Souhlasím s <a href="${esc(C.TERMS_URL)}" target="_blank" rel="noopener">podmínkami</a>.</span>
      </label>
      <button class="btn btn-primary" data-act="buy" style="margin-top:14px">Pokračovat – ${total.toLocaleString('cs-CZ')} Kč${period > 1 ? ' za ' + PERIOD_LABEL[period] : ''}</button>
      <p class="small muted" style="text-align:center;margin:10px 0 24px">Předplatné se automaticky obnovuje. Zrušit ho můžeš kdykoli – v Google Play (Účet → Platby a předplatná) nebo ve správě předplatného.</p>
    </div></div>`;

  $$('#tiers button').forEach((b) => (b.onclick = () => { S.premiumTier = b.dataset.v; renderPremium(); }));
  $$('#periods button').forEach((b) => (b.onclick = () => { S.premiumPeriod = +b.dataset.v; renderPremium(); }));
  $('[data-act=buy]').onclick = () => {
    if (!$('#waiver').checked) return toast('Nejdřív zaškrtni souhlas nad tlačítkem.');
    return inPlayApp() ? buyWithPlay(tier, period) : buyWithStripe(tier, period);
  };
  const restore = $('[data-act=restore]');
  if (restore) restore.onclick = restorePlay;
}

function buyWithStripe(tier, period) {
  const link = C.PAYMENT_LINKS[tier] && C.PAYMENT_LINKS[tier][period];
  if (!link) return toast('Platby brzy spustíme.');
  const url = new URL(link);
  url.searchParams.set('client_reference_id', S.session.user.id);
  if (S.session.user.email) url.searchParams.set('prefilled_email', S.session.user.email);
  location.href = url.toString();
}

// Google Play Billing (funguje v Android aplikaci z PWABuilderu)
async function buyWithPlay(tier, period) {
  const sku = playSku(tier, period);
  try {
    const service = await window.getDigitalGoodsService('https://play.google.com/billing');
    const [details] = await service.getDetails([sku]);
    if (!details) return toast('Tento tarif zatím není v Google Play dostupný.');
    const request = new PaymentRequest(
      [{ supportedMethods: 'https://play.google.com/billing', data: { sku } }],
      { total: { label: 'Celkem', amount: { currency: details.price.currency, value: details.price.value } } },
    );
    const response = await request.show();
    const { purchaseToken } = response.details;
    const { error } = await sb.functions.invoke('play-verify', { body: { sku, purchaseToken } });
    if (error) { await response.complete('fail'); return toast('Platbu se nepodařilo ověřit. Zkus „Obnovit nákup“.'); }
    await response.complete('success');
    await loadMe();
    toast(`Máš Jiskru ${planName[tier]}! 💜`);
    go('#/discover');
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    toast(errText(err));
  }
}

async function restorePlay() {
  try {
    const service = await window.getDigitalGoodsService('https://play.google.com/billing');
    const purchases = await service.listPurchases();
    if (!purchases.length) return toast('Nenašli jsme žádné aktivní předplatné.');
    for (const p of purchases) {
      await sb.functions.invoke('play-verify', { body: { sku: p.itemId, purchaseToken: p.purchaseToken } });
    }
    await loadMe();
    toast(S.plan ? `Obnoveno: Jiskra ${planName[S.plan]}` : 'Předplatné už vypršelo.');
    renderPremium();
  } catch (err) {
    toast(errText(err));
  }
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
async function boot() {
  loading();
  if (!configured) return route();
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  await loadMe().catch((e) => toast(errText(e)));
  route();

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      const pw = prompt('Zadej nové heslo (aspoň 6 znaků):');
      if (pw && pw.length >= 6) {
        const { error } = await sb.auth.updateUser({ password: pw });
        toast(error ? errText(error) : 'Heslo změněno.');
      }
    }
    const changed = (session && session.user.id) !== (S.session && S.session.user.id);
    S.session = session;
    if (!changed) return;
    if (!session) {
      if (S.globalChannel) { sb.removeChannel(S.globalChannel); S.globalChannel = null; }
      Object.assign(S, { me: null, plan: null, candidates: [], matches: [], lastSwiped: null });
      location.hash = '';
      return route();
    }
    loading();
    await loadMe().catch((e) => toast(errText(e)));
    route();
  });

  window.addEventListener('hashchange', route);
}

boot();
