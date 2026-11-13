// =====================================================================
// Jiskra – seznamka (PWA) · verze 3
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import * as C from './config.js';

const app = document.getElementById('app');
// Na bezplatném Netlify je dole odznak – necháme pod menu volné místo
if (location.hostname.endsWith('netlify.app')) document.documentElement.classList.add('has-badge');

const configured = !C.SUPABASE_URL.includes('DOPLN') && !C.SUPABASE_ANON_KEY.includes('DOPLN');
const sb = configured ? createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

const S = {
  session: null, me: null, plan: null, planUntil: null,
  candidates: [], loadingCandidates: false, lastSwiped: null,
  matches: [], chatChannel: null, globalChannel: null,
  premiumTier: 'gold', premiumPeriod: 6,
};

// ---------------------------------------------------------------------
// Data: zájmy, otázky do profilu, typy osobnosti
// ---------------------------------------------------------------------
const INTERESTS = ['Cestování', 'Hory', 'Příroda', 'Káva', 'Vaření', 'Hudba', 'Koncerty', 'Festivaly', 'Sport', 'Běh', 'Fitness',
  'Jóga', 'Kolo', 'Lyže', 'Knihy', 'Film', 'Seriály', 'Hry', 'Tanec', 'Umění', 'Fotografie', 'Psi', 'Kočky', 'Víno', 'Pivo',
  'Technologie', 'Móda', 'Divadlo', 'Podcasty', 'Zahrada', 'Auta', 'Motorky', 'Rybaření', 'Meditace', 'Dobrovolnictví'];

const PROMPTS = ['Ideální rande je…', 'Nejvíc mě rozesměje…', 'Hledám někoho, kdo…', 'V neděli ráno mě najdeš…',
  'Neodolám…', 'Moje skrytá schopnost je…', 'Zelená vlajka, kterou hledám…', 'Překvapí tě, že…',
  'Kdybych vyhrál(a) v loterii…', 'Dvě pravdy a jedna lež…', 'Moje nejlepší historka z cest…',
  'Tohle chci letos zažít…', 'Můj comfort food je…', 'Na prvním rande se zeptám…', 'Nejlepší rada, jakou jsem dostal(a)…'];

const TYPES = {
  INTJ: 'Stratég', INTP: 'Myslitel', ENTJ: 'Vůdce', ENTP: 'Vynálezce',
  INFJ: 'Vizionář', INFP: 'Snílek', ENFJ: 'Mentor', ENFP: 'Nadšenec',
  ISTJ: 'Spolehlivý', ISFJ: 'Pečovatel', ESTJ: 'Organizátor', ESFJ: 'Hostitel',
  ISTP: 'Kutil', ISFP: 'Umělec', ESTP: 'Akční', ESFP: 'Bavič',
};
const QUIZ = [
  ['Po náročném týdnu si nejlépe odpočinu…', 's přáteli venku', 'doma v klidu', 'E', 'I'],
  ['Víc mě baví…', 'konkrétní fakta a zkušenosti', 'nápady a možnosti', 'S', 'N'],
  ['Při rozhodování dám víc na…', 'logiku a argumenty', 'pocity lidí kolem', 'T', 'F'],
  ['Můj víkend…', 'mám rád(a) naplánovaný', 'nechávám spontánní', 'J', 'P'],
  ['Na večírku…', 'se seznamuji s novými lidmi', 'držím se lidí, které znám', 'E', 'I'],
  ['Při plánování výletu…', 'řeším praktické detaily', 'sním o zážitcích', 'S', 'N'],
  ['Když se kamarád svěří s problémem…', 'hledám řešení', 'hlavně ho vyslechnu', 'T', 'F'],
  ['Úkoly dělám…', 's předstihem', 'na poslední chvíli', 'J', 'P'],
];
const MODES = { laska: 'Láska', pratele: 'Přátelé', oboje: 'Láska i přátelé' };
const VERIFY_POSES = ['palec nahoru 👍', 'mávající ruku 👋', 'dva prsty do V ✌️', 'ruku u brady 🤔'];
const REACTIONS = ['❤️', '😂', '😮', '😢', '🔥', '👍'];

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
const uid = () => S.session.user.id;

function zodiacOf(d) {
  if (!d) return null;
  const x = new Date(d), m = x.getMonth() + 1, day = x.getDate();
  const z = [[1, 20, 'Kozoroh'], [2, 19, 'Vodnář'], [3, 21, 'Ryby'], [4, 20, 'Beran'], [5, 21, 'Býk'], [6, 21, 'Blíženci'],
    [7, 23, 'Rak'], [8, 23, 'Lev'], [9, 23, 'Panna'], [10, 23, 'Váhy'], [11, 22, 'Štír'], [12, 22, 'Střelec'], [13, 1, 'Kozoroh']];
  for (const [mm, dd, name] of z) if (m < mm || (m === mm && day < dd)) return name;
  return 'Kozoroh';
}

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
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Včera';
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

function msgPreview(m) {
  const t = m.media_type || m.kind;
  if (t === 'audio') return '🎤 Hlasová zpráva';
  if (t === 'sticker') return '✨ Nálepka';
  if (t === 'image' || t === 'photo') return '📷 Fotka';
  return String(m.body || '').slice(0, 60);
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
  if (m.includes('blocked')) return 'S tímhle člověkem už nemůžeš komunikovat.';
  if (m.includes('bad_media') || m.includes('bad_sticker')) return 'Tuhle přílohu nejde poslat.';
  if (m.includes('premium_required')) return 'Tahle funkce je v předplatném Gold.';
  if (m.includes('banned')) return 'Tvůj účet je zablokovaný.';
  if (m.includes('too_many_photos')) return 'Maximálně 6 fotek.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Nejde se připojit. Zkontroluj internet.';
  return 'Něco se pokazilo: ' + m;
}

async function resizeImage(file, max = 1280) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
}

async function uploadPhoto(file, folder = '') {
  const blob = await resizeImage(file);
  const path = `${uid()}/${folder}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
}

// Vlastní dialogy (místo prompt/confirm)
function dialog({ title, text = '', input = false, placeholder = '', ok = 'OK', cancel = 'Zrušit', danger = false }) {
  return new Promise((resolve) => {
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dlgT">
      <h2 id="dlgT" style="margin:0;font-size:20px">${esc(title)}</h2>
      ${text ? `<p class="lead" style="font-size:15px">${esc(text)}</p>` : ''}
      ${input ? `<label class="sr-only" for="dlgIn">${esc(title)}</label><textarea class="input" id="dlgIn" maxlength="500" placeholder="${esc(placeholder)}" style="height:100px"></textarea>` : ''}
      <div class="row" style="margin-top:6px">
        ${cancel ? `<button class="btn btn-outline" data-k="no">${esc(cancel)}</button>` : ''}
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-k="yes">${esc(ok)}</button>
      </div></div>`;
    document.body.appendChild(w);
    const done = (v) => { w.remove(); resolve(v); };
    w.onclick = (e) => { if (e.target === w) done(input ? null : false); };
    const no = $('[data-k=no]', w); if (no) no.onclick = () => done(input ? null : false);
    $('[data-k=yes]', w).onclick = () => done(input ? ($('#dlgIn', w).value.trim() || null) : true);
    if (input) setTimeout(() => $('#dlgIn', w).focus(), 50);
  });
}

// ---------------------------------------------------------------------
// Ikony
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
  image: (o) => svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>', o),
  check: (o) => svg('<path d="M5 12l5 5 9-10"/>', o),
  arrow: (o) => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', o),
  info: (o) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>', o),
  bell: (o) => svg('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>', o),
  brain: (o) => svg('<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>', o),
  moon: (o) => svg('<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/>', o),
  users: (o) => svg('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 2 5 5"/>', o),
  gear: (o) => svg('<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>', o),
  eye: (o) => svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', o),
  plus: (o) => svg('<path d="M12 5v14M5 12h14"/>', o),
  bolt: (o) => svg('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', o),
  mic: (o) => svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', o),
  video: (o) => svg('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>', o),
  phoneOff: (o) => svg('<path d="M3 15c5-5 13-5 18 0l-2 3-4-1v-3c-2-.7-4-.7-6 0v3l-4 1z"/>', o),
  smile: (o) => svg('<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9.5v.5M15 9.5v.5"/>', o),
  ban: (o) => svg('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>', o),
  lock: (o) => svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', o),
  ruler: (o) => svg('<path d="M4 17L17 4l3 3L7 20z"/><path d="M8 13l2 2M11 10l2 2M14 7l2 2"/>', o),
  cap: (o) => svg('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>', o),
  target: (o) => svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', o),
  glass: (o) => svg('<path d="M7 3h10l-1 8a4 4 0 0 1-8 0zM12 15v6M8 21h8"/>', o),
  smoke: (o) => svg('<path d="M3 16h14v3H3zM19 16v3M21 16v3M18 13c0-2 2-2 2-4s-2-2-2-4"/>', o),
  baby: (o) => svg('<circle cx="12" cy="7" r="4"/><path d="M6 21c0-4 3-7 6-7s6 3 6 7"/>', o),
  pray: (o) => svg('<path d="M12 3v18M7 8h10"/>', o),
  pause: (o) => svg('<path d="M9 5v14M15 5v14"/>', o),
  mail: (o) => svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', o),
  key: (o) => svg('<circle cx="8" cy="14" r="4"/><path d="M11 11l9-9M17 5l2 2M15 7l2 2"/>', o),
  trash: (o) => svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', o),
  logout: (o) => svg('<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>', o),
};

// Detaily profilu (hodnoty odpovídají kontrolám v databázi)
const GOALS = { vztah: 'Vážný vztah', neco_volneho: 'Něco volnějšího', pratelstvi: 'Přátelství', nevim: 'Ještě nevím' };
const EDU = { zakladni: 'Základní', stredni: 'Střední', vysoka: 'Vysoká škola', student: 'Studuji' };
const SMOKE = { ne: 'Nekouřím', obcas: 'Příležitostně', ano: 'Kouřím' };
const DRINK = { ne: 'Nepiju', obcas: 'Příležitostně', ano: 'Rád(a) si dám' };
const KIDS = { nemam_chci: 'Nemám, ale chci', nemam_nechci: 'Nemám a nechci', mam: 'Mám děti', nevim: 'Ještě nevím' };
const RELIGION = { zadne: 'Bez vyznání', krestanstvi: 'Křesťanství', jine: 'Jiné', nechci_rict: 'Nechci říct' };
const DETAILS = [
  ['goal', 'Co hledám', GOALS, 'target'], ['education', 'Vzdělání', EDU, 'cap'], ['smoking', 'Kouření', SMOKE, 'smoke'],
  ['drinking', 'Alkohol', DRINK, 'glass'], ['kids', 'Děti', KIDS, 'baby'], ['religion', 'Víra', RELIGION, 'pray'],
];

