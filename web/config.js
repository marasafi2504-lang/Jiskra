// =====================================================================
// NASTAVENÍ – tady vyplň své údaje (návod v README.md)
// =====================================================================

// Supabase → Project Settings → API
export const SUPABASE_URL = 'https://itfcekypwboljvwyzfkg.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0ZmNla3lwd2JvbGp2d3l6ZmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQzMzk0MjUsImV4cCI6MjEwOTkxNTQyNX0.5xhst48-6yek7JliVjQ89qi3iQ1KY8AKZ9YrieTmhnc';

// Přihlášení přes sociální sítě: tlačítka se ukážou automaticky podle toho,
// co je zapnuté v Supabase → Authentication → Sign In / Providers.
// Tento seznam je jen záloha, kdyby se nastavení nepodařilo načíst.
export const AUTH_PROVIDERS = ['google'];

// Veřejný klíč pro push notifikace (soukromý je jen v databázi)
export const VAPID_PUBLIC_KEY = 'BFQrGKPOvP8zYQh-ga2C0E6DuVY03zCHtuWD_qaccFhCIBj2uesHXVdWKLSOU0fq0rA_BhbNnVKkUeOlI71nt6k';

// Stripe → Payment Links (jeden odkaz pro každý tarif a délku)
// Prázdný odkaz = tlačítko zaplatit ukáže hlášku „Brzy dostupné“.
export const PAYMENT_LINKS = {
  plus:     { 1: '', 6: '', 12: '' },
  gold:     { 1: '', 6: '', 12: '' },
  platinum: { 1: '', 6: '', 12: '' },
};

// Stripe → Settings → Billing → Customer portal (odkaz pro správu / zrušení předplatného)
export const CUSTOMER_PORTAL_URL = '';

// Ceny zobrazené v aplikaci (Kč za měsíc) – musí odpovídat cenám ve Stripe
// Nabídka pro ty, kdo chtěli smazat účet a rozmysleli si to (v Google Play založ produkt s tímto ID)
// Věčný plamen – doživotní tarif Slunce (jednorázový nákup v Google Play)
export const LIFETIME = { sku: 'plaminek_vecny_plamen', price: 3990, promo: 2990, promoCount: 100, bonus: 10000 };
export const WINBACK = { tier: 'plus', price: 79, sku: 'jiskra_plus_1m_sleva' };

export const PRICES = {
  // Plamen / Vatra / Slunce (vlastní názvy, interní klíče plus/gold/platinum zůstávají kvůli Google Play)
  plus:     { 1: 139, 6: 99, 12: 79 },
  gold:     { 1: 239, 6: 169, 12: 139 },
  platinum: { 1: 369, 6: 259, 12: 219 },
};

// Reklamy (Google AdSense) – zobrazují se jen uživatelům bez předplatného.
// Po schválení AdSense sem vlož ID vydavatele (ca-pub-…) a ID reklamních jednotek.
// Dokud jsou prázdné, místo reklamy se ukazuje nabídka předplatného Vatra.
export const ICE_SERVERS = []; // volitelně TURN server pro videohovory přes mobilní data
export const ADS = {
  adsenseClient: '',            // např. 'ca-pub-1234567890123456'
  slots: { discover: '', chats: '', profile: '' },
  everySwipes: 8,               // reklamní karta v Objevuj po každých N swipech
};

// Odkazy na právní dokumenty (povinné pro Google Play i App Store)
export const TERMS_URL = 'podminky.html';
export const PRIVACY_URL = 'soukromi.html';
export const SUPPORT_EMAIL = 'jiskra.podpora@gmail.com';

// Jiskry (virtuální měna) – balíčky (stejné kódy produktů musí být v Google Play → Produkty v aplikaci)
// price = cena v Kč, jen pro zobrazení na webu; v aplikaci z Google Play se ukáže cena přímo z Google Play
export const COIN_PACKS = [
  { sku: 'jiskra_coins_1000', coins: 1000, bonus: 0, price: 189 },
  { sku: 'jiskra_coins_2500', coins: 2500, bonus: 250, price: 449 },
  { sku: 'jiskra_coins_5000', coins: 5000, bonus: 750, price: 849, badge: 'Oblíbené' },
  { sku: 'jiskra_coins_10000', coins: 10000, bonus: 2000, price: 1590, badge: 'Nejvýhodnější' },
];
// Ceny za coiny – musí odpovídat funkci coin_price() v databázi
export const COIN_COSTS = { boost: 500, super: 100, reveal: 150, rewind: 50, message: 100 };
export const COIN_VERIFY_BONUS = 500;

export const APP_VERSION = '1.0';

// Přihlášení přes Seznam – zapni (true) až po nastavení SEZNAM_CLIENT_ID a SEZNAM_CLIENT_SECRET v Supabase
export const SEZNAM_ENABLED = true;
