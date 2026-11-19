Callback URL pro registraci služby na https://vyvojari.seznam.cz/oauth/admin :
https://itfcekypwboljvwyzfkg.supabase.co/functions/v1/seznam-auth/callback
Funkce musí mít vypnuté ověřování JWT (verify_jwt = false), protože ji volá prohlížeč přesměrováním.