// Poskytovatelé přihlášení – zobrazí se jen ty, které jsou zapnuté v Supabase
const PROVIDERS = {
  google: { name: 'Google', cls: 'g', icon: '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>' },
  facebook: { name: 'Facebook', cls: 'fb', icon: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6z"/></svg>' },
  apple: { name: 'Apple', cls: 'apple', icon: '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#000" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9-1.2-1.8-3.1-2-3.7-2-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9C5.9 6.8 4 8 3 9.8c-2 3.5-.5 8.6 1.4 11.4.9 1.4 2 2.9 3.5 2.8 1.4-.1 1.9-.9 3.6-.9s2.1.9 3.6.9c1.5 0 2.4-1.4 3.3-2.7 1-1.6 1.5-3.1 1.5-3.2-.1 0-2.5-1-2.5-3.5zM13.8 4.9c.8-.9 1.3-2.2 1.2-3.4-1.1 0-2.4.7-3.2 1.6-.7.8-1.3 2.1-1.2 3.3 1.2.1 2.4-.6 3.2-1.5z"/></svg>' },
  azure: { name: 'Microsoft', cls: 'ms', icon: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#F25022" d="M2 2h9.5v9.5H2z"/><path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z"/><path fill="#00A4EF" d="M2 12.5h9.5V22H2z"/><path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z"/></svg>' },
  discord: { name: 'Discord', cls: 'dc', icon: '' }, twitter: { name: 'X (Twitter)', cls: 'x', icon: '' },
  spotify: { name: 'Spotify', cls: 'sp', icon: '' }, linkedin_oidc: { name: 'LinkedIn', cls: 'li', icon: '' },
  twitch: { name: 'Twitch', cls: 'tw', icon: '' }, github: { name: 'GitHub', cls: 'gh', icon: '' },
};
const PROVIDER_ORDER = ['google', 'facebook', 'apple', 'azure', 'twitter', 'discord', 'spotify', 'linkedin_oidc', 'twitch', 'github'];
let enabledProviders = null;
async function loadProviders() {
  if (enabledProviders) return enabledProviders;
  try {
    const r = await fetch(`${C.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: C.SUPABASE_ANON_KEY } });
    const j = await r.json();
    enabledProviders = PROVIDER_ORDER.filter((k) => j.external && j.external[k]);
  } catch { enabledProviders = (C.AUTH_PROVIDERS || []).slice(); }
  return enabledProviders;
}
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
  const unread = S.matches.reduce((n, m) => n + (m.unread || 0), 0);
  const t = (hash, key, label, icon) => `
    <a href="${hash}" ${active === key ? 'aria-current="page"' : ''}>
      ${icon({ color: active === key ? '#C084FC' : '#A897C4' })}${label}
      ${key === 'chats' && unread ? `<span class="dot">${unread > 99 ? '99+' : unread}</span>` : ''}
    </a>`;
  return `<nav class="tabbar" aria-label="Hlavní menu">
    ${t('#/discover', 'discover', 'Objevuj', I.flame)}
    ${t('#/likes', 'likes', 'Lajky', I.heartLine)}
    ${t('#/chats', 'chats', 'Zprávy', I.chat)}
    ${t('#/profile', 'profile', 'Profil', I.user)}
  </nav>`;
}
function updateTabbar() { const nav = $('.tabbar'); if (nav) nav.outerHTML = tabbar(currentView()); }
const currentView = () => (location.hash.replace('#/', '').split('/')[0] || 'discover');

function loading() {
  app.innerHTML = `<div class="splash">${logo(72)}</div>`;
  $('.logo-mark', app).classList.add('big');
}

// ---------------------------------------------------------------------
// Uživatel, poloha, aktivita, notifikace
// ---------------------------------------------------------------------
async function loadMe() {
  if (!S.session) { S.me = null; S.plan = null; return; }
  const [{ data: me }, { data: sub }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid()).maybeSingle(),
    sb.from('subscriptions').select('plan, valid_until').eq('user_id', uid()).maybeSingle(),
  ]);
  S.me = me || null;
  S.plan = sub && new Date(sub.valid_until) > new Date() ? sub.plan : null;
  S.planUntil = sub ? sub.valid_until : null;
  if (S.me && !S.me.banned) {
    await loadMatches();
    subscribeGlobal();
    subscribeRing();
    touchActive();
    refreshLocation(false);
  }
}

async function loadMatches() {
  const { data, error } = await sb.rpc('my_matches3');
  if (!error) S.matches = data || [];
}

function touchActive() {
  const last = store.get('jiskra-touch', 0);
  if (Date.now() - last < 10 * 60 * 1000) return;
  store.set('jiskra-touch', Date.now());
  sb.from('profiles').update({ last_active: new Date().toISOString() }).eq('id', uid()).then(() => {});
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no_geo'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), reject, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30 * 60 * 1000 });
  });
}

// ask=true: zeptá se na povolení; ask=false: jen když už je povolené
async function refreshLocation(ask) {
  try {
    if (!ask) {
      if (!navigator.permissions) return false;
      const st = await navigator.permissions.query({ name: 'geolocation' });
      if (st.state !== 'granted') return false;
      const last = store.get('jiskra-geo', 0);
      if (Date.now() - last < 60 * 60 * 1000 && S.me && S.me.lat) return true;
    }
    const c = await getPosition();
    store.set('jiskra-geo', Date.now());
    if (S.me) {
      await sb.from('profiles').update({ lat: c.latitude, lng: c.longitude }).eq('id', uid());
      S.me.lat = Math.round(c.latitude * 100) / 100; S.me.lng = Math.round(c.longitude * 100) / 100;
    }
    return { lat: c.latitude, lng: c.longitude };
  } catch {
    return false;
  }
}

function b64ToU8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((ch) => ch.charCodeAt(0)));
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!C.VAPID_PUBLIC_KEY;

const swReady = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('Service worker není připravený, zkus to za chvíli.')), 5000))]);

async function pushEnabled() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return false;
    const reg = await swReady();
    return !!(await reg.pushManager.getSubscription());
  } catch { return false; }
}

async function enablePush() {
  if (!pushSupported()) { toast('Tenhle prohlížeč notifikace neumí.'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Notifikace jsou zakázané v nastavení telefonu.'); return false; }
  let reg;
  try { reg = await swReady(); } catch (e) { toast(e.message); return false; }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(C.VAPID_PUBLIC_KEY) });
  const j = sub.toJSON();
  const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: uid(), p256dh: j.keys.p256dh, auth: j.keys.auth });
  if (error) { toast(errText(error)); return false; }
  toast('Notifikace zapnuty 🔔');
  return true;
}

async function disablePush() {
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    toast('Notifikace vypnuty.');
  } catch (e) { toast(errText(e)); }
}

function subscribeGlobal() {
  if (S.globalChannel) return;
  S.globalChannel = sb.channel('jiskra-global')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, async () => {
      await loadMatches();
      toast('Máš novou shodu! 💜');
      if (currentView() === 'chats') renderChats(); else updateTabbar();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (p) => {
      const openChat = location.hash.startsWith('#/chat/') && location.hash.split('/')[2] === p.new.match_id;
      if (openChat) return;
      await loadMatches();
      if (p.new.sender !== uid()) {
        const m = S.matches.find((x) => x.match_id === p.new.match_id);
        toast(`${m ? m.name : 'Nová zpráva'}: ${msgPreview(p.new)}`);
      }
      if (currentView() === 'chats') renderChats(); else updateTabbar();
    })
    .subscribe();
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------
async function route() {
  if (S.chatChannel) { sb.removeChannel(S.chatChannel); S.chatChannel = null; }
  $$('.sheet-wrap, .overlay:not(.call-in), .detail').forEach((el) => el.remove());
  window.scrollTo(0, 0);
  if (!configured) return renderSetup();
  if (!S.session) return renderAuth();
  if (!S.me) return renderWizard();
  if (S.me.banned) return renderBanned();
  const [view, arg] = location.hash.replace('#/', '').split('/');
  switch (view) {
    case 'likes': return renderLikes();
    case 'chats': return renderChats();
    case 'chat': return renderChat(arg);
    case 'profile': return renderProfile();
    case 'edit': return renderEdit();
    case 'premium': return renderPremium();
    case 'verify': return renderVerify();
    case 'filters': return renderFilters();
    case 'settings': return renderSettings();
    case 'admin': return S.me.is_admin ? renderAdmin(arg || 'stats') : go('#/profile');
    default: return renderDiscover();
  }
}

function renderSetup() {
  app.innerHTML = `${waves()}<div class="screen pad" style="justify-content:center;gap:16px">
    <div class="brand">${logo()}<div><div class="brand-name">Jiskra</div><div class="brand-sub">seznamka</div></div></div>
    <h1>Skoro hotovo</h1>
    <p class="lead">Aplikace ještě není propojená s databází. Vyplň <b>config.js</b> (návod v NAVOD.md).</p></div>`;
}

function renderBanned() {
  app.innerHTML = `${waves('mid')}<div class="screen pad" style="justify-content:center;gap:16px;text-align:center;align-items:center">
    ${I.shield({ size: 56, color: '#F87171' })}
    <h1>Účet je zablokovaný</h1>
    <p class="lead">Tvůj účet byl zablokován kvůli porušení podmínek používání. Pokud si myslíš, že jde o omyl, napiš nám na <a href="mailto:${esc(C.SUPPORT_EMAIL)}">${esc(C.SUPPORT_EMAIL)}</a>.</p>
    <button class="btn btn-outline btn-sm" data-act="logout">Odhlásit se</button></div>`;
  $('[data-act=logout]').onclick = () => sb.auth.signOut();
}

// ---------------------------------------------------------------------
// Přihlášení / registrace
// ---------------------------------------------------------------------
function renderAuth(mode = 'welcome') {
  if (mode === 'welcome') {
    app.innerHTML = `${waves()}
    <div class="screen pad" style="padding-top:40px;padding-bottom:calc(32px + var(--safe-b))">
      <div class="brand">${logo(44)}<div><div class="brand-name">Jiskra</div><div class="brand-sub">seznamka</div></div></div>
      <div style="margin-top:56px">
        <p class="script">ahoj, rádi tě poznáme!</p>
        <h1 class="hero-title">Najdi svou<br><em>jiskru</em></h1>
        <div class="bar"></div>
        <p class="lead">Lidé ve tvém okolí, ověřené profily a kompatibilita podle osobnosti. Na lásku i nová přátelství.</p>
      </div>
      <div class="feature-row">
        <div>${I.shield({ size: 22, color: '#C084FC' })}<span>Ověřené profily</span></div>
        <div>${I.pin({ size: 22, color: '#C084FC' })}<span>Lidé v okolí</span></div>
        <div>${I.brain({ size: 22, color: '#C084FC' })}<span>Typy osobnosti</span></div>
      </div>
      <div style="flex:1;min-height:28px"></div>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div id="socials" style="display:flex;flex-direction:column;gap:12px"></div>
        <button class="btn btn-primary" data-act="signup">Pokračovat e-mailem ${I.arrow({ size: 18, color: '#fff' })}</button>
        <button class="link-btn" data-act="signin" style="align-self:center">Už mám účet s e-mailem – přihlásit se</button>
        <p class="small muted" style="text-align:center;margin:6px 0 0">Pokračováním souhlasíš s <a href="${esc(C.TERMS_URL)}" target="_blank" rel="noopener">podmínkami</a> a <a href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener">zásadami ochrany soukromí</a>. Jen pro 18+.</p>
      </div>
    </div>`;
    $('[data-act=signup]').onclick = () => renderAuth('signup');
    $('[data-act=signin]').onclick = () => renderAuth('signin');
    loadProviders().then((list) => {
      const box = $('#socials'); if (!box) return;
      box.innerHTML = list.map((k) => `<button class="btn btn-social ${PROVIDERS[k].cls}" data-oauth="${k}">${PROVIDERS[k].icon}<span>Pokračovat přes ${PROVIDERS[k].name}</span></button>`).join('');
      $$('[data-oauth]', box).forEach((b) => (b.onclick = () => oauth(b.dataset.oauth)));
    });
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

async function oauth(provider) {
  const opts = { redirectTo: location.origin + location.pathname };
  if (provider === 'facebook') opts.scopes = 'email,public_profile';
  const { error } = await sb.auth.signInWithOAuth({ provider, options: opts });
  if (error) {
    const m = String(error.message || '');
    const n = (PROVIDERS[provider] || { name: provider }).name;
    toast(/not enabled|Unsupported provider/i.test(m) ? `Přihlášení přes ${n} zatím není zapnuté. Použij e-mail.` : errText(error), 4000);
  }
}

// ---------------------------------------------------------------------
// Sdílené části formulářů
// ---------------------------------------------------------------------
function photoGridHTML(photos) {
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const p = photos[i];
    slots.push(p
      ? `<div class="pslot has" style="${bgImg(p)}">
           ${i === 0 ? '<span class="pmain">Hlavní</span>' : `<button type="button" class="pstar" data-main="${i}" aria-label="Nastavit jako hlavní">${I.star({ size: 14, fill: '#fff' })}</button>`}
           <button type="button" class="pdel" data-del="${i}" aria-label="Smazat fotku">${I.x({ size: 14, color: '#fff', sw: 3 })}</button>
         </div>`
      : `<label class="pslot ${i === photos.length ? 'next' : ''}">${I.plus({ size: 26, color: '#A897C4' })}
           <input type="file" accept="image/*" class="sr-only" data-add>
           <span class="sr-only">Přidat fotku</span></label>`);
  }
  return `<div class="pgrid">${slots.join('')}</div>`;
}

function bindPhotoGrid(root, photos, rerender) {
  $$('[data-del]', root).forEach((b) => (b.onclick = () => { photos.splice(+b.dataset.del, 1); rerender(); }));
  $$('[data-main]', root).forEach((b) => (b.onclick = () => { const [x] = photos.splice(+b.dataset.main, 1); photos.unshift(x); rerender(); }));
  $$('[data-add]', root).forEach((inp) => (inp.onchange = async () => {
    const files = Array.from(inp.files || []).slice(0, 6 - photos.length);
    if (!files.length) return;
    const lbl = inp.closest('.pslot'); lbl.innerHTML = '<div class="spinner"></div>';
    try {
      for (const f of files) photos.push(await uploadPhoto(f));
    } catch (e) { toast(errText(e)); }
    rerender();
  }));
}

function promptsEditorHTML(prompts) {
  return `<div class="prompts-ed">
    ${prompts.map((p, i) => `<div class="prompt-card ed">
      <div class="pq">${esc(p.q)}</div>
      <label class="sr-only" for="pa${i}">Odpověď</label>
      <textarea class="input" id="pa${i}" data-pa="${i}" maxlength="150" placeholder="Tvoje odpověď…">${esc(p.a)}</textarea>
      <button type="button" class="link-btn" data-prm="${i}" style="font-size:13px;padding:4px 0">Odebrat</button>
    </div>`).join('')}
    ${prompts.length < 3 ? `<button type="button" class="btn btn-outline btn-sm" data-addprompt>${I.plus({ size: 18 })} Přidat otázku (${prompts.length}/3)</button>` : ''}
  </div>`;
}

function bindPrompts(root, prompts, rerender) {
  $$('[data-pa]', root).forEach((t) => (t.oninput = () => { prompts[+t.dataset.pa].a = t.value; }));
  $$('[data-prm]', root).forEach((b) => (b.onclick = () => { prompts.splice(+b.dataset.prm, 1); rerender(); }));
  const add = $('[data-addprompt]', root);
  if (add) add.onclick = () => {
    const used = new Set(prompts.map((p) => p.q));
    const w = document.createElement('div');
    w.className = 'sheet-wrap';
    w.innerHTML = `<div class="sheet" role="dialog" aria-label="Vyber otázku" style="max-height:80vh;overflow:auto">
      <h2 style="margin:0 0 4px;font-size:20px">Vyber otázku</h2>
      ${PROMPTS.filter((q) => !used.has(q)).map((q) => `<button class="settings-row" data-q="${esc(q)}"><span>${esc(q)}</span>${I.chevron({ size: 18, color: '#A897C4' })}</button>`).join('')}
    </div>`;
    document.body.appendChild(w);
    w.onclick = (e) => { if (e.target === w) w.remove(); };
    $$('[data-q]', w).forEach((b) => (b.onclick = () => { prompts.push({ q: b.dataset.q, a: '' }); w.remove(); rerender(); }));
  };
}

function personalityPickerHTML(type) {
  return `<div class="ptypes">${Object.keys(TYPES).map((t) => `<button type="button" class="ptype" data-type="${t}" aria-pressed="${t === type}"><b>${t}</b><span>${TYPES[t]}</span></button>`).join('')}</div>
    <button type="button" class="link-btn" data-quiz style="margin-top:6px">Neznáš svůj typ? Udělej rychlý test (1 min)</button>`;
}

function runQuiz() {
  return new Promise((resolve) => {
    const answers = [];
    const w = document.createElement('div');
    w.className = 'overlay';
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-label', 'Test osobnosti');
    document.body.appendChild(w);
    const step = () => {
      const i = answers.length;
      if (i === QUIZ.length) {
        const pick = (a, b, q1) => { const n = answers.filter((x) => x === a).length, m = answers.filter((x) => x === b).length; return n === m ? answers[q1] : n > m ? a : b; };
        const t = pick('E', 'I', 0) + pick('S', 'N', 1) + pick('T', 'F', 2) + pick('J', 'P', 3);
        w.innerHTML = `${waves('mid')}<div style="position:relative;max-width:360px;width:100%">
          <p class="script" style="transform:none">tvůj typ je</p>
          <h1 style="font-size:56px;margin:6px 0">${t}</h1>
          <p class="lead" style="font-size:20px;color:#fff;font-weight:700">${TYPES[t]}</p>
          <p class="lead" style="margin:10px 0 26px">Podle typu ti Jiskra ukáže, jak moc si s ostatními sedíte.</p>
          <button class="btn btn-primary" data-ok>Použít ${t}</button>
          <button class="btn btn-outline" data-no style="margin-top:10px">Zavřít</button></div>`;
        $('[data-ok]', w).onclick = () => { w.remove(); resolve(t); };
        $('[data-no]', w).onclick = () => { w.remove(); resolve(null); };
        return;
      }
      const [q, a, b, la, lb] = QUIZ[i];
      w.innerHTML = `${waves('mid')}<div style="position:relative;max-width:380px;width:100%;text-align:left">
        <div class="wiz-bar"><div style="width:${Math.round((i / QUIZ.length) * 100)}%"></div></div>
        <p class="muted small" style="margin:18px 0 6px">Otázka ${i + 1} z ${QUIZ.length}</p>
        <h1 style="font-size:26px;margin-bottom:22px">${esc(q)}</h1>
        <button class="btn btn-outline quiz-opt" data-v="${la}">${esc(a)}</button>
        <button class="btn btn-outline quiz-opt" data-v="${lb}" style="margin-top:12px">${esc(b)}</button>
        <button class="link-btn" data-close style="margin-top:18px">Zrušit test</button></div>`;
      $$('[data-v]', w).forEach((btn) => (btn.onclick = () => { answers.push(btn.dataset.v); step(); }));
      $('[data-close]', w).onclick = () => { w.remove(); resolve(null); };
    };
    step();
  });
}

function bindPersonality(root, get, set) {
  $$('[data-type]', root).forEach((b) => (b.onclick = () => {
    const t = get() === b.dataset.type ? null : b.dataset.type;
    set(t);
    $$('[data-type]', root).forEach((x) => x.setAttribute('aria-pressed', x.dataset.type === t));
  }));
  const q = $('[data-quiz]', root);
  if (q) q.onclick = async () => {
    const t = await runQuiz();
    if (t) { set(t); $$('[data-type]', root).forEach((x) => x.setAttribute('aria-pressed', x.dataset.type === t)); }
  };
}

const segHTML = (id, opts, val) => `<div class="seg" role="group" id="${id}">${Object.entries(opts).map(([k, v]) => `<button type="button" data-v="${k}" aria-pressed="${k === val}">${v}</button>`).join('')}</div>`;
function bindSeg(id, onChange) {
  $$(`#${id} button`).forEach((b) => (b.onclick = () => {
    $$(`#${id} button`).forEach((x) => x.setAttribute('aria-pressed', x === b));
    onChange(b.dataset.v);
  }));
}
const chipsHTML = (chosen) => `<div class="chips" id="ints">${INTERESTS.map((i) => `<button type="button" class="chip" data-v="${esc(i)}" aria-pressed="${chosen.has(i)}">${esc(i)}</button>`).join('')}</div>`;
function bindChips(chosen) {
  $$('#ints button').forEach((b) => (b.onclick = () => {
    const v = b.dataset.v;
    if (chosen.has(v)) chosen.delete(v); else { if (chosen.size >= 8) return toast('Maximálně 8 zájmů.'); chosen.add(v); }
    b.setAttribute('aria-pressed', chosen.has(v));
  }));
}

// Detaily profilu (výška, cíl, vzdělání…) – výběr z možností, dalším klepnutím zrušíš
function detailsEditorHTML(v) {
  return `<div class="field"><label for="d-height">Výška: <b id="d-heightv">${v.height_cm ? v.height_cm + ' cm' : 'neuvedeno'}</b></label>
      <input type="range" class="range" id="d-height" min="140" max="210" value="${v.height_cm || 175}"></div>
    ${DETAILS.map(([k, label, opts]) => `<div class="field"><span class="lbl">${label}</span>
      <div class="chips" data-detail="${k}">${Object.entries(opts).map(([ok, ov]) => `<button type="button" class="chip" data-v="${ok}" aria-pressed="${v[k] === ok}">${ov}</button>`).join('')}</div></div>`).join('')}`;
}
function bindDetails(root, v) {
  const h = $('#d-height', root);
  if (h) h.oninput = () => { v.height_cm = +h.value; $('#d-heightv', root).textContent = h.value + ' cm'; };
  $$('[data-detail]', root).forEach((g) => $$('button', g).forEach((b) => (b.onclick = () => {
    const k = g.dataset.detail; v[k] = v[k] === b.dataset.v ? null : b.dataset.v;
    $$('button', g).forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === v[k]));
  })));
}
const pickDetails = (v) => ({ height_cm: v.height_cm || null, goal: v.goal || null, education: v.education || null, smoking: v.smoking || null,
  drinking: v.drinking || null, kids: v.kids || null, religion: v.religion || null });

// ---------------------------------------------------------------------
// Průvodce registrací (6 kroků)
// ---------------------------------------------------------------------
const W = { step: 0, name: '', birthdate: '', gender: 'muz', looking_for: 'zeny', mode: 'laska', min_age: 18, max_age: 45,
  photos: [], bio: '', city: '', job: '', interests: new Set(), prompts: [], personality: null, lat: null, lng: null, consent: false,
  height_cm: null, goal: null, education: null, smoking: null, drinking: null, kids: null, religion: null };

