# Jiskra – návod krok za krokem (jen s Android telefonem)

## Na čem aplikace běží (v kostce)

| Část | Služba | Cena | K čemu je |
|---|---|---|---|
| Kód aplikace | **GitHub** (repozitář Jiskra) | zdarma | tady jsou všechny soubory |
| Aplikace (to, co uživatel vidí) | **Netlify** | zdarma | „hosting“ – bere soubory z GitHubu a zveřejní je na adrese `…netlify.app` |
| Databáze, přihlášení, chat, fotky | **Supabase** | zdarma (do určitého počtu uživatelů) | „mozek“ – ukládá profily, lajky, shody a zprávy |
| Android aplikace | **PWABuilder** | zdarma | zabalí web do aplikace pro Google Play |
| Obchod | **Google Play Console** | jednorázový poplatek za vývojářský účet | zveřejnění aplikace |
| Platby předplatného | **Google Play** | provize z prodeje | v Android aplikaci se platí přes Google Play |

Vše nastavíš v prohlížeči Chrome na telefonu. Tablet se hodí, protože má větší obrazovku.

V repozitáři jsou dvě hlavní složky:
- `web/` – samotná aplikace (Netlify ji zveřejní)
- `supabase/` – databáze a serverové funkce (zkopíruješ do Supabase)

---

## Krok 1 – Supabase (databáze) · cca 10 minut

1. Otevři **supabase.com** → *Start your project* → přihlas se (třeba přes GitHub nebo Google).
2. *New project* → název `jiskra`, vymysli heslo k databázi (ulož si ho), region **Central EU (Frankfurt)** → *Create*.
3. Počkej, až se projekt vytvoří. Pak v menu vlevo otevři **SQL Editor** → *New query*.
4. Otevři v telefonu soubor `supabase/schema.sql` (třeba v aplikaci na textové soubory), označ všechno, zkopíruj, vlož do editoru a dej **Run**. Musí se objevit „Success“.
5. V menu **Project Settings → API** si zkopíruj:
   - **Project URL** (např. `https://abcd.supabase.co`)
   - **anon public** klíč (dlouhý text). Tenhle klíč je veřejný a do aplikace patří.
   - ⚠️ Klíč **service_role** nikdy nikam nevkládej, ten je tajný.

## Krok 2 – Netlify (hosting) · cca 5 minut

Soubory už jsou na GitHubu v repozitáři **Jiskra**, ten krok je hotový.

1. Na GitHubu otevři složku `web` → soubor **config.js** → ikonka tužky (Edit) → místo `DOPLN-…` vlož **Project URL** a **anon** klíč ze Supabase → **Commit changes**.
2. Otevři **netlify.com** → *Sign up* → **přihlas se přes GitHub**.
3. **Add new site → Import an existing project → GitHub** → povol přístup → vyber repozitář **Jiskra** → **Deploy**. (Nastavení se načte samo ze souboru `netlify.toml`.)
4. **Site configuration → Change site name** → napiš třeba `jiskra-seznamka`.
5. Aplikace běží na **`https://jiskra.marasafi2504.workers.dev`** 🎉
   Každá změna na GitHubu se na Netlify sama projeví za chvilku.

## Krok 3 – Propojení přihlášení

V Supabase: **Authentication → URL Configuration**
- *Site URL*: `https://jiskra.marasafi2504.workers.dev`
- *Redirect URLs*: přidej `https://jiskra.marasafi2504.workers.dev/**`

Tím budou fungovat odkazy v e-mailech (potvrzení registrace, zapomenuté heslo).

## Krok 4 – Vyzkoušej to

Otevři `https://jiskra.marasafi2504.workers.dev` v Chrome → zaregistruj se → vyplň profil.
Shodu vyzkoušíš tak, že si založíš **druhý účet** (s jiným e-mailem, třeba na tabletu) a navzájem se lajknete.

> V Chrome si aplikaci můžeš hned nainstalovat: ⋮ → *Přidat na plochu / Instalovat aplikaci*.

## Krok 5 – PWABuilder → Android aplikace

