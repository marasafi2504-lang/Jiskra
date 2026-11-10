// =====================================================================
// NASTAVENÍ – tady vyplň své údaje (návod v README.md)
// =====================================================================

// Supabase → Project Settings → API
export const SUPABASE_URL = 'https://DOPLN-PROJEKT.supabase.co';
export const SUPABASE_ANON_KEY = 'DOPLN-ANON-PUBLIC-KLIC';

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

// Odkazy na právní dokumenty (povinné pro Google Play i App Store)
export const TERMS_URL = '#';
export const PRIVACY_URL = '#';
export const SUPPORT_EMAIL = 'podpora@example.com';