function renderWizard() {
  if (!W.name && S.session) {
    const md = S.session.user.user_metadata || {};
    W.name = (md.given_name || md.first_name || (md.full_name || md.name || '').split(' ')[0] || '').slice(0, 40);
  }
  const steps = ['Jméno', 'Kdo jsi', 'Fotky', 'O tobě', 'Osobnost', 'Hotovo'];
  const n = W.step;
  const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - 18);
  let body = '';
  if (n === 0) body = `
    <p class="script">začínáme</p><h1 class="wiz-h">Jak ti říkají?</h1>
    <div class="field"><label for="w-name">Křestní jméno</label><input class="input" id="w-name" maxlength="40" value="${esc(W.name)}" placeholder="Jméno, které uvidí ostatní" autocomplete="given-name"></div>
    <div class="field"><label for="w-birth">Datum narození</label><input class="input" id="w-birth" type="date" max="${maxBirth.toISOString().slice(0, 10)}" value="${esc(W.birthdate)}"></div>
    <p class="small muted">Ostatní uvidí jen tvůj věk, nikdy datum narození.</p>`;
  if (n === 1) body = `
    <p class="script">kdo jsi</p><h1 class="wiz-h">Co tu hledáš?</h1>
    <div class="mode-cards" id="w-mode">
      ${Object.entries({ laska: ['Lásku', 'Rande a vztah'], pratele: ['Přátele', 'Nové kamarády'], oboje: ['Obojí', 'Uvidím, co přijde'] })
        .map(([k, [t, s]]) => `<button type="button" class="mode-card" data-v="${k}" aria-pressed="${W.mode === k}"><b>${t}</b><span>${s}</span></button>`).join('')}
    </div>
    <div class="field" style="margin-top:16px"><span class="lbl">Jsem</span>${segHTML('w-gender', { muz: 'Muž', zena: 'Žena', jine: 'Jiné' }, W.gender)}</div>
    <div class="field" id="w-lookwrap" ${W.mode === 'pratele' ? 'hidden' : ''}><span class="lbl">Na rande hledám</span>${segHTML('w-look', { muze: 'Muže', zeny: 'Ženy', vsechny: 'Všechny' }, W.looking_for)}</div>
    <div class="row"><div class="field"><label for="w-min">Věk od</label><input class="input" id="w-min" type="number" min="18" max="99" value="${W.min_age}"></div>
      <div class="field"><label for="w-max">Věk do</label><input class="input" id="w-max" type="number" min="18" max="99" value="${W.max_age}"></div></div>`;
  if (n === 2) body = `
    <p class="script">ukaž se</p><h1 class="wiz-h">Tvoje fotky</h1>
    <p class="lead" style="font-size:15px;margin-bottom:14px">Přidej aspoň 1 fotku, ideálně 3–6. Profily s víc fotkami dostávají víc lajků.</p>
    <div id="w-photos">${photoGridHTML(W.photos)}</div>
    <p class="small muted" style="margin-top:12px">První fotka je hlavní. Bez nahoty, dětí a cizích lidí.</p>`;
  if (n === 3) body = `
    <p class="script">něco o tobě</p><h1 class="wiz-h">Představ se</h1>
    <div class="field"><label for="w-bio">O mně</label><textarea class="input" id="w-bio" maxlength="500" placeholder="Co tě baví, co hledáš…">${esc(W.bio)}</textarea></div>
    <div class="row"><div class="field"><label for="w-city">Město</label><input class="input" id="w-city" maxlength="60" value="${esc(W.city)}" placeholder="Praha"></div>
      <div class="field"><label for="w-job">Práce / škola</label><input class="input" id="w-job" maxlength="60" value="${esc(W.job)}"></div></div>
    <div class="field"><span class="lbl">Zájmy (max. 8)</span>${chipsHTML(W.interests)}</div>
    <p class="label-caps" style="margin-top:18px">Detaily (nepovinné)</p><div id="w-details">${detailsEditorHTML(W)}</div>`;
  if (n === 4) body = `
    <p class="script">prolom ledy</p><h1 class="wiz-h">Tvoje osobnost</h1>
    <div class="field"><span class="lbl">Otázky v profilu (nepovinné, max. 3)</span><div id="w-prompts">${promptsEditorHTML(W.prompts)}</div></div>
    <div class="field" style="margin-top:8px"><span class="lbl">Typ osobnosti (nepovinné)</span><div id="w-pers">${personalityPickerHTML(W.personality)}</div></div>`;
  if (n === 5) body = `
    <p class="script">poslední krok</p><h1 class="wiz-h">Skoro hotovo!</h1>
    <div class="setup-card">${I.pin({ size: 26, color: '#C084FC' })}<div><b>Lidé v okolí</b><span>Ukážeme ti, kdo je blízko. Ukládáme jen přibližnou polohu (~1 km).</span></div>
      <button type="button" class="btn btn-outline btn-sm" id="w-geo">${W.lat ? 'Povoleno ✓' : 'Povolit'}</button></div>
    ${pushSupported() ? `<div class="setup-card">${I.bell({ size: 26, color: '#C084FC' })}<div><b>Upozornění</b><span>Dáme ti vědět o nové shodě a zprávě.</span></div>
      <button type="button" class="btn btn-outline btn-sm" id="w-push">Povolit</button></div>` : ''}
    <label class="consent" for="w-consent">
      <input type="checkbox" id="w-consent" ${W.consent ? 'checked' : ''}>
      <span>Souhlasím se zpracováním údajů o mém pohlaví a o tom, koho hledám, aby mi Jiskra mohla ukazovat vhodné lidi. Souhlas můžu kdykoli odvolat smazáním účtu. <a href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener">Zásady ochrany osobních údajů</a></span>
    </label>`;

  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar">
      ${n > 0 ? `<button class="icon-btn" data-prev aria-label="Zpět">${I.back({ size: 22 })}</button>` : '<span style="width:44px"></span>'}
      <div style="flex:1;padding:0 8px"><div class="wiz-bar"><div style="width:${Math.round(((n + 1) / steps.length) * 100)}%"></div></div>
        <div class="small muted" style="text-align:center;margin-top:6px">Krok ${n + 1} z ${steps.length} · ${steps[n]}</div></div>
      <button class="link-btn" data-logout style="font-size:13px">Odhlásit</button>
    </div>
    <div class="scroll pad" style="padding-top:8px">${body}</div>
    <div class="pad" style="padding-top:8px;padding-bottom:calc(18px + var(--safe-b))">
      <button class="btn btn-primary" data-next>${n === 5 ? 'Začít objevovat 💜' : 'Pokračovat'}</button>
    </div></div>`;

  $('[data-logout]').onclick = () => sb.auth.signOut();
  const prev = $('[data-prev]'); if (prev) prev.onclick = () => { collect(); W.step--; renderWizard(); };

  function collect() {
    if (n === 0) { W.name = $('#w-name').value.trim(); W.birthdate = $('#w-birth').value; }
    if (n === 1) { W.min_age = Math.max(18, parseInt($('#w-min').value, 10) || 18); W.max_age = Math.min(99, parseInt($('#w-max').value, 10) || 99); if (W.min_age > W.max_age) [W.min_age, W.max_age] = [W.max_age, W.min_age]; }
    if (n === 3) { W.bio = $('#w-bio').value.trim(); W.city = $('#w-city').value.trim(); W.job = $('#w-job').value.trim(); }
    if (n === 5) W.consent = $('#w-consent').checked;
  }

  if (n === 1) {
    $$('#w-mode .mode-card').forEach((b) => (b.onclick = () => {
      W.mode = b.dataset.v;
      $$('#w-mode .mode-card').forEach((x) => x.setAttribute('aria-pressed', x === b));
      $('#w-lookwrap').hidden = W.mode === 'pratele';
    }));
    bindSeg('w-gender', (v) => (W.gender = v));
    bindSeg('w-look', (v) => (W.looking_for = v));
  }
  if (n === 2) { const rr = () => { $('#w-photos').innerHTML = photoGridHTML(W.photos); bindPhotoGrid($('#w-photos'), W.photos, rr); }; bindPhotoGrid($('#w-photos'), W.photos, rr); }
  if (n === 3) { bindChips(W.interests); bindDetails($('#w-details'), W); }
  if (n === 4) {
    const rr = () => { $('#w-prompts').innerHTML = promptsEditorHTML(W.prompts); bindPrompts($('#w-prompts'), W.prompts, rr); };
    bindPrompts($('#w-prompts'), W.prompts, rr);
    bindPersonality($('#w-pers'), () => W.personality, (t) => (W.personality = t));
  }
  if (n === 5) {
    $('#w-geo').onclick = async () => {
      const r = await refreshLocation(true);
      if (r) { W.lat = r.lat; W.lng = r.lng; $('#w-geo').textContent = 'Povoleno ✓'; } else toast('Polohu se nepodařilo zjistit. Můžeš ji povolit později v profilu.');
    };
    const pb = $('#w-push'); if (pb) pb.onclick = async () => { W.wantPush = true; pb.textContent = 'Po dokončení ✓'; };
  }

  $('[data-next]').onclick = async () => {
    collect();
    if (n === 0) {
      if (!W.name) return toast('Vyplň jméno.');
      if (!W.birthdate) return toast('Vyplň datum narození.');
      if (ageOf(W.birthdate) < 18) return toast('Jiskra je jen pro lidi starší 18 let.');
    }
    if (n === 2 && !W.photos.length) return toast('Přidej aspoň jednu fotku.');
    if (n < 5) { W.step++; return renderWizard(); }
    if (!W.consent) return toast('Pro dokončení potvrď souhlas.');
    const btn = $('[data-next]'); btn.disabled = true;
    try {
      const row = { id: uid(), name: W.name, birthdate: W.birthdate, gender: W.gender, looking_for: W.mode === 'pratele' ? 'vsechny' : W.looking_for,
        mode: W.mode, min_age: W.min_age, max_age: W.max_age, photos: W.photos, photo_url: W.photos[0] || null, bio: W.bio, city: W.city, job: W.job,
        interests: [...W.interests], prompts: W.prompts.filter((p) => p.a && p.a.trim()).map((p) => ({ q: p.q, a: p.a.trim().slice(0, 150) })),
        personality: W.personality, lat: W.lat, lng: W.lng, ...pickDetails(W) };
      const { error } = await sb.from('profiles').insert(row);
      if (error) throw error;
      await loadMe();
      if (W.wantPush) await enablePush();
      toast('Vítej v Jiskře! 💜');
      go('#/discover');
    } catch (err) { toast(errText(err)); btn.disabled = false; }
  };
}

// ---------------------------------------------------------------------
// Úprava profilu
// ---------------------------------------------------------------------
function renderEdit() {
  const p = S.me;
  const E = { photos: [...(p.photos && p.photos.length ? p.photos : p.photo_url ? [p.photo_url] : [])], prompts: (p.prompts || []).map((x) => ({ ...x })),
    personality: p.personality, interests: new Set(p.interests || []), gender: p.gender, looking_for: p.looking_for, mode: p.mode || 'laska', ...pickDetails(p) };
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><a class="icon-btn" href="#/profile" aria-label="Zpět">${I.back({ size: 22 })}</a><h1 style="flex:1;text-align:center">Upravit profil</h1><span style="width:44px"></span></div>
    <form id="ef" class="scroll pad" style="padding-top:6px" novalidate>
      <p class="label-caps">Fotky</p><div id="e-photos">${photoGridHTML(E.photos)}</div>
      <p class="label-caps" style="margin-top:24px">O mně</p>
      <div class="field"><label for="e-name">Jméno</label><input class="input" id="e-name" maxlength="40" value="${esc(p.name)}"></div>
      <div class="field"><label for="e-bio">Popis</label><textarea class="input" id="e-bio" maxlength="500">${esc(p.bio)}</textarea></div>
      <div class="row"><div class="field"><label for="e-city">Město</label><input class="input" id="e-city" maxlength="60" value="${esc(p.city)}"></div>
        <div class="field"><label for="e-job">Práce / škola</label><input class="input" id="e-job" maxlength="60" value="${esc(p.job)}"></div></div>
      <div class="field"><span class="lbl">Zájmy (max. 8)</span>${chipsHTML(E.interests)}</div>
      <p class="label-caps" style="margin-top:20px">Detaily</p><div id="e-details">${detailsEditorHTML(E)}</div>
      <p class="label-caps" style="margin-top:20px">Otázky v profilu</p><div id="e-prompts">${promptsEditorHTML(E.prompts)}</div>
      <p class="label-caps" style="margin-top:24px">Typ osobnosti</p><div id="e-pers">${personalityPickerHTML(E.personality)}</div>
      <p class="label-caps" style="margin-top:24px">Koho hledám</p>
      <div class="field"><span class="lbl">Režim</span>${segHTML('e-mode', MODES, E.mode)}</div>
      <div class="field"><span class="lbl">Jsem</span>${segHTML('e-gender', { muz: 'Muž', zena: 'Žena', jine: 'Jiné' }, E.gender)}</div>
      <div class="field" id="e-lookwrap" ${E.mode === 'pratele' ? 'hidden' : ''}><span class="lbl">Na rande hledám</span>${segHTML('e-look', { muze: 'Muže', zeny: 'Ženy', vsechny: 'Všechny' }, E.looking_for)}</div>
      <div class="row"><div class="field"><label for="e-min">Věk od</label><input class="input" id="e-min" type="number" min="18" max="99" value="${esc(p.min_age)}"></div>
        <div class="field"><label for="e-max">Věk do</label><input class="input" id="e-max" type="number" min="18" max="99" value="${esc(p.max_age)}"></div></div>
      <div class="field"><label for="e-dist">Maximální vzdálenost: <b id="e-distv">${p.max_distance_km >= 1000 ? 'kdekoli' : p.max_distance_km + ' km'}</b></label>
        <input type="range" id="e-dist" min="5" max="1000" step="5" value="${esc(p.max_distance_km)}" class="range"></div>
      <div class="setup-card">${I.pin({ size: 24, color: '#C084FC' })}<div><b>Poloha</b><span>${p.lat ? 'Nastavená (přibližně)' : 'Zatím nenastavená – vzdálenosti se nezobrazí'}</span></div>
        <button type="button" class="btn btn-outline btn-sm" id="e-geo">Aktualizovat</button></div>
      <button class="btn btn-primary" type="submit" style="margin:20px 0 calc(24px + var(--safe-b))">Uložit změny</button>
    </form></div>`;

  const rrP = () => { $('#e-photos').innerHTML = photoGridHTML(E.photos); bindPhotoGrid($('#e-photos'), E.photos, rrP); }; rrP();
  const rrQ = () => { $('#e-prompts').innerHTML = promptsEditorHTML(E.prompts); bindPrompts($('#e-prompts'), E.prompts, rrQ); }; rrQ();
  bindPersonality($('#e-pers'), () => E.personality, (t) => (E.personality = t));
  bindChips(E.interests);
  bindDetails($('#e-details'), E);
  bindSeg('e-mode', (v) => { E.mode = v; $('#e-lookwrap').hidden = v === 'pratele'; });
  bindSeg('e-gender', (v) => (E.gender = v));
  bindSeg('e-look', (v) => (E.looking_for = v));
  $('#e-dist').oninput = (e) => { $('#e-distv').textContent = +e.target.value >= 1000 ? 'kdekoli' : e.target.value + ' km'; };
  $('#e-geo').onclick = async () => { const r = await refreshLocation(true); toast(r ? 'Poloha aktualizována 📍' : 'Polohu se nepodařilo zjistit. Povol ji v nastavení prohlížeče.'); };

  $('#ef').onsubmit = async (e) => {
    e.preventDefault();
    if (!E.photos.length) return toast('Nech si aspoň jednu fotku.');
    const name = $('#e-name').value.trim(); if (!name) return toast('Vyplň jméno.');
    let minAge = Math.max(18, parseInt($('#e-min').value, 10) || 18), maxAge = Math.min(99, parseInt($('#e-max').value, 10) || 99);
    if (minAge > maxAge) [minAge, maxAge] = [maxAge, minAge];
    const btn = $('#ef button[type=submit]'); btn.disabled = true;
    const row = { name, bio: $('#e-bio').value.trim(), city: $('#e-city').value.trim(), job: $('#e-job').value.trim(),
      interests: [...E.interests], photos: E.photos, photo_url: E.photos[0], personality: E.personality, mode: E.mode, gender: E.gender,
      looking_for: E.mode === 'pratele' ? 'vsechny' : E.looking_for, min_age: minAge, max_age: maxAge, max_distance_km: +$('#e-dist').value,
      prompts: E.prompts.filter((x) => x.a && x.a.trim()).map((x) => ({ q: x.q, a: x.a.trim().slice(0, 150) })), ...pickDetails(E) };
    const { error } = await sb.from('profiles').update(row).eq('id', uid());
    btn.disabled = false;
    if (error) return toast(errText(error));
    await loadMe(); S.candidates = [];
    toast('Uloženo ✓'); go('#/profile');
  };
}

// ---------------------------------------------------------------------
// Karta a detail profilu
// ---------------------------------------------------------------------
function compatLabel(c) { return c >= 85 ? 'Skvělá shoda' : c >= 70 ? 'Dobrá shoda' : 'Shoda'; }

function badgesHTML(p) {
  const b = [];
  if (p.distance_km != null) b.push(`<span class="badge-chip">${I.pin({ size: 13, color: '#C084FC' })}${p.distance_km} km</span>`);
  if (p.compat != null) b.push(`<span class="badge-chip hot">💜 ${p.compat} %</span>`);
  if (p.goal && GOALS[p.goal]) b.push(`<span class="badge-chip">${I.target({ size: 12, color: '#C084FC' })}${GOALS[p.goal]}</span>`);
  if (p.personality) b.push(`<span class="badge-chip">${esc(p.personality)}</span>`);
  if (p.height_cm) b.push(`<span class="badge-chip">${p.height_cm} cm</span>`);
  if (p.zodiac) b.push(`<span class="badge-chip">${I.moon({ size: 12, color: '#C084FC' })}${esc(p.zodiac)}</span>`);
  if (p.mode === 'pratele') b.push('<span class="badge-chip">Hledá přátele</span>');
  return b.join('');
}

