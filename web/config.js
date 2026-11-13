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
export const PRICES = {
  plus:     { 1: 199, 6: 129, 12: 99 },
  gold:     { 1: 349, 6: 229, 12: 169 },
  platinum: { 1: 499, 6: 329, 12: 249 },
};

// Reklamy (Google AdSense) – zobrazují se jen uživatelům bez předplatného.
// Po schválení AdSense sem vlož ID vydavatele (ca-pub-…) a ID reklamních jednotek.
// Dokud jsou prázdné, místo reklamy se ukazuje nabídka Jiskra Gold.
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

// Boost Coiny – balíčky (stejné kódy produktů musí být v Google Play → Produkty v aplikaci)
// price = cena v Kč, jen pro zobrazení na webu; v aplikaci z Google Play se ukáže cena přímo z Google Play
export const COIN_PACKS = [
  { sku: 'jiskra_coins_1000', coins: 1000, bonus: 0, price: 300 },
  { sku: 'jiskra_coins_2500', coins: 2500, bonus: 250, price: 750 },
  { sku: 'jiskra_coins_5000', coins: 5000, bonus: 750, price: 1500, badge: 'Oblíbené' },
  { sku: 'jiskra_coins_10000', coins: 10000, bonus: 2000, price: 3000, badge: 'Nejvýhodnější' },
];
// Ceny za coiny – musí odpovídat funkci coin_price() v databázi
export const COIN_COSTS = { boost: 500, super: 100, reveal: 150, rewind: 50 };
export const COIN_VERIFY_BONUS = 500;