1. Na **pwabuilder.com** vlož `https://jiskra.marasafi2504.workers.dev` → **Start**.
2. *Package for stores* → **Android** → *Generate package*.
   - *Package ID*: např. `cz.jiskra.app` (pak už ho neměň)
   - *App name*: Jiskra
   - *Signing key*: **Create new** (vyplň jméno a hesla a **ulož si je**)
   - Zapni **Play Billing** (pokud ho nabídne v rozšířených volbách)
3. Stáhni ZIP. **Ten ZIP pečlivě uschovej** (třeba na Google Disk). Je v něm podpisový klíč a bez něj už nikdy nevydáš aktualizaci.
4. V ZIPu najdeš soubor **`assetlinks.json`**. Na GitHubu otevři složku `web` → **Add file → Create new file**, jako název napiš `.well-known/assetlinks.json`, vlož do něj obsah toho souboru a dej **Commit**.
   Díky tomu se aplikace otevře na celou obrazovku, bez adresního řádku prohlížeče.

## Krok 6 – Google Play

1. **play.google.com/console** → založ vývojářský účet. Platí se jednorázový registrační poplatek a ověřuje se totožnost.
2. *Vytvořit aplikaci* → nahraj soubor **`.aab`** z PWABuilder ZIPu.
3. Vyplň: popis, snímky obrazovky, ikonu (`icon-512.png`), kategorii (*Seznamování*), věkové hodnocení, formulář *Zabezpečení dat* a **odkaz na zásady ochrany soukromí** (je povinný).
4. ⚠️ Nové osobní účty musí aplikaci před zveřejněním nějakou dobu testovat s testery (uzavřený test). Aktuální podmínky ti ukáže přímo Play Console.

## Krok 7 – Předplatné přes Google Play

1. V Play Console: **Zpeněžení → Produkty → Předplatná** → vytvoř 9 předplatných s **přesně** těmito ID (každé s jedním základním tarifem):
   `jiskra_plus_1m`, `jiskra_plus_6m`, `jiskra_plus_12m`,
   `jiskra_gold_1m`, `jiskra_gold_6m`, `jiskra_gold_12m`,
   `jiskra_platinum_1m`, `jiskra_platinum_6m`, `jiskra_platinum_12m`
   Ceny nastav stejné jako v `config.js` (sekce `PRICES`), nebo uprav obě místa.
2. V Supabase: **Edge Functions → Deploy a new function → Via Editor** → název `play-verify` → vlož obsah `supabase/functions/play-verify/index.ts` → *Deploy*.
3. **Edge Functions → Secrets** → přidej:
   - `ANDROID_PACKAGE` = tvoje Package ID (např. `cz.jiskra.app`)
   - `GOOGLE_SERVICE_ACCOUNT` = JSON klíč servisního účtu z Google Cloud, který v Play Console pozveš (*Uživatelé a oprávnění*) s právy na finanční údaje a objednávky.
   Tenhle krok je nejtechničtější. Až k němu dojdeš, napiš mi a projdeme ho spolu.

> **Platby přes Stripe (`stripe-webhook`) jsou volitelné** – hodí se, jen pokud chceš předplatné prodávat i na webu. V Android aplikaci musí jít platba přes Google Play.

---

## Jak aplikaci později upravit

Změníš soubor na GitHubu (tužka → *Commit*), Netlify ho sám zveřejní a za chvilku se změna projeví všem, **i v Android aplikaci**, bez nahrávání nové verze do Google Play.
Při větší změně zvyš v `sw.js` číslo `VERZE` (např. `jiskra-v2`), aby se lidem načetla nová verze.

## Co ještě bude potřeba před spuštěním
- Zásady ochrany soukromí a podmínky používání (odkazy dáš do `config.js`)
- E-mail podpory v `config.js`
- Ověřování profilů (selfie) – sloupec `verified` zatím ručně nastavuješ v Supabase → *Table Editor → profiles*
- Kontrola nahlášených uživatelů: Supabase → *Table Editor → reports*