function cardHTML(p, back = false) {
  const photos = p.photos && p.photos.length ? p.photos : [];
  return `<article class="card ${back ? 'back' : ''}" data-id="${esc(p.id)}" aria-label="${esc(p.name)}, ${esc(p.age)} let">
    <div class="card-photo" style="${bgImg(photos[0])}">${photos.length ? '' : `<div class="placeholder">${I.user({ size: 120, color: '#6D3FC0', sw: 1 })}</div>`}</div>
    ${photos.length > 1 ? `<div class="pbars">${photos.map((_, i) => `<span class="${i === 0 ? 'on' : ''}"></span>`).join('')}</div>` : ''}
    ${p.boosted ? `<span class="boost-badge">${I.bolt({ size: 12, fill: '#1a0b2e' })} Boost</span>` : ''}
    ${p.super_liked_me ? `<span class="super-badge">${I.star({ size: 12, fill: '#08142B' })} Dal(a) ti Super Like</span>` : ''}
    <span class="stamp like">LÍBÍ</span><span class="stamp nope">NE</span>
    <div class="info">
      <div class="name">${esc(p.name)}, ${esc(p.age)} ${p.verified ? verifiedBadge(24) : ''}${p.active_recently ? '<span class="active-dot" title="Aktivní dnes"></span>' : ''}</div>
      <div class="badges">${badgesHTML(p)}</div>
      ${p.prompts && p.prompts[0] ? `<p class="bio"><b>${esc(p.prompts[0].q)}</b> ${esc(p.prompts[0].a)}</p>` : p.bio ? `<p class="bio">${esc(p.bio)}</p>` : '<div style="height:8px"></div>'}
      <div class="chips">${(p.interests || []).slice(0, 4).map((i) => `<span class="chip ${S.me && (S.me.interests || []).includes(i) ? 'same' : ''}">${esc(i)}</span>`).join('')}</div>
    </div>
    <button class="info-btn" data-info aria-label="Zobrazit celý profil">${I.info({ size: 22, color: '#fff' })}</button>
  </article>`;
}

function detailHTML(p, actions) {
  const photos = p.photos && p.photos.length ? p.photos : [];
  const prompts = p.prompts || [];
  const blocks = [];
  blocks.push(photos[0] ? `<div class="d-photo" style="${bgImg(photos[0])}"></div>` : '');
  blocks.push(`<div class="d-sec"><h2 class="d-name">${esc(p.name)}, ${esc(p.age)} ${p.verified ? verifiedBadge(24) : ''}</h2>
    <div class="badges" style="margin-top:8px">${badgesHTML(p)}${p.active_recently ? '<span class="badge-chip"><span class="active-dot"></span>Aktivní dnes</span>' : ''}</div>
    <div class="meta" style="margin-top:10px">${p.job ? `<span>${I.bag({ size: 15, color: '#C084FC' })}${esc(p.job)}</span>` : ''}${p.city ? `<span>${I.pin({ size: 15, color: '#C084FC' })}${esc(p.city)}</span>` : ''}</div></div>`);
  if (prompts[0]) blocks.push(`<div class="prompt-card"><div class="pq">${esc(prompts[0].q)}</div><div class="pa">${esc(prompts[0].a)}</div></div>`);
  if (photos[1]) blocks.push(`<div class="d-photo" style="${bgImg(photos[1])}"></div>`);
  const facts = [p.height_cm ? [I.ruler, `${p.height_cm} cm`] : null,
    ...DETAILS.filter(([k, , o]) => p[k] && o[p[k]]).map(([k, , o, ic]) => [I[ic], o[p[k]]])].filter(Boolean);
  if (facts.length) blocks.push(`<div class="d-sec"><p class="label-caps">Základní info</p><div class="facts">${facts.map(([ic, t]) => `<span>${ic({ size: 16, color: '#C084FC' })}${esc(t)}</span>`).join('')}</div></div>`);
  if (p.bio) blocks.push(`<div class="d-sec"><p class="label-caps">O mně</p><p class="lead" style="font-size:15px;white-space:pre-wrap">${esc(p.bio)}</p></div>`);
  if (prompts[1]) blocks.push(`<div class="prompt-card"><div class="pq">${esc(prompts[1].q)}</div><div class="pa">${esc(prompts[1].a)}</div></div>`);
  if (photos[2]) blocks.push(`<div class="d-photo" style="${bgImg(photos[2])}"></div>`);
  if ((p.interests || []).length) blocks.push(`<div class="d-sec"><p class="label-caps">Zájmy</p><div class="chips">${p.interests.map((i) => `<span class="chip ${S.me && (S.me.interests || []).includes(i) ? 'same' : ''}">${esc(i)}</span>`).join('')}</div></div>`);
  if (p.personality) blocks.push(`<div class="d-sec pers-card"><div>${I.brain({ size: 28, color: '#C084FC' })}</div><div><b>${esc(p.personality)} · ${esc(TYPES[p.personality] || '')}</b>
    <span>${p.compat != null ? `${compatLabel(p.compat)} s tebou: ${p.compat} %` : 'Doplň si svůj typ a uvidíš, jak moc si sedíte.'}</span></div></div>`);
  if (prompts[2]) blocks.push(`<div class="prompt-card"><div class="pq">${esc(prompts[2].q)}</div><div class="pa">${esc(prompts[2].a)}</div></div>`);
  photos.slice(3).forEach((ph) => blocks.push(`<div class="d-photo" style="${bgImg(ph)}"></div>`));
  return `<div class="detail" role="dialog" aria-modal="true" aria-label="Profil ${esc(p.name)}">
    <button class="icon-btn d-close" data-close aria-label="Zavřít">${I.x({ size: 22, color: '#fff' })}</button>
    <div class="d-scroll">${blocks.join('')}
      ${actions && actions.includes('report') ? `<div class="d-safety"><button class="link-btn" data-block>${I.ban({ size: 16, color: '#FCA5A5' })} Blokovat</button><button class="link-btn" data-report>Nahlásit ${esc(p.name)}</button></div>` : ''}
      <div style="height:${actions && actions.some((a) => a !== 'report') ? 120 : 30}px"></div></div>
    ${actions && actions.some((a) => a !== 'report') ? `<div class="d-actions">
      ${actions.includes('pass') ? `<button class="round lg" data-k="pass" aria-label="Přeskočit">${I.x({ size: 26, color: '#F87171', sw: 2.6 })}</button>` : ''}
      ${actions.includes('super') ? `<button class="round md" data-k="super" aria-label="Super Like">${I.star({ size: 22, fill: '#60A5FA' })}</button>` : ''}
      ${actions.includes('like') ? `<button class="round like" data-k="like" aria-label="Líbí se mi">${I.heart({ size: 30, fill: '#fff' })}</button>` : ''}
    </div>` : ''}
  </div>`;
}

function openDetail(p, actions = [], onAction = null) {
  const host = document.createElement('div');
  host.innerHTML = detailHTML(p, actions);
  const el = host.firstElementChild;
  document.body.appendChild(el);
  const close = () => el.remove();
  $('[data-close]', el).onclick = close;
  $$('[data-k]', el).forEach((b) => (b.onclick = () => { close(); if (onAction) onAction(b.dataset.k); }));
  const rep = $('[data-report]', el);
  if (rep) rep.onclick = async () => { close(); if (await reportUser(p.id, p.name) && onAction) onAction('removed'); };
  const blk = $('[data-block]', el);
  if (blk) blk.onclick = async () => { close(); if (await blockUser(p.id, p.name) && onAction) onAction('removed'); };
  if (S.me && p.id !== S.me.id) sb.rpc('record_view', { pid: p.id }).then(() => {});
  return el;
}

async function reportUser(id, name, matchId = null) {
  const reason = await dialog({ title: `Nahlásit ${name}`, text: 'Co se stalo? Např. falešný profil, obtěžování, spam, nevhodné fotky.', input: true, placeholder: 'Popiš problém…', ok: 'Nahlásit', danger: true });
  if (!reason) return false;
  const { error } = await sb.from('reports').insert({ reporter: uid(), reported: id, reason: reason.slice(0, 500) });
  if (error) { toast(errText(error)); return false; }
  await sb.from('swipes').insert({ swiper: uid(), swipee: id, kind: 'pass' }).then(() => {});
  if (matchId) await sb.from('matches').delete().eq('id', matchId);
  S.candidates = S.candidates.filter((c) => c.id !== id);
  await loadMatches();
  toast('Děkujeme, nahlášení prověříme.');
  return true;
}

async function blockUser(id, name, matchId = null) {
  const ok = await dialog({ title: `Blokovat ${name}?`, text: 'Už se navzájem neuvidíte a nebudete si moct psát. Odblokovat jde v Nastavení.', ok: 'Blokovat', danger: true });
  if (!ok) return false;
  const { error } = await sb.from('blocks').insert({ blocker: uid(), blocked: id });
  if (error && !String(error.message).includes('duplicate')) { toast(errText(error)); return false; }
  if (matchId) await sb.from('matches').delete().eq('id', matchId);
  S.candidates = S.candidates.filter((c) => c.id !== id);
  await loadMatches();
  toast(`${name} je zablokován(a).`);
  return true;
}

function selfAsCard() {
  const m = S.me;
  return { ...m, age: ageOf(m.birthdate), zodiac: zodiacOf(m.birthdate), photos: m.photos && m.photos.length ? m.photos : m.photo_url ? [m.photo_url] : [], distance_km: null, compat: null, active_recently: true };
}

// ---------------------------------------------------------------------
// Objevuj
// ---------------------------------------------------------------------
async function fetchCandidates() {
  if (S.loadingCandidates) return;
  S.loadingCandidates = true;
  const { data, error } = await sb.rpc('discover3', { lim: 20 });
  S.loadingCandidates = false;
  if (error) { toast(errText(error)); return; }
  const have = new Set(S.candidates.map((c) => c.id));
  S.candidates.push(...(data || []).filter((c) => !have.has(c.id)));
}

async function renderDiscover() {
  app.innerHTML = `${waves()}
  <div class="screen">
    <div class="topbar">
      <div class="brand">${logo(36)}<h1>Objevuj</h1></div>
      <div class="actions">
        <button class="icon-btn boost-btn" id="boostBtn" aria-label="Boost – zviditelnit profil">${I.bolt({ size: 20, fill: '#C084FC' })}</button>
        <a class="icon-btn" href="#/premium" aria-label="Předplatné">${I.crown({ size: 20, color: '#FBBF24' })}</a>
        <a class="icon-btn" href="#/filters" aria-label="Filtry">${I.sliders({ size: 20, color: '#fff' })}</a>
      </div>
    </div>
    ${S.me.paused ? `<a class="pause-note" href="#/settings">${I.pause({ size: 16, color: '#FBBF24' })} Profil je pozastavený – ostatní tě nevidí. Zapnout</a>` : ''}
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
  $('#boostBtn').onclick = boostSheet;
  refreshBoostBtn();
  if (S.candidates.length < 3) await fetchCandidates();
  drawDeck();
}

// ---------- Boost ----------
async function refreshBoostBtn() {
  const b = $('#boostBtn'); if (!b) return;
  const { data } = await sb.rpc('boost_status');
  const st = data && data[0];
  S.boost = st || null;
  b.classList.toggle('on', !!(st && st.active_until));
}
async function boostSheet() {
  const { data } = await sb.rpc('boost_status');
  const st = (data && data[0]) || { active_until: null, used: 0, allowed: 0 };
  const left = Math.max(0, st.allowed - st.used);
  const mins = st.active_until ? Math.max(1, Math.round((new Date(st.active_until) - Date.now()) / 60000)) : 0;
  const w = sheet(`<div style="text-align:center">
      <div class="boost-hero">${I.bolt({ size: 40, fill: '#fff' })}</div>
      <h2 style="margin:14px 0 6px">${st.active_until ? 'Boost běží!' : 'Boost'}</h2>
      <p class="lead" style="font-size:15px">${st.active_until
        ? `Tvůj profil je teď na prvních místech ještě <b style="color:#fff">${mins} min</b>.`
        : 'Na 30 minut budeš mezi prvními profily, které lidé v okolí uvidí. Až 10× víc zobrazení.'}</p>
      ${st.active_until ? '' : st.allowed
        ? `<p class="small muted" style="margin:10px 0 16px">Zbývá ${left} z ${st.allowed} boostů na tento měsíc.</p>
           <button class="btn btn-primary" data-go ${left ? '' : 'disabled'}>${I.bolt({ size: 18, fill: '#fff' })} Spustit Boost</button>`
        : `<p class="small muted" style="margin:10px 0 16px">Boost je součástí předplatného Gold (1× měsíčně) a Platinum (3× měsíčně).</p>
           <a class="btn btn-primary" href="#/premium">Získat Gold</a>`}
    </div>`);
  const g = $('[data-go]', w);
  if (g) g.onclick = async () => {
    g.disabled = true;
    const { error } = await sb.rpc('use_boost');
    w.remove();
    if (error) return toast(String(error.message).includes('boost_active') ? 'Boost už běží.' : String(error.message).includes('boost_unavailable') ? 'Tento měsíc už jsi boosty vyčerpal(a).' : errText(error));
    toast('Boost spuštěn na 30 minut ⚡'); refreshBoostBtn();
  };
}

// Jednoduchý spodní panel
function sheet(inner) {
  const w = document.createElement('div');
  w.className = 'sheet-wrap';
  w.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${inner}</div>`;
  w.onclick = (e) => { if (e.target === w) w.remove(); };
  document.body.appendChild(w);
  return w;
}

function drawDeck() {
  const deck = $('#deck');
  if (!deck) return;
  const [a, b] = S.candidates;
  if (!a) {
    deck.innerHTML = `<div class="empty">
      <p class="script" style="transform:none">zatím je to všechno</p>
      <h1>Nikoho dalšího jsme nenašli</h1>
      <p class="lead">Zkus rozšířit věk nebo vzdálenost, případně přepnout na „Láska i přátelé“. Noví lidé přibývají každý den.</p>
      <a class="btn btn-outline btn-sm" href="#/filters">Upravit filtry</a>
      <button class="link-btn" data-share>Pozvat kamarády do Jiskry</button>
    </div>`;
    $('#actions').style.visibility = 'hidden';
    $('[data-share]', deck).onclick = shareApp;
    return;
  }
  $('#actions').style.visibility = 'visible';
  if (a.ad) {
    deck.innerHTML = (b ? cardHTML(b, true) : '') + adCardHTML();
    const card = deck.lastElementChild;
    fillAds(card);
    $('[data-skip]', card).onclick = () => { S.candidates.shift(); drawDeck(); };
    return;
  }
  deck.innerHTML = (b && !b.ad ? cardHTML(b, true) : '') + cardHTML(a);
  const card = deck.lastElementChild;
  attachCard(card, a);
}

async function shareApp() {
  const data = { title: 'Jiskra – seznamka', text: 'Zkus Jiskru – seznamku s lidmi z okolí 💜', url: location.origin + location.pathname };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); toast('Odkaz zkopírován.'); } } catch { /* zrušeno */ }
}

function attachCard(card, p) {
  let sx = 0, sy = 0, dx = 0, dy = 0, dragging = false, moved = false, idx = 0;
  const photos = p.photos || [];
  const like = $('.stamp.like', card), nope = $('.stamp.nope', card), ph = $('.card-photo', card);
  const showPhoto = (i) => {
    idx = (i + photos.length) % photos.length;
    ph.style.backgroundImage = `url('${photos[idx]}')`;
    $$('.pbars span', card).forEach((s, j) => s.classList.toggle('on', j === idx));
  };
  $('[data-info]', card).addEventListener('click', (e) => { e.stopPropagation(); openDetail(p, ['pass', 'super', 'like'], (k) => swipe(k)); });
  card.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-info]')) return;
    dragging = true; moved = false; sx = e.clientX; sy = e.clientY; dx = dy = 0;
    card.setPointerCapture(e.pointerId); card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 100));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 100));
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    if (!moved) {
      // klepnutí: levá/pravá třetina = listování fotek, střed = detail
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width;
      if (photos.length > 1 && x < 0.33) showPhoto(idx - 1);
      else if (photos.length > 1 && x > 0.67) showPhoto(idx + 1);
      else openDetail(p, ['pass', 'super', 'like'], (k) => swipe(k));
      return;
    }
    if (dx > 110) swipe('like');
    else if (dx < -110) swipe('pass');
    else if (dy < -140) swipe('super');
    else { card.style.transition = 'transform .25s'; card.style.transform = ''; like.style.opacity = 0; nope.style.opacity = 0; }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', () => { dragging = false; card.style.transform = ''; });
}

async function swipe(kind) {
  const p = S.candidates[0];
  if (!p) return;
  if (p.ad) { S.candidates.shift(); return drawDeck(); }
  const card = $('#deck .card:last-child');
  if (card) {
    const x = kind === 'pass' ? -600 : kind === 'like' ? 600 : 0, y = kind === 'super' ? -900 : 40;
    card.style.transition = 'transform .3s ease-in';
    card.style.transform = `translate(${x}px, ${y}px) rotate(${x / 20}deg)`;
  }
  S.candidates.shift();
  setTimeout(drawDeck, 250);
  const { error } = await sb.from('swipes').insert({ swiper: uid(), swipee: p.id, kind });
  if (error) {
    S.candidates.unshift(p);
    setTimeout(drawDeck, 300);
    toast(errText(error), 3500);
    if (String(error.message).includes('like_limit')) setTimeout(() => go('#/premium'), 900);
    return;
  }
  S.lastSwiped = p;
  S.swipes = (S.swipes || 0) + 1;
  if (showAds() && S.swipes % (C.ADS.everySwipes || 8) === 0 && S.candidates.length > 1) S.candidates.splice(1, 0, { id: 'ad-' + S.swipes, ad: true });
  if (S.candidates.length < 4) fetchCandidates().then(() => { if (currentView() === 'discover' && !$('#deck .card')) drawDeck(); });
  if (kind !== 'pass') checkMatch(p);
}

async function checkMatch(p) {
  const me = uid();
  const [a, b] = me < p.id ? [me, p.id] : [p.id, me];
  const { data } = await sb.from('matches').select('id').eq('user_a', a).eq('user_b', b).maybeSingle();
  if (data) { await loadMatches(); showMatch(p, data.id); }
}

async function rewind() {
  if (!S.plan) { toast('Vrácení swipu je v předplatném Plus a vyšším.'); return go('#/premium'); }
  const p = S.lastSwiped;
  if (!p) return toast('Není co vrátit.');
  const { error } = await sb.from('swipes').delete().eq('swiper', uid()).eq('swipee', p.id);
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
  const myPhoto = (S.me.photos && S.me.photos[0]) || S.me.photo_url;
  const theirPhoto = (p.photos && p.photos[0]) || p.photo_url;
  ov.innerHTML = `${waves('mid')}
    <div style="position:relative;display:flex;flex-direction:column;align-items:center;width:100%;max-width:360px">
      <p class="script" style="font-size:40px;transform:rotate(-5deg)">Jiskra přeskočila!</p>
      <h1 style="font-size:50px;line-height:1">To je <span style="color:var(--accent)">shoda</span></h1>
      <p class="lead" style="margin-top:14px">Ty a ${esc(p.name)} jste se navzájem lajkli.${p.compat != null ? ` Kompatibilita ${p.compat} % 💜` : ''}</p>
      <div class="match-pics">
        <div class="pic a" style="${bgImg(myPhoto)}">${myPhoto ? '' : initial(S.me.name)}</div>
        <div class="pic b" style="${bgImg(theirPhoto)}">${theirPhoto ? '' : initial(p.name)}</div>
        <div class="heart">${I.heart({ size: 26, fill: '#fff' })}</div>
      </div>
      <button class="btn btn-primary" data-act="write">${I.send({ size: 20, color: '#fff' })} Napsat zprávu</button>
      <button class="btn btn-outline" data-act="close" style="margin-top:12px">Pokračovat v objevování</button>
    </div>`;
  document.body.appendChild(ov);
  $('[data-act=write]', ov).onclick = () => { ov.remove(); go(`#/chat/${matchId}`); };
  $('[data-act=close]', ov).onclick = () => ov.remove();
  if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
}

// ---------------------------------------------------------------------
// Lajky
// ---------------------------------------------------------------------
async function renderLikes(tab = S.likesTab || 'likes') {
  S.likesTab = tab;
  const tabs = { likes: 'Lajky', top: 'Top výběr', views: 'Návštěvy' };
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><h1>Pro tebe</h1><a class="icon-btn" href="#/premium" aria-label="Předplatné">${I.crown({ size: 20, color: '#FBBF24' })}</a></div>
    <div class="pills pad" role="tablist">${Object.entries(tabs).map(([k, v]) => `<button role="tab" data-tab="${k}" aria-selected="${k === tab}">${v}</button>`).join('')}</div>
    <div class="scroll pad" id="likesBody" style="padding-top:14px"><div class="empty"><div class="spinner"></div></div></div>
    ${tabbar('likes')}</div>`;
  $$('[data-tab]').forEach((b) => (b.onclick = () => renderLikes(b.dataset.tab)));
  const body = $('#likesBody');
  const gold = S.plan === 'gold' || S.plan === 'platinum';
  const plural = (n, a, b, c) => (n === 1 ? a : n < 5 ? b : c);
  const lock = (title, text) => `<div class="panel" style="margin-top:20px;text-align:center">
      <p class="script" style="transform:none">kdo to asi je?</p>
      <h1 style="font-size:22px;margin:4px 0 8px">${title}</h1>
      <p class="lead" style="font-size:14px;margin-bottom:14px">${text}</p>
      <a class="btn btn-gold" href="#/premium">${I.crown({ size: 18, color: '#1a0b2e' })} Získat Gold</a></div>`;
  const openFull = async (lite, after) => {
    const { data: full } = await sb.rpc('profile_card3', { pid: lite.id });
    const p = (full && full[0]) || lite;
    openDetail(p, ['pass', 'super', 'like', 'report'], async (kind) => {
      if (kind === 'removed') return after();
      const { error: err } = await sb.from('swipes').insert({ swiper: uid(), swipee: p.id, kind });
      if (err) { toast(errText(err), 3500); if (String(err.message).includes('like_limit')) go('#/premium'); return; }
      S.candidates = S.candidates.filter((c) => c.id !== p.id);
      if (kind !== 'pass') await checkMatch(p);
      after();
    });
  };
  const tile = (p, i, extra = '') => `<button class="like-tile" data-i="${i}" style="${bgImg(p.photos ? p.photos[0] : p.photo_url)}${p.super_liked_me ? ';border-color:#60A5FA' : ''}" aria-label="${esc(p.name)}, ${esc(p.age)}">
      <div class="shade"></div>${p.verified ? `<i class="tile-v">${verifiedBadge(18)}</i>` : ''}<span>${esc(p.name)}, ${esc(p.age)}${extra}</span></button>`;

  if (tab === 'likes') {
    if (!gold) {
      const { data: count } = await sb.rpc('likes_me_count');
      const n = count || 0;
      body.innerHTML = `
        <p class="lead" style="margin-bottom:18px">${n ? `Lajklo tě <b style="color:#fff">${n}</b> ${plural(n, 'člověk', 'lidi', 'lidí')}.` : 'Zatím tě nikdo nelajkl. Přidej víc fotek, otázky do profilu a ověř se – pomůže to.'}</p>
        ${n ? `<div class="grid2" aria-hidden="true">${Array.from({ length: Math.min(n, 6) }, () => '<div class="like-tile blur"><div class="shade"></div></div>').join('')}</div>` : ''}
        ${lock('Uvidíš je všechny s <span style="color:var(--gold)">Gold</span>', 'Stačí lajknout zpátky a máte shodu.')}`;
      return;
    }
    const { data, error } = await sb.rpc('likes_me_full');
    if (error) { body.innerHTML = `<p class="lead">${esc(errText(error))}</p>`; return; }
    if (!data.length) { body.innerHTML = '<div class="empty"><h1>Zatím nic</h1><p class="lead">Jakmile tě někdo lajkne, uvidíš ho tady.</p></div>'; return; }
    body.innerHTML = `<div class="grid2">${data.map((p, i) => tile(p, i, p.compat != null ? `<small>💜 ${p.compat} %</small>` : '')).join('')}</div>`;
    $$('.like-tile', body).forEach((b) => (b.onclick = () => openFull(data[+b.dataset.i], () => renderLikes('likes'))));
    return;
  }

  if (tab === 'top') {
    const { data, error } = await sb.rpc('top_picks');
    if (error) { body.innerHTML = `<p class="lead">${esc(errText(error))}</p>`; return; }
    const list = data || [];
    const total = list[0] ? list[0].total : 0;
    if (!list.length) { body.innerHTML = '<div class="empty"><h1>Dnes nic nového</h1><p class="lead">Top výběr se obnovuje každý den podle osobnosti a společných zájmů. Doplň si typ osobnosti a zájmy.</p><a class="btn btn-outline btn-sm" href="#/edit">Upravit profil</a></div>'; return; }
    body.innerHTML = `<p class="lead" style="margin-bottom:14px;font-size:15px">Dnešní nejlepší shody podle osobnosti a společných zájmů. Obnovuje se každý den.</p>
      <div class="grid2">${list.map((p, i) => tile(p, i, `<small>💜 ${p.compat ?? '–'} %${p.shared ? ` · ${p.shared} ${plural(p.shared, 'zájem', 'zájmy', 'zájmů')}` : ''}</small>`)).join('')}
      ${!gold && total > list.length ? Array.from({ length: Math.min(total - list.length, 4) }, () => `<a class="like-tile blur" href="#/premium"><div class="shade"></div><span class="lock-ic">${I.lock({ size: 26, color: '#fff' })}</span></a>`).join('') : ''}</div>
      ${!gold && total > list.length ? lock(`Dalších ${total - list.length} top shod`, 'S Gold uvidíš každý den 10 nejlepších shod.') : ''}`;
    $$('button.like-tile', body).forEach((b) => (b.onclick = () => openFull(list[+b.dataset.i], () => renderLikes('top'))));
    return;
  }

  // Návštěvy profilu
  const { data: cnt } = await sb.rpc('viewers_count');
  const n = cnt || 0;
  if (!gold) {
    body.innerHTML = `<p class="lead" style="margin-bottom:18px">${n ? `Za posledních 30 dní si tvůj profil prohlédlo <b style="color:#fff">${n}</b> ${plural(n, 'člověk', 'lidi', 'lidí')}.` : 'Zatím si tvůj profil nikdo neprohlédl. Boost a víc fotek ti pomůže.'}</p>
      ${n ? `<div class="grid2" aria-hidden="true">${Array.from({ length: Math.min(n, 4) }, () => '<div class="like-tile blur"><div class="shade"></div></div>').join('')}</div>` : ''}
      ${lock('Zjisti, kdo tě viděl', 'Kdo mě viděl je součástí Gold a Platinum.')}`;
    return;
  }
  const { data, error } = await sb.rpc('viewers');
  if (error) { body.innerHTML = `<p class="lead">${esc(errText(error))}</p>`; return; }
  if (!data.length) { body.innerHTML = '<div class="empty"><h1>Zatím nikdo</h1><p class="lead">Tady uvidíš, kdo si otevřel tvůj profil.</p></div>'; return; }
  body.innerHTML = `<div class="grid2">${data.map((p, i) => tile(p, i, `<small>${timeLabel(p.viewed_at)}</small>`)).join('')}</div>`;
  $$('.like-tile', body).forEach((b) => (b.onclick = () => openFull(data[+b.dataset.i], () => renderLikes('views'))));
}

// ---------------------------------------------------------------------
// Reklamy (jen pro uživatele bez předplatného)
// ---------------------------------------------------------------------
const showAds = () => !S.plan && !!C.ADS;
let adsLoaded = false;
function adSlotHTML(slot, cls = '') {
  if (!showAds()) return '';
  if (C.ADS.adsenseClient && C.ADS.slots && C.ADS.slots[slot]) {
    return `<div class="ad ${cls}"><span class="ad-label">Reklama</span><ins class="adsbygoogle" style="display:block" data-ad-client="${esc(C.ADS.adsenseClient)}" data-ad-slot="${esc(C.ADS.slots[slot])}" data-ad-format="auto" data-full-width-responsive="true"></ins></div>`;
  }
  return `<a class="ad house ${cls}" href="#/premium"><span class="ad-label">Jiskra Gold</span>
    <div class="house-ic">${I.crown({ size: 22, color: '#1a0b2e' })}</div>
    <div><b>Bez reklam a s neomezenými lajky</b><span>Uvidíš, kdo tě lajkl, Top výběr a Boost.</span></div>${I.chevron({ size: 18, color: '#A897C4' })}</a>`;
}
function fillAds(root) {
  if (!C.ADS || !C.ADS.adsenseClient) return;
  if (!adsLoaded) {
    adsLoaded = true;
    const sc = document.createElement('script');
    sc.async = true; sc.crossOrigin = 'anonymous';
    sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(C.ADS.adsenseClient)}`;
    document.head.appendChild(sc);
  }
  $$('ins.adsbygoogle', root).forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch { /* blokováno */ } });
}
function adCardHTML() {
  const real = C.ADS.adsenseClient && C.ADS.slots && C.ADS.slots.discover;
  return `<article class="card ad-card" aria-label="Reklama">
    ${real ? `<div class="ad-card-in"><span class="ad-label">Reklama</span>${adSlotHTML('discover')}</div>`
      : `<div class="ad-card-in house-card">
        <span class="ad-label">Sponzorováno</span>
        <div class="boost-hero gold">${I.crown({ size: 44, color: '#1a0b2e' })}</div>
        <h2>Jiskra Gold</h2>
        <p class="lead" style="font-size:15px">Neomezené lajky, uvidíš kdo tě lajkl, Top výběr dne, Boost a žádné reklamy.</p>
        <a class="btn btn-gold" href="#/premium">Vyzkoušet Gold</a></div>`}
    <button class="btn btn-outline btn-sm ad-skip" data-skip>Pokračovat ve swipování</button>
  </article>`;
}

// ---------------------------------------------------------------------
// Zprávy
// ---------------------------------------------------------------------
async function renderChats() {
  await loadMatches();
  const fresh = S.matches.filter((m) => !m.last_at);
  const convos = S.matches.filter((m) => m.last_at);
  app.innerHTML = `<div class="screen">
    <div class="topbar"><h1>Zprávy</h1></div>
    <div class="scroll">
      ${fresh.length ? `<p class="label-caps" style="padding:0 24px">Nové shody</p>
      <div class="hscroll">${fresh.map((m) => `
        <a href="#/chat/${m.match_id}"><div class="avatar ring" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>${esc(m.name)}</a>`).join('')}
      </div>` : ''}
      <div class="pad" style="padding-top:${fresh.length ? 20 : 4}px">
        <p class="label-caps" style="margin-bottom:2px">Konverzace</p>
        ${convos.length ? convos.map((m) => `<a class="list-item" href="#/chat/${m.match_id}">
            <div style="position:relative"><div class="avatar" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>${m.active_recently ? '<span class="active-dot abs"></span>' : ''}</div>
            <div class="body"><div class="top"><span class="title">${esc(m.name)} ${m.verified ? verifiedBadge(15) : ''}</span><span class="small muted">${timeLabel(m.last_at)}</span></div>
            <div class="top" style="align-items:center"><div class="sub ${m.unread ? 'new' : ''}">${m.last_from_me ? 'Ty: ' : ''}${esc(msgPreview({ kind: m.last_kind, media_type: m.last_kind, body: m.last_body }))}</div>
            ${m.unread ? `<span class="count">${m.unread}</span>` : ''}</div></div></a>`).join('')
          : `<p class="lead" style="margin-top:14px">${fresh.length ? 'Napiš některé ze svých shod nahoře.' : 'Zatím tu nic není. Jdi objevovat a lajkuj lidi, kteří tě zaujmou.'}</p>`}
        <div style="margin-top:18px">${adSlotHTML('chats')}</div>
      </div>
    </div>
    ${tabbar('chats')}</div>`;
  fillAds(app);
}

function icebreakers(other) {
  const out = [];
  if (other) {
    (other.prompts || []).slice(0, 2).forEach((p) => out.push(`Zaujala mě tvoje odpověď na „${p.q.replace('…', '')}“ – řekneš mi o tom víc?`));
    const same = (other.interests || []).filter((i) => (S.me.interests || []).includes(i));
    if (same[0]) out.push(`Vidím, že taky máš rád(a) ${same[0].toLowerCase()}! Co tě na tom nejvíc baví?`);
    if (other.personality) out.push(`Jsi ${other.personality} (${TYPES[other.personality]}) – sedí to na tebe?`);
    if (other.city) out.push(`Co je podle tebe nejlepší místo v ${other.city}?`);
  }
  out.push('Ahoj! Jak se máš? 👋', 'Kafe nebo čaj?', 'Jaký byl tvůj nejlepší výlet?');
  return [...new Set(out)].slice(0, 5);
}

// Animované nálepky (Noto Emoji od Googlu)
const STICKERS = ['1f60d', '1f970', '1f618', '1f60a', '1f609', '1f602', '1f923', '1f60e', '1f914', '1f633', '1f62d', '1f631',
  '1f973', '1f917', '1f44b', '1f44d', '1f64f', '1f525', '2764_fe0f', '1f48b', '1f339', '1f389', '2615', '1f377'];
const stickerUrl = (cp, ext = 'webp') => `https://fonts.gstatic.com/s/e/notoemoji/latest/${cp}/512.${ext}`;
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function msgInnerHTML(msg) {
  const t = msg.media_type || (msg.kind === 'image' ? 'photo' : 'text');
  if (t === 'sticker') return `<img src="${esc(msg.image_url)}" alt="Nálepka" class="msg-sticker" loading="lazy">`;
  if (t === 'audio') return `<div class="voice">${I.mic({ size: 18, color: '#C084FC' })}<audio controls preload="metadata" src="${esc(msg.image_url)}"></audio></div>`;
  if (t === 'photo' && msg.image_url) return `<img src="${esc(msg.image_url)}" alt="Fotka" class="msg-img" loading="lazy">`;
  return esc(msg.body);
}

async function renderChat(matchId) {
  let m = S.matches.find((x) => x.match_id === matchId);
  if (!m) { await loadMatches(); m = S.matches.find((x) => x.match_id === matchId); }
  if (!m) { toast('Tahle konverzace už neexistuje.'); return go('#/chats'); }
  const me = uid();
  const msgs = new Map();
  let other = null, typingTimer = null, lastTypingSent = 0;

  app.innerHTML = `<div class="screen" style="height:calc(100dvh - var(--badge) - var(--safe-t))">
    <div class="chat-head">
      <a class="icon-btn ghost" href="#/chats" aria-label="Zpět na zprávy">${I.back({ size: 22, color: '#fff' })}</a>
      <button class="chat-who" data-profile aria-label="Zobrazit profil ${esc(m.name)}">
        <div class="avatar sm" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>
        <div class="who"><b>${esc(m.name)}, ${esc(m.age)} ${m.verified ? verifiedBadge(16) : ''}</b>
          <span class="small" id="status" style="color:${m.active_recently ? '#6EE7B7' : '#A897C4'}">${m.active_recently ? 'Aktivní dnes' : 'Klepni pro profil'}</span></div>
      </button>
      <button class="icon-btn ghost" data-act="call" aria-label="Videohovor">${I.video({ size: 22, color: '#C084FC' })}</button>
      <button class="icon-btn ghost" data-act="menu" aria-label="Možnosti">${I.dots({ size: 22 })}</button>
    </div>
    <div class="messages" id="msgs">
      <div class="notice">${I.shield({ size: 14, color: '#C084FC' })} Shoda ${timeLabel(m.created_at)} · Nikdy neposílej peníze lidem, které neznáš osobně.</div>
    </div>
    <div class="typing" id="typing" hidden><span></span><span></span><span></span></div>
    <div class="tips" id="tips"></div>
    <form class="composer" id="composer">
      <button type="button" class="icon-btn ghost" data-act="more" aria-label="Fotka nebo nálepka">${I.plus({ size: 22, color: '#C084FC' })}</button>
      <input type="file" accept="image/*" class="sr-only" id="imgIn" tabindex="-1">
      <label for="msgIn" class="sr-only">Napiš zprávu</label>
      <input class="input" id="msgIn" autocomplete="off" maxlength="2000" placeholder="Napiš zprávu…" enterkeyhint="send">
      <button class="send" type="submit" id="sendBtn" aria-label="Odeslat">${I.send({ size: 20, color: '#fff' })}</button>
      <button class="send mic" type="button" id="micBtn" aria-label="Nahrát hlasovou zprávu">${I.mic({ size: 20, color: '#fff' })}</button>
    </form>
    <div class="recbar" id="recbar" hidden>
      <button type="button" class="icon-btn ghost" data-rec="cancel" aria-label="Zrušit nahrávání">${I.trash({ size: 22, color: '#F87171' })}</button>
      <span class="rec-dot"></span><b id="recTime">0:00</b><span class="small muted" style="flex:1">Nahrávám…</span>
      <button type="button" class="send" data-rec="send" aria-label="Odeslat hlasovou zprávu">${I.send({ size: 20, color: '#fff' })}</button>
    </div>
  </div>`;

  const box = $('#msgs');
  const input = $('#msgIn');
  const syncButtons = () => { const has = !!input.value.trim(); $('#sendBtn').hidden = !has; $('#micBtn').hidden = has || !window.MediaRecorder; };
  syncButtons();

  const renderMsg = (msg) => {
    const mine = msg.sender === me;
    const t = msg.media_type || (msg.kind === 'image' ? 'photo' : 'text');
    const html = msgInnerHTML(msg) + `<time>${timeLabel(msg.created_at)}</time>` + (msg.reaction ? `<span class="reaction">${esc(msg.reaction)}</span>` : '');
    let el = box.querySelector(`[data-mid="${msg.id}"]`);
    if (!el) {
      el = document.createElement('div');
      el.className = 'msg' + (mine ? ' me' : '') + (t === 'photo' ? ' img' : t === 'sticker' ? ' sticker' : t === 'audio' ? ' audio' : '');
      el.dataset.mid = msg.id;
      box.appendChild(el);
      if (!mine) bindReact(el, msg.id);
    }
    el.innerHTML = html;
  };
  const updateSeen = () => {
    $$('.seen', box).forEach((x) => x.remove());
    const mine = [...msgs.values()].filter((x) => x.sender === me);
    const last = mine[mine.length - 1];
    if (last && last.read_at) {
      const el = box.querySelector(`[data-mid="${last.id}"]`);
      if (el) el.insertAdjacentHTML('afterend', '<div class="seen">Přečteno</div>');
    }
  };
  const add = (msg, scroll = true) => {
    msgs.set(msg.id, msg);
    renderMsg(msg);
    if (scroll) box.scrollTop = box.scrollHeight;
    $('#tips').innerHTML = '';
    updateSeen();
  };
  function bindReact(el, id) {
    let t = null;
    const open = () => {
      $$('.react-bar').forEach((x) => x.remove());
      const bar = document.createElement('div');
      bar.className = 'react-bar';
      bar.innerHTML = REACTIONS.map((r) => `<button type="button" data-r="${r}" aria-label="Reagovat ${r}">${r}</button>`).join('') + '<button type="button" data-r="" aria-label="Zrušit reakci">✕</button>';
      el.appendChild(bar);
      $$('[data-r]', bar).forEach((b) => (b.onclick = async (e) => {
        e.stopPropagation(); bar.remove();
        const emoji = b.dataset.r || null;
        const { error } = await sb.rpc('react', { msg: id, emoji });
        if (error) return toast(errText(error));
        const msg = msgs.get(id); if (msg) { msg.reaction = emoji; renderMsg(msg); }
      }));
    };
    el.addEventListener('dblclick', open);
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
    el.addEventListener('touchstart', (e) => { if (e.target.closest('audio')) return; t = setTimeout(open, 450); }, { passive: true });
    el.addEventListener('touchend', () => clearTimeout(t));
    el.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
  }

  const { data: list } = await sb.from('messages').select('*').eq('match_id', matchId).order('created_at', { ascending: true }).limit(300);
  (list || []).forEach((x) => add(x, false));
  box.scrollTop = box.scrollHeight;
  sb.rpc('mark_read', { m: matchId }).then(() => { const mm = S.matches.find((x) => x.match_id === matchId); if (mm) mm.unread = 0; });

  sb.rpc('profile_card3', { pid: m.other_id }).then(({ data }) => {
    other = data && data[0];
    if (!list || !list.length) {
      $('#tips').innerHTML = icebreakers(other).map((t) => `<button type="button">${esc(t)}</button>`).join('');
      $$('#tips button').forEach((b) => (b.onclick = () => { input.value = b.textContent; syncButtons(); input.focus(); }));
    }
  });

  S.chatChannel = sb.channel('chat-' + matchId, { config: { broadcast: { self: false } } })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (p) => {
      add(p.new);
      if (p.new.sender !== me) { $('#typing').hidden = true; sb.rpc('mark_read', { m: matchId }); }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `match_id=eq.${matchId}` }, (p) => {
      const old = msgs.get(p.new.id); if (!old) return;
      Object.assign(old, p.new); renderMsg(old); updateSeen();
    })
    .on('broadcast', { event: 'typing' }, (p) => {
      if (!p.payload || p.payload.from === me) return;
      $('#typing').hidden = false;
      box.scrollTop = box.scrollHeight;
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => { $('#typing').hidden = true; }, 3500);
    })
    .subscribe();

  input.addEventListener('input', () => {
    syncButtons();
    if (Date.now() - lastTypingSent < 2000 || !S.chatChannel) return;
    lastTypingSent = Date.now();
    S.chatChannel.send({ type: 'broadcast', event: 'typing', payload: { from: me } });
  });

  const send = async (row) => {
    const { data, error } = await sb.from('messages').insert({ match_id: matchId, sender: me, ...row }).select().single();
    if (error) { toast(String(error.message).includes('blocked') ? 'Tomuhle člověku už nemůžeš psát.' : errText(error)); return false; }
    add(data); return true;
  };

  $('#composer').onsubmit = async (e) => {
    e.preventDefault();
    const body = input.value.trim();
    if (!body) return;
    input.value = ''; syncButtons();
    if (!(await send({ body }))) { input.value = body; syncButtons(); }
  };

  $('#imgIn').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    toast('Odesílám fotku…');
    try {
      const url = await uploadPhoto(f, 'chat/');
      await send({ body: '📷', kind: 'image', media_type: 'photo', image_url: url });
    } catch (err) { toast(errText(err)); }
  };

  // Fotka / nálepka
  $('[data-act=more]').onclick = () => {
    const w = sheet(`<div class="sheet-tabs"><button type="button" class="btn btn-outline btn-sm" data-k="photo">${I.image({ size: 18, color: '#C084FC' })} Poslat fotku</button></div>
      <p class="label-caps" style="margin:6px 0 0">Nálepky</p>
      <div class="sticker-grid">${STICKERS.map((cp) => `<button type="button" data-cp="${cp}" aria-label="Nálepka"><img src="${stickerUrl(cp)}" alt="" loading="lazy" width="56" height="56"></button>`).join('')}</div>`);
    $('[data-k=photo]', w).onclick = () => { w.remove(); $('#imgIn').click(); };
    $$('[data-cp]', w).forEach((b) => (b.onclick = () => { w.remove(); send({ body: '✨', kind: 'image', media_type: 'sticker', image_url: stickerUrl(b.dataset.cp) }); }));
  };

  // Hlasové zprávy
  let rec = null;
  $('#micBtn').onclick = async () => {
    if (rec) return;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return toast('Povol přístup k mikrofonu v nastavení.'); }
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    const started = Date.now();
    rec = { mr, stream, cancel: false };
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      clearInterval(rec.timer);
      const cancelled = rec.cancel; rec = null;
      $('#recbar').hidden = true; $('#composer').hidden = false;
      const secs = (Date.now() - started) / 1000;
      if (cancelled) return;
      if (secs < 1) return toast('Podrž nahrávání aspoň vteřinu.');
      const type = (mr.mimeType || 'audio/webm').split(';')[0];
      const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, { type });
      try {
        const path = `${me}/audio/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await sb.storage.from('photos').upload(path, blob, { contentType: type });
        if (error) throw error;
        const url = sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
        await send({ body: `🎤 ${fmtDur(secs)}`, kind: 'image', media_type: 'audio', image_url: url });
      } catch (err) { toast(errText(err)); }
    };
    mr.start();
    $('#composer').hidden = true; $('#recbar').hidden = false;
    rec.timer = setInterval(() => {
      const s = (Date.now() - started) / 1000;
      $('#recTime').textContent = fmtDur(s);
      if (s >= 120 && rec) rec.mr.stop();
    }, 250);
  };
  $('[data-rec=cancel]').onclick = () => { if (rec) { rec.cancel = true; rec.mr.stop(); } };
  $('[data-rec=send]').onclick = () => { if (rec) rec.mr.stop(); };

  $('[data-act=call]').onclick = () => startCall(m, true);
  $('[data-profile]').onclick = () => { if (other) openDetail(other, [], null); else toast('Profil se načítá…'); };

  $('[data-act=menu]').onclick = () => {
    const w = sheet(`
      <button class="btn btn-outline" data-k="profile">Zobrazit profil</button>
      <button class="btn btn-outline" data-k="call">${I.video({ size: 18, color: '#C084FC' })} Videohovor</button>
      <button class="btn btn-outline" data-k="unmatch">Zrušit shodu</button>
      <button class="btn btn-outline" data-k="block">${I.ban({ size: 18, color: '#FCA5A5' })} Blokovat</button>
      <button class="btn btn-danger" data-k="report">Nahlásit</button>
      <button class="btn" data-k="close" style="background:transparent;color:var(--muted)">Zavřít</button>`);
    $('[data-k=close]', w).onclick = () => w.remove();
    $('[data-k=profile]', w).onclick = () => { w.remove(); if (other) openDetail(other, []); };
    $('[data-k=call]', w).onclick = () => { w.remove(); startCall(m, true); };
    $('[data-k=unmatch]', w).onclick = async () => {
      w.remove();
      if (!(await dialog({ title: 'Zrušit shodu?', text: `Konverzace s ${m.name} se smaže pro oba a už se neuvidíte.`, ok: 'Zrušit shodu', danger: true }))) return;
      const { error } = await sb.from('matches').delete().eq('id', matchId);
      if (error) return toast(errText(error));
      await loadMatches(); toast('Shoda zrušena.'); go('#/chats');
    };
    $('[data-k=block]', w).onclick = async () => { w.remove(); if (await blockUser(m.other_id, m.name, matchId)) go('#/chats'); };
    $('[data-k=report]', w).onclick = async () => { w.remove(); if (await reportUser(m.other_id, m.name, matchId)) go('#/chats'); };
  };
}

// ---------------------------------------------------------------------
// Videohovory (WebRTC, signalizace přes Supabase Realtime)
// ---------------------------------------------------------------------
let CALL = null, RING = null;
const iceServers = () => (C.ICE_SERVERS && C.ICE_SERVERS.length ? C.ICE_SERVERS : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]);

function joinChannel(topic) {
  const ch = sb.channel(topic, { config: { broadcast: { self: false } } });
  const ready = new Promise((res) => ch.subscribe((st) => { if (st === 'SUBSCRIBED') res(ch); }));
  return { ch, ready };
}
async function sendOnce(topic, event, payload) {
  const { ch, ready } = joinChannel(topic);
  await Promise.race([ready, new Promise((r) => setTimeout(r, 4000))]);
  await ch.send({ type: 'broadcast', event, payload });
  setTimeout(() => sb.removeChannel(ch), 1500);
}

function subscribeRing() {
  if (S.ringChannel) return;
  S.ringChannel = sb.channel(`user-${uid()}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'ring' }, async ({ payload: p }) => {
      if (!p || CALL || RING) return;
      if (!S.matches.find((x) => x.match_id === p.matchId && x.other_id === p.from)) await loadMatches();
      const m = S.matches.find((x) => x.match_id === p.matchId && x.other_id === p.from);
      if (m) incomingCall(m);
    })
    .on('broadcast', { event: 'cancel' }, ({ payload: p }) => {
      if (RING && p && RING.m.match_id === p.matchId) { RING.close(); toast(`Zmeškaný hovor: ${RING.m.name}`); }
    })
    .subscribe();
}

function incomingCall(m) {
  const ov = document.createElement('div');
  ov.className = 'overlay call-in';
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', `Příchozí videohovor od ${m.name}`);
  ov.innerHTML = `${waves('mid')}<div class="call-card">
    <div class="avatar xl ring pulse" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div>
    <h1 style="margin-top:18px">${esc(m.name)}</h1><p class="lead">Příchozí videohovor…</p>
    <div class="call-btns"><button class="round lg decline" data-k="no" aria-label="Odmítnout">${I.phoneOff({ size: 28, color: '#fff' })}</button>
      <button class="round lg accept" data-k="yes" aria-label="Přijmout">${I.video({ size: 28, color: '#fff' })}</button></div></div>`;
  document.body.appendChild(ov);
  const vib = setInterval(() => navigator.vibrate && navigator.vibrate([400, 200, 400]), 1600);
  const timeout = setTimeout(() => close(), 45000);
  function close() { clearInterval(vib); clearTimeout(timeout); ov.remove(); RING = null; }
  RING = { m, close };
  $('[data-k=no]', ov).onclick = () => { close(); sendOnce(`call-${m.match_id}`, 'decline', {}); };
  $('[data-k=yes]', ov).onclick = () => { close(); startCall(m, false); };
}

async function startCall(m, caller) {
  if (CALL) return toast('Hovor už probíhá.');
  if (!window.RTCPeerConnection || !navigator.mediaDevices) return toast('Tohle zařízení videohovory neumí.');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: true }); } catch {
    if (!caller) sendOnce(`call-${m.match_id}`, 'decline', {});
    return toast('Povol přístup ke kameře a mikrofonu.', 3500);
  }
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  stream.getTracks().forEach((t) => pc.addTrack(t, stream));
  const ov = document.createElement('div');
  ov.className = 'call';
  ov.innerHTML = `<video class="remote" autoplay playsinline></video>
    <div class="call-wait"><div class="avatar xl ring pulse" style="${bgImg(m.photo_url)}">${m.photo_url ? '' : initial(m.name)}</div><h2>${esc(m.name)}</h2><p class="lead" id="callSt">${caller ? 'Volám…' : 'Připojuji…'}</p></div>
    <video class="local" autoplay playsinline muted></video>
    <div class="call-bar"><span id="callTime"></span>
      <button class="round md" data-k="mic" aria-label="Ztlumit mikrofon">${I.mic({ size: 22, color: '#fff' })}</button>
      <button class="round lg decline" data-k="end" aria-label="Zavěsit">${I.phoneOff({ size: 28, color: '#fff' })}</button>
      <button class="round md" data-k="cam" aria-label="Vypnout kameru">${I.video({ size: 22, color: '#fff' })}</button></div>`;
  document.body.appendChild(ov);
  $('.local', ov).srcObject = stream;
  const { ch, ready } = joinChannel(`call-${m.match_id}`);
  const pending = [];
  let connectedAt = null, tick = null, noAnswer = null;
  CALL = { pc, stream, ch, ov, m };
  const status = (t) => { const s = $('#callSt', ov); if (s) s.textContent = t; };
  const end = (msg, notify = true) => {
    if (!CALL || CALL.pc !== pc) return;
    if (notify) ch.send({ type: 'broadcast', event: 'hangup', payload: {} });
    if (caller && !connectedAt) sendOnce(`user-${m.other_id}`, 'cancel', { matchId: m.match_id });
    clearInterval(tick); clearTimeout(noAnswer);
    stream.getTracks().forEach((t) => t.stop());
    try { pc.close(); } catch { /* už zavřeno */ }
    setTimeout(() => sb.removeChannel(ch), 800);
    ov.remove(); CALL = null;
    if (msg) toast(msg);
  };
  const flush = async () => { while (pending.length) { try { await pc.addIceCandidate(pending.shift()); } catch { /* ignoruj */ } } };
  pc.onicecandidate = (e) => { if (e.candidate) ch.send({ type: 'broadcast', event: 'ice', payload: e.candidate.toJSON() }); };
  pc.ontrack = (e) => {
    $('.remote', ov).srcObject = e.streams[0];
    $('.call-wait', ov).hidden = true;
    if (!connectedAt) {
      connectedAt = Date.now(); clearTimeout(noAnswer);
      tick = setInterval(() => { $('#callTime', ov).textContent = fmtDur((Date.now() - connectedAt) / 1000); }, 1000);
    }
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') end('Spojení se nepodařilo navázat. Zkus to na Wi-Fi.');
    if (pc.connectionState === 'disconnected') status('Spojení vypadlo…');
  };
  ch.on('broadcast', { event: 'accept' }, async () => {
    if (!caller) return;
    status('Připojuji…');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ch.send({ type: 'broadcast', event: 'offer', payload: { type: offer.type, sdp: offer.sdp } });
  }).on('broadcast', { event: 'offer' }, async ({ payload }) => {
    if (caller) return;
    await pc.setRemoteDescription(payload); await flush();
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    ch.send({ type: 'broadcast', event: 'answer', payload: { type: ans.type, sdp: ans.sdp } });
  }).on('broadcast', { event: 'answer' }, async ({ payload }) => {
    if (!caller) return;
    await pc.setRemoteDescription(payload); await flush();
  }).on('broadcast', { event: 'ice' }, async ({ payload }) => {
    if (pc.remoteDescription) { try { await pc.addIceCandidate(payload); } catch { /* ignoruj */ } } else pending.push(payload);
  }).on('broadcast', { event: 'hangup' }, () => end('Hovor ukončen.', false))
    .on('broadcast', { event: 'decline' }, () => end(`${m.name} teď nemůže.`, false));
  await ready;
  if (caller) {
    await sendOnce(`user-${m.other_id}`, 'ring', { from: uid(), matchId: m.match_id });
    noAnswer = setTimeout(() => end(`${m.name} to nezvedá.`), 45000);
  } else ch.send({ type: 'broadcast', event: 'accept', payload: {} });

  $('[data-k=end]', ov).onclick = () => end('Hovor ukončen.');
  $('[data-k=mic]', ov).onclick = (e) => { const t = stream.getAudioTracks()[0]; t.enabled = !t.enabled; e.currentTarget.classList.toggle('off', !t.enabled); };
  $('[data-k=cam]', ov).onclick = (e) => { const t = stream.getVideoTracks()[0]; t.enabled = !t.enabled; e.currentTarget.classList.toggle('off', !t.enabled); };
}

// ---------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------
async function renderProfile() {
  const p = S.me;
  const photos = p.photos && p.photos.length ? p.photos : p.photo_url ? [p.photo_url] : [];
  const checks = [photos.length >= 3, !!p.bio, (p.prompts || []).length >= 2, (p.interests || []).length >= 3, !!p.personality, p.verified, !!p.lat];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const dash = Math.round(390 * pct / 100);
  const vs = p.verification_status;
  app.innerHTML = `${waves('mid')}<div class="screen">
    <div class="topbar"><h1>Profil</h1><a class="icon-btn" href="#/settings" aria-label="Nastavení">${I.gear({ size: 20, color: '#fff' })}</a></div>
    <div class="scroll">
      <div style="display:flex;flex-direction:column;align-items:center;padding-top:6px">
        <div style="position:relative;width:132px;height:132px">
          <svg aria-hidden="true" width="132" height="132" viewBox="0 0 132 132" style="position:absolute;inset:0">
            <circle cx="66" cy="66" r="62" fill="none" stroke="#24153D" stroke-width="6"/>
            <circle cx="66" cy="66" r="62" fill="none" stroke="#A855F7" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash} 390" transform="rotate(-90 66 66)"/></svg>
          <div class="avatar" style="position:absolute;top:12px;left:12px;width:108px;height:108px;font-size:40px;${bgImg(photos[0])}">${photos[0] ? '' : initial(p.name)}</div>
          <span class="pct-pill">${pct} % hotovo</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:22px"><span style="font-size:24px;font-weight:800">${esc(p.name)}, ${ageOf(p.birthdate)}</span>${p.verified ? verifiedBadge(20) : ''}</div>
        <span class="muted" style="font-size:14px;margin-top:2px">${esc([p.city, p.job].filter(Boolean).join(' · '))}${p.personality ? ` · ${esc(p.personality)}` : ''}</span>
        <div class="row" style="margin-top:14px;gap:10px">
          <a class="btn btn-outline btn-sm" href="#/edit">Upravit profil</a>
          <button class="btn btn-outline btn-sm" data-preview>${I.eye({ size: 18 })} Náhled</button>
        </div>
      </div>
      <div class="pad" style="padding-top:22px;display:flex;flex-direction:column;gap:12px">
        ${!p.verified ? `<a class="promo" href="#/verify">
          <div class="logo-mark" style="width:48px;height:48px;border-radius:16px;background:#2A1650">${I.shield({ size: 26, color: '#C084FC' })}</div>
          <div style="flex:1"><b style="font-size:16px">${vs === 'pending' ? 'Ověření čeká na kontrolu' : vs === 'rejected' ? 'Ověření neprošlo – zkus znovu' : 'Ověř se selfie'}</b>
            <div class="small" style="color:#C9BCE0">${vs === 'pending' ? 'Obvykle do 24 hodin.' : 'Ověřené profily dostávají víc lajků.'}</div></div>${I.chevron({ size: 20, color: '#C084FC' })}</a>` : ''}
        <a class="promo" href="#/premium">
          <div class="logo-mark" style="width:48px;height:48px;border-radius:16px;background:#2A1650">${I.crown({ size: 26, color: '#FBBF24' })}</div>
          <div style="flex:1">${S.plan
            ? `<b style="font-size:16px">Jiskra <span style="color:var(--gold)">${planName[S.plan]}</span></b><div class="small" style="color:#C9BCE0">Aktivní do ${new Date(S.planUntil).toLocaleDateString('cs-CZ')}</div>`
            : `<b style="font-size:16px">Jiskra <span style="color:var(--gold)">Gold</span></b><div class="small" style="color:#C9BCE0">Uvidíš, kdo tě lajkl, a získáš víc shod</div>`}</div>${I.chevron({ size: 20, color: '#C084FC' })}</a>
        <div class="quick-grid">
          <a href="#/filters">${I.sliders({ size: 22, color: '#C084FC' })}<span>Filtry</span></a>
          <a href="#/likes" data-tab="views">${I.eye({ size: 22, color: '#C084FC' })}<span>Kdo mě viděl</span></a>
          <button type="button" data-boost>${I.bolt({ size: 22, fill: '#C084FC' })}<span>Boost</span></button>
          <a href="#/settings">${I.gear({ size: 22, color: '#C084FC' })}<span>Nastavení</span></a>
        </div>
        <div>
          <button class="settings-row" data-share><span>Pozvat kamarády</span>${I.chevron({ size: 18, color: '#A897C4' })}</button>
          ${p.is_admin ? `<a class="settings-row" href="#/admin"><span>${I.gear({ size: 18, color: '#FBBF24' })} Administrace</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>` : ''}
        </div>
        ${adSlotHTML('profile')}
      </div>
    </div>
    ${tabbar('profile')}</div>`;
  $('[data-preview]').onclick = () => openDetail(selfAsCard(), []);
  $('[data-share]').onclick = shareApp;
  $('[data-boost]').onclick = boostSheet;
  $('[data-tab=views]').onclick = () => { S.likesTab = 'views'; };
  fillAds(app);
}

// ---------------------------------------------------------------------
// Filtry
// ---------------------------------------------------------------------
function renderFilters() {
  const p = S.me;
  const f = { verified_only: false, min_height: null, max_height: null, goals: [], smoking: [], kids: [], religion: [], ...(p.filters || {}) };
  const E = { mode: p.mode || 'laska', looking_for: p.looking_for };
  const premium = !!S.plan;
  const multi = (key, opts) => `<div class="chips" data-multi="${key}">${Object.entries(opts).map(([k, v]) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${(f[key] || []).includes(k)}">${v}</button>`).join('')}</div>`;
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><a class="icon-btn" href="#/discover" aria-label="Zpět">${I.back({ size: 22 })}</a><h1 style="flex:1;text-align:center">Filtry</h1><button class="link-btn" data-reset>Vymazat</button></div>
    <form id="ff" class="scroll pad" style="padding-top:6px" novalidate>
      <p class="label-caps">Základní</p>
      <div class="field"><span class="lbl">Hledám</span>${segHTML('f-mode', MODES, E.mode)}</div>
      <div class="field" id="f-lookwrap" ${E.mode === 'pratele' ? 'hidden' : ''}><span class="lbl">Na rande</span>${segHTML('f-look', { muze: 'Muže', zeny: 'Ženy', vsechny: 'Všechny' }, E.looking_for)}</div>
      <div class="field"><label>Věk: <b id="f-agev">${p.min_age}–${p.max_age} let</b></label>
        <div class="dual"><input type="range" class="range" id="f-min" min="18" max="99" value="${p.min_age}" aria-label="Věk od"><input type="range" class="range" id="f-max" min="18" max="99" value="${p.max_age}" aria-label="Věk do"></div></div>
      <div class="field"><label for="f-dist">Vzdálenost: <b id="f-distv">${p.max_distance_km >= 1000 ? 'kdekoli' : p.max_distance_km + ' km'}</b></label>
        <input type="range" id="f-dist" min="5" max="1000" step="5" value="${p.max_distance_km}" class="range"></div>

      <div class="adv ${premium ? '' : 'locked'}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-top:18px">
          <p class="label-caps" style="margin:0">Pokročilé filtry</p>${premium ? '' : `<a class="badge-chip hot" href="#/premium">${I.lock({ size: 12, color: '#fff' })} Plus</a>`}</div>
        <label class="settings-row" style="margin-top:8px"><span>${verifiedBadge(18)} Jen ověřené profily</span>
          <span class="switch"><input type="checkbox" id="f-ver" ${f.verified_only ? 'checked' : ''}><span class="sl"></span></span></label>
        <div class="field"><label>Výška: <b id="f-hv">${f.min_height || 140}–${f.max_height || 210} cm</b></label>
          <div class="dual"><input type="range" class="range" id="f-hmin" min="140" max="210" value="${f.min_height || 140}" aria-label="Výška od"><input type="range" class="range" id="f-hmax" min="140" max="210" value="${f.max_height || 210}" aria-label="Výška do"></div></div>
        <div class="field"><span class="lbl">Co hledá</span>${multi('goals', GOALS)}</div>
        <div class="field"><span class="lbl">Kouření</span>${multi('smoking', SMOKE)}</div>
        <div class="field"><span class="lbl">Děti</span>${multi('kids', KIDS)}</div>
        <div class="field"><span class="lbl">Víra</span>${multi('religion', RELIGION)}</div>
        ${premium ? '' : '<a class="adv-cover" href="#/premium" aria-label="Odemknout pokročilé filtry"></a>'}
      </div>
      <p class="small muted" style="margin-top:6px">Lidé, kteří údaj nevyplnili, se ti zobrazí i tak.</p>
      <button class="btn btn-primary" type="submit" style="margin:18px 0 calc(24px + var(--safe-b))">Použít filtry</button>
    </form></div>`;
  bindSeg('f-mode', (v) => { E.mode = v; $('#f-lookwrap').hidden = v === 'pratele'; });
  bindSeg('f-look', (v) => (E.looking_for = v));
  const pair = (a, b, out, unit) => {
    const upd = () => { let x = +$(a).value, y = +$(b).value; if (x > y) [x, y] = [y, x]; $(out).textContent = `${x}–${y} ${unit}`; };
    $(a).oninput = upd; $(b).oninput = upd;
  };
  pair('#f-min', '#f-max', '#f-agev', 'let');
  pair('#f-hmin', '#f-hmax', '#f-hv', 'cm');
  $('#f-dist').oninput = (e) => { $('#f-distv').textContent = +e.target.value >= 1000 ? 'kdekoli' : e.target.value + ' km'; };
  $$('[data-multi]').forEach((g) => $$('button', g).forEach((b) => (b.onclick = () => {
    const k = g.dataset.multi, v = b.dataset.v, arr = f[k] = f[k] || [];
    const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
    b.setAttribute('aria-pressed', arr.includes(v));
  })));
  $('[data-reset]').onclick = () => { S.me.filters = {}; renderFilters(); };
  $('#ff').onsubmit = async (e) => {
    e.preventDefault();
    let a = +$('#f-min').value, b = +$('#f-max').value; if (a > b) [a, b] = [b, a];
    let h1 = +$('#f-hmin').value, h2 = +$('#f-hmax').value; if (h1 > h2) [h1, h2] = [h2, h1];
    const filters = { verified_only: $('#f-ver').checked, min_height: h1 > 140 ? h1 : null, max_height: h2 < 210 ? h2 : null,
      goals: f.goals || [], smoking: f.smoking || [], kids: f.kids || [], religion: f.religion || [] };
    const row = { mode: E.mode, looking_for: E.mode === 'pratele' ? 'vsechny' : E.looking_for, min_age: a, max_age: b, max_distance_km: +$('#f-dist').value };
    if (premium) row.filters = filters;
    const { error } = await sb.from('profiles').update(row).eq('id', uid());
    if (error) return toast(errText(error));
    Object.assign(S.me, row); S.candidates = [];
    toast('Filtry uloženy ✓'); go('#/discover');
  };
}

// ---------------------------------------------------------------------
// Nastavení účtu
// ---------------------------------------------------------------------
async function renderSettings() {
  const p = S.me;
  const user = S.session.user;
  const notify = { matches: true, messages: true, likes: true, ...(p.notify || {}) };
  const idents = (user.identities || []).map((x) => x.provider);
  const hasEmail = idents.includes('email');
  const row = (icon, label, right = '', attrs = '') => `<button type="button" class="settings-row" ${attrs}><span>${icon}${label}</span>${right || I.chevron({ size: 18, color: '#A897C4' })}</button>`;
  const sw = (id, on, label) => `<label class="settings-row"><span>${label}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span class="sl"></span></span></label>`;
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><a class="icon-btn" href="#/profile" aria-label="Zpět">${I.back({ size: 22 })}</a><h1 style="flex:1;text-align:center">Nastavení</h1><span style="width:44px"></span></div>
    <div class="scroll pad" style="padding-top:6px">
      <p class="label-caps">Profil</p>
      <div class="group">
        ${sw('s-pause', p.paused, `${I.pause({ size: 18, color: '#C084FC' })} Pozastavit profil<small>Nikdo nový tě neuvidí, shody a zprávy zůstanou.</small>`)}
        <a class="settings-row" href="#/edit"><span>${I.user({ size: 18, color: '#C084FC' })} Upravit profil</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
        <a class="settings-row" href="#/filters"><span>${I.sliders({ size: 18, color: '#C084FC' })} Filtry</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
        ${!p.verified ? `<a class="settings-row" href="#/verify"><span>${I.shield({ size: 18, color: '#C084FC' })} Ověřit profil</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>` : ''}
      </div>
      <p class="label-caps">Upozornění</p>
      <div class="group">
        ${pushSupported() ? sw('s-push', false, `${I.bell({ size: 18, color: '#C084FC' })} Push notifikace`) : '<div class="settings-row"><span class="muted">Tenhle prohlížeč notifikace neumí.</span></div>'}
        ${sw('n-matches', notify.matches, 'Nové shody')}
        ${sw('n-messages', notify.messages, 'Nové zprávy')}
        ${sw('n-likes', notify.likes, 'Super Like a lajky')}
      </div>
      <p class="label-caps">Účet</p>
      <div class="group">
        <div class="settings-row"><span>${I.mail({ size: 18, color: '#C084FC' })} E-mail</span><span class="small muted">${esc(user.email || '–')}</span></div>
        <div class="settings-row"><span>${I.key({ size: 18, color: '#C084FC' })} Přihlášení</span><span class="small muted">${idents.map((x) => (x === 'email' ? 'E-mail' : (PROVIDERS[x] || { name: x }).name)).join(', ') || '–'}</span></div>
        ${row(I.mail({ size: 18, color: '#C084FC' }), 'Změnit e-mail', '', 'data-k="email"')}
        ${row(I.key({ size: 18, color: '#C084FC' }), hasEmail ? 'Změnit heslo' : 'Nastavit heslo', '', 'data-k="pass"')}
        <a class="settings-row" href="#/premium"><span>${I.crown({ size: 18, color: '#FBBF24' })} Předplatné</span><span class="small muted">${S.plan ? `${planName[S.plan]} do ${new Date(S.planUntil).toLocaleDateString('cs-CZ')}` : 'Žádné'}</span></a>
      </div>
      <p class="label-caps">Bezpečí</p>
      <div class="group" id="s-blocks"><div class="settings-row"><span class="muted">Načítám blokované…</span></div></div>
      <p class="label-caps">Informace</p>
      <div class="group">
        <a class="settings-row" href="${esc(C.PRIVACY_URL)}" target="_blank" rel="noopener"><span>Ochrana soukromí</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
        <a class="settings-row" href="${esc(C.TERMS_URL)}" target="_blank" rel="noopener"><span>Podmínky používání</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
        <a class="settings-row" href="mailto:${esc(C.SUPPORT_EMAIL)}"><span>Napsat podpoře</span>${I.chevron({ size: 18, color: '#A897C4' })}</a>
      </div>
      <div class="group" style="margin-top:18px">
        ${row(I.logout({ size: 18, color: '#C084FC' }), 'Odhlásit se', ' ', 'data-k="logout"')}
        ${row(I.trash({ size: 18, color: '#FCA5A5' }), '<span style="color:#FCA5A5">Smazat účet</span>', ' ', 'data-k="delete"')}
      </div>
      <p class="small muted" style="text-align:center;margin:18px 0 calc(24px + var(--safe-b))">Jiskra · MS Studio · verze 3.0</p>
    </div></div>`;

  $('#s-pause').onchange = async (e) => {
    const paused = e.target.checked;
    const { error } = await sb.from('profiles').update({ paused }).eq('id', uid());
    if (error) { e.target.checked = !paused; return toast(errText(error)); }
    S.me.paused = paused; toast(paused ? 'Profil pozastaven ⏸' : 'Profil je zase vidět 💜');
  };
  const tg = $('#s-push');
  if (tg) {
    tg.checked = await pushEnabled();
    tg.onchange = async () => { if (tg.checked) tg.checked = await enablePush(); else await disablePush(); };
  }
  ['matches', 'messages', 'likes'].forEach((k) => ($(`#n-${k}`).onchange = async (e) => {
    notify[k] = e.target.checked;
    const { error } = await sb.from('profiles').update({ notify }).eq('id', uid());
    if (error) return toast(errText(error));
    S.me.notify = { ...notify };
  }));
  $('[data-k=email]').onclick = async () => {
    const email = await dialog({ title: 'Nový e-mail', text: 'Pošleme ti potvrzovací odkaz na novou adresu.', input: true, placeholder: 'novy@email.cz', ok: 'Změnit' });
    if (!email) return;
    const { error } = await sb.auth.updateUser({ email: email.trim() }, { emailRedirectTo: location.origin + location.pathname });
    toast(error ? errText(error) : 'Zkontroluj e-mail a potvrď změnu.', 4000);
  };
  $('[data-k=pass]').onclick = async () => {
    const pw = await dialog({ title: hasEmail ? 'Nové heslo' : 'Nastavit heslo', text: 'Aspoň 8 znaků. Pak se můžeš přihlásit i e-mailem.', input: true, placeholder: 'nové heslo', ok: 'Uložit' });
    if (!pw) return;
    if (pw.length < 8) return toast('Heslo musí mít aspoň 8 znaků.');
    const { error } = await sb.auth.updateUser({ password: pw });
    toast(error ? errText(error) : 'Heslo změněno ✓');
  };
  $('[data-k=logout]').onclick = () => sb.auth.signOut();
  $('[data-k=delete]').onclick = async () => {
    if (!(await dialog({ title: 'Smazat účet?', text: 'Smaže se profil, fotky, shody i všechny zprávy. Nejde to vrátit.' + (S.plan ? ' Předplatné nejdřív zruš v Google Play, jinak se bude dál strhávat.' : '') + ' Pokud si chceš jen odpočinout, můžeš profil pozastavit.', ok: 'Smazat navždy', danger: true }))) return;
    const { error } = await sb.rpc('delete_my_account');
    if (error) return toast(errText(error));
    await sb.auth.signOut();
    toast('Účet byl smazán.');
  };

  const renderBlocks = async () => {
    const { data } = await sb.rpc('my_blocks');
    const box = $('#s-blocks'); if (!box) return;
    box.innerHTML = data && data.length ? data.map((b) => `<div class="settings-row"><span><div class="avatar xs" style="${bgImg(b.photo_url)}">${b.photo_url ? '' : initial(b.name)}</div>${esc(b.name)}</span>
        <button type="button" class="btn btn-outline btn-sm" data-unblock="${esc(b.id)}">Odblokovat</button></div>`).join('')
      : `<div class="settings-row"><span>${I.ban({ size: 18, color: '#C084FC' })} Blokovaní lidé</span><span class="small muted">Nikdo</span></div>`;
    $$('[data-unblock]', box).forEach((b) => (b.onclick = async () => {
      const { error } = await sb.from('blocks').delete().eq('blocker', uid()).eq('blocked', b.dataset.unblock);
      if (error) return toast(errText(error));
      toast('Odblokováno.'); renderBlocks();
    }));
  };
  renderBlocks();
}

// ---------------------------------------------------------------------
// Ověření selfie
// ---------------------------------------------------------------------
function renderVerify() {
  const p = S.me;
  const pose = VERIFY_POSES[Math.floor(Math.random() * VERIFY_POSES.length)];
  const vs = p.verification_status;
  app.innerHTML = `${waves()}<div class="screen">
    <div class="topbar"><a class="icon-btn" href="#/profile" aria-label="Zpět">${I.back({ size: 22 })}</a><h1 style="flex:1;text-align:center">Ověření</h1><span style="width:44px"></span></div>
    <div class="scroll pad" style="text-align:center">
      ${p.verified ? `<div class="empty">${verifiedBadge(72)}<h1>Jsi ověřený/á!</h1><p class="lead">U tvého profilu svítí odznak ověření.</p></div>`
      : vs === 'pending' ? `<div class="empty">${I.shield({ size: 64, color: '#C084FC' })}<h1>Čeká na kontrolu</h1><p class="lead">Tvoje selfie zkontrolujeme, obvykle do 24 hodin. Dáme ti vědět.</p></div>`
      : `<p class="script" style="transform:none;margin-top:8px">ukaž, že jsi to ty</p>
        <h1 style="margin:6px 0 10px">Ověř se selfie</h1>
        ${vs === 'rejected' ? '<p class="lead" style="color:#FCA5A5">Minulé ověření neprošlo – ujisti se, že je na fotce dobře vidět obličej a gesto.</p>' : ''}
        <div class="pose-card"><span class="pose-emoji">${pose.split(' ').pop()}</span><div><b>Vyfoť se a ukaž:</b><span>${esc(pose)}</span></div></div>
        <ul class="ver-list">
          <li>${I.check({ size: 18, color: '#34D399' })} Obličej musí být dobře vidět a odpovídat fotkám v profilu</li>
          <li>${I.check({ size: 18, color: '#34D399' })} Selfie uvidí jen náš tým, nikdy ostatní uživatelé</li>
          <li>${I.check({ size: 18, color: '#34D399' })} Po schválení získáš odznak ${verifiedBadge(16)}</li>
        </ul>
        <label class="btn btn-primary" style="margin-top:18px;cursor:pointer">${I.camera({ size: 20, color: '#fff' })} Vyfotit selfie
          <input type="file" accept="image/*" capture="user" class="sr-only" id="selfie"></label>`}
    </div></div>`;
  const inp = $('#selfie');
  if (inp) inp.onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    toast('Nahrávám…');
    try {
      const blob = await resizeImage(f, 1080);
      const path = `${uid()}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from('verifications').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { error: e2 } = await sb.from('profiles').update({ verification_status: 'pending', verification_path: `${path}|${pose}` }).eq('id', uid());
      if (e2) throw e2;
      await loadMe();
      toast('Odesláno ke kontrole ✓');
      renderVerify();
    } catch (err) { toast(errText(err)); }
  };
}

// ---------------------------------------------------------------------
// Administrace
// ---------------------------------------------------------------------
async function renderAdmin(tab) {
  const tabs = { stats: 'Přehled', verify: 'Ověření', reports: 'Nahlášení', users: 'Uživatelé' };
  app.innerHTML = `<div class="screen">
    <div class="topbar"><a class="icon-btn" href="#/profile" aria-label="Zpět">${I.back({ size: 22 })}</a><h1 style="flex:1;text-align:center">Administrace</h1><span style="width:44px"></span></div>
    <div class="admin-tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#/admin/${k}" ${k === tab ? 'aria-current="page"' : ''}>${v}</a>`).join('')}</div>
    <div class="scroll pad" id="adm" style="padding-top:10px"><div class="empty"><div class="spinner"></div></div></div></div>`;
  const box = $('#adm');
  const fail = (e) => { box.innerHTML = `<p class="lead">${esc(errText(e))}</p>`; };

  if (tab === 'stats') {
    const { data, error } = await sb.rpc('admin_stats');
    if (error) return fail(error);
    const s = data[0];
    const tile = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
    box.innerHTML = `<div class="stats">${tile(s.users, 'uživatelů')}${tile(s.new_today, 'nových za 24 h')}${tile(s.active_today, 'aktivních za 24 h')}
      ${tile(s.matches, 'shod')}${tile(s.messages, 'zpráv')}${tile(s.subscribers, 'předplatitelů')}
      ${tile(s.pending_verifications, 'čeká na ověření')}${tile(s.open_reports, 'otevřených nahlášení')}</div>`;
  }

  if (tab === 'verify') {
    const { data, error } = await sb.rpc('admin_pending');
    if (error) return fail(error);
    if (!data.length) { box.innerHTML = '<div class="empty"><h1>Nic ke kontrole</h1><p class="lead">Všechna ověření jsou vyřízená ✓</p></div>'; return; }
    const items = await Promise.all(data.map(async (u) => {
      const [path, pose] = (u.verification_path || '').split('|');
      let url = '';
      if (path) { const { data: sgn } = await sb.storage.from('verifications').createSignedUrl(path, 600); url = sgn ? sgn.signedUrl : ''; }
      return { ...u, url, pose };
    }));
    box.innerHTML = items.map((u) => `<div class="adm-card">
      <div class="adm-top"><b>${esc(u.name)}, ${esc(u.age)}</b><span class="small muted">Gesto: ${esc(u.pose || '?')}</span></div>
      <div class="adm-photos"><figure><img src="${esc(u.url)}" alt="Selfie"><figcaption>Selfie</figcaption></figure>
        ${(u.photos || []).slice(0, 2).map((ph) => `<figure><img src="${esc(ph)}" alt="Fotka z profilu"><figcaption>Profil</figcaption></figure>`).join('')}</div>
      <div class="row"><button class="btn btn-outline btn-sm" data-rej="${u.id}">Zamítnout</button><button class="btn btn-primary btn-sm" data-ok="${u.id}">Schválit ✓</button></div></div>`).join('');
    $$('[data-ok]', box).forEach((b) => (b.onclick = async () => { const { error: e } = await sb.rpc('admin_verify', { uid: b.dataset.ok, approve: true }); if (e) return toast(errText(e)); toast('Schváleno ✓'); renderAdmin('verify'); }));
    $$('[data-rej]', box).forEach((b) => (b.onclick = async () => { const { error: e } = await sb.rpc('admin_verify', { uid: b.dataset.rej, approve: false }); if (e) return toast(errText(e)); toast('Zamítnuto.'); renderAdmin('verify'); }));
  }

  if (tab === 'reports') {
    const { data, error } = await sb.rpc('admin_reports');
    if (error) return fail(error);
    if (!data.length) { box.innerHTML = '<div class="empty"><h1>Žádná nahlášení</h1><p class="lead">Klid na palubě ✓</p></div>'; return; }
    box.innerHTML = data.map((r) => `<div class="adm-card">
      <div class="adm-top"><div style="display:flex;gap:10px;align-items:center"><div class="avatar sm" style="${bgImg(r.reported_photo)}">${r.reported_photo ? '' : initial(r.reported_name)}</div>
        <div><b>${esc(r.reported_name)}</b>${r.reported_banned ? ' <span class="tag red">zablokován</span>' : ''}<div class="small muted">nahlášen(a) celkem ${r.total_reports}×</div></div></div>
        <span class="small muted">${timeLabel(r.created_at)}</span></div>
      <p class="lead" style="font-size:14px">„${esc(r.reason)}“ <span class="muted">– ${esc(r.reporter_name)}</span></p>
      <div class="row"><button class="btn btn-outline btn-sm" data-res="${r.id}">Vyřízeno</button>
        ${r.reported_banned ? '' : `<button class="btn btn-danger btn-sm" data-ban="${r.reported_id}" data-name="${esc(r.reported_name)}">Zablokovat</button>`}</div></div>`).join('');
    $$('[data-res]', box).forEach((b) => (b.onclick = async () => { await sb.rpc('admin_resolve', { rid: +b.dataset.res }); renderAdmin('reports'); }));
    $$('[data-ban]', box).forEach((b) => (b.onclick = async () => {
      if (!(await dialog({ title: `Zablokovat ${b.dataset.name}?`, text: 'Uživatel se přestane zobrazovat ostatním a nebude moct psát ani lajkovat.', ok: 'Zablokovat', danger: true }))) return;
      const { error: e } = await sb.rpc('admin_ban', { uid: b.dataset.ban, ban: true }); if (e) return toast(errText(e)); toast('Zablokováno.'); renderAdmin('reports');
    }));
  }

  if (tab === 'users') {
    box.innerHTML = `<div class="field"><label class="sr-only" for="uq">Hledat</label><input class="input" id="uq" type="search" placeholder="Hledat jméno nebo město…"></div><div id="ul"></div>`;
    const load = async (q) => {
      const { data, error } = await sb.rpc('admin_users', { q });
      if (error) return fail(error);
      $('#ul').innerHTML = data.map((u) => `<div class="list-item" style="cursor:default">
        <div class="avatar" style="${bgImg(u.photo_url)}">${u.photo_url ? '' : initial(u.name)}</div>
        <div class="body"><div class="top"><span class="title">${esc(u.name)}, ${esc(u.age)} ${u.verified ? verifiedBadge(14) : ''}</span>
          ${u.banned ? '<span class="tag red">zablokován</span>' : u.plan ? `<span class="tag">${planName[u.plan]}</span>` : ''}</div>
          <div class="sub">${esc(u.city || '–')} · nahlášení ${u.reports} · aktivní ${timeLabel(u.last_active)}</div></div>
        ${u.id === uid() ? '' : `<button class="btn btn-outline btn-sm" style="width:auto" data-tog="${u.id}" data-b="${u.banned ? 0 : 1}">${u.banned ? 'Odblokovat' : 'Blokovat'}</button>`}</div>`).join('') || '<p class="lead">Nikdo nenalezen.</p>';
      $$('[data-tog]').forEach((b) => (b.onclick = async () => {
        const { error: e } = await sb.rpc('admin_ban', { uid: b.dataset.tog, ban: b.dataset.b === '1' });
        if (e) return toast(errText(e)); load($('#uq').value.trim());
      }));
    };
    let t; $('#uq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 300); };
    load('');
  }
}

// ---------------------------------------------------------------------
// Předplatné
// ---------------------------------------------------------------------
const TIERS = {
  plus: ['Neomezené lajky', 'Vrácení posledního swipu', 'Pokročilé filtry (výška, cíl, děti…)', 'Žádné reklamy'],
  gold: ['Vše z Plus', 'Uvidíš, kdo tě lajkl', 'Kdo mě viděl', 'Top výběr: 10 shod denně', '1 Boost měsíčně', '5 Super Like každý týden'],
  platinum: ['Vše z Gold', '3 Boosty měsíčně', 'Tvoje lajky uvidí jako první', 'Přednostní zobrazení v okolí'],
};
const PERIOD_LABEL = { 1: '1 měsíc', 6: '6 měsíců', 12: '12 měsíců' };
const PERIOD_BADGE = { 1: '', 6: 'Oblíbené', 12: 'Nejvýhodnější' };
const playSku = (tier, months) => `jiskra_${tier}_${months}m`;
const inPlayApp = () => 'getDigitalGoodsService' in window;

function renderPremium() {
  const tier = S.premiumTier, period = S.premiumPeriod;
  const total = C.PRICES[tier][period] * period;
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
  url.searchParams.set('client_reference_id', uid());
  if (S.session.user.email) url.searchParams.set('prefilled_email', S.session.user.email);
  location.href = url.toString();
}

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
    for (const p of purchases) await sb.functions.invoke('play-verify', { body: { sku: p.itemId, purchaseToken: p.purchaseToken } });
    await loadMe();
    toast(S.plan ? `Obnoveno: Jiskra ${planName[S.plan]}` : 'Předplatné už vypršelo.');
    renderPremium();
  } catch (err) { toast(errText(err)); }
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
      const pw = await dialog({ title: 'Nové heslo', text: 'Zadej nové heslo (aspoň 6 znaků).', input: true, ok: 'Uložit' });
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
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me) { touchActive(); loadMatches().then(updateTabbar); } });
}

boot();
