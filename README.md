# FinanzAppOX

Familien-Finanz-App („Juna & Matti“). Eine statische Web-App (HTML, CSS, JavaScript) mit Supabase als Datenbank, Anmeldung und Live-Sync.

## Einrichtung über die eigene Domain

### 1. Supabase einrichten (einmalig)

1. Im Supabase-Dashboard das Projekt `xrufazpqxaibxfdztmim` öffnen.
2. **SQL Editor → New query**, den Inhalt von [`supabase/setup.sql`](supabase/setup.sql) einfügen und **Run** drücken.
3. **Authentication → URL Configuration:** als *Site URL* deine Domain eintragen, z. B. `https://familie.example.de`.
4. **Authentication → Providers → Email:** *Confirm email* ausgeschaltet lassen (Anmeldung mit Username und Passwort, die App nutzt dafür fingierte Adressen `username@finanzapp.app`).
5. Wenn Juna und Matti beide registriert sind: **Authentication → Providers → Email** die Option *Allow new users to sign up* ausschalten. Sonst kann jeder, der die Seite kennt, ein Konto anlegen und mitlesen.

### 2. Die Seite auf die Domain legen (Cloudflare Pages)

1. Bei Cloudflare **Workers & Pages → Create → Pages → Connect to Git** und das GitHub-Repo `1312Fizz161/FinanzAppOX` auswählen.
2. Einstellungen: *Production branch* = `claude/sleepy-sagan-h4uvhx`, *Framework preset* = None, *Build command* leer, *Build output directory* = `/` (das Repo liegt im Wurzelverzeichnis).
3. **Custom domains → Set up a custom domain:** deine Domain eintragen.
   - Liegt die Domain schon bei Cloudflare, richtet Cloudflare den DNS-Eintrag automatisch ein.
   - Liegt sie woanders, legst du beim Anbieter einen **CNAME** an: Name = `www` (oder der gewünschte Subdomain-Name), Ziel = `<projektname>.pages.dev`. Für die nackte Domain (ohne `www`) musst du die Nameserver zu Cloudflare umstellen.
4. Cloudflare stellt das HTTPS-Zertifikat selbst aus. Danach ist die App unter deiner Domain erreichbar.

Jeder Push auf den Produktionsbranch veröffentlicht die Seite neu.

Alternative: Netlify. Dort *Add new site → Import from GitHub*, *Publish directory* = `.`.

### 3. Auf dem Handy installieren

Seite in Safari (iPhone) oder Chrome (Android) öffnen → Teilen → **Zum Home-Bildschirm**.

## Wie der Sync funktioniert

- Jede Änderung (Kauf, Anfrage, Notiz …) wird als ganzer Stand in die Zeile `app_state` geschrieben.
- Über Supabase Realtime bekommen alle offenen Geräte die Änderung sofort.
- Wer die App gerade nicht offen hat, sieht den neuen Stand beim nächsten Öffnen.
- Eine Push-Benachrichtigung aufs Handy ist noch nicht enthalten.

## Admin

- *Admin werden* läuft über das Admin-Passwort in der App. Die Prüfung passiert nur in der App, nicht auf dem Server.
- Ein vergessenes Passwort setzt du in der Supabase-Version im Dashboard unter **Authentication → Users**: das Konto öffnen und dort das Passwort neu setzen. Die genaue Schaltfläche heißt je nach Dashboard-Version anders.
- Der Admin-Tab und „Passwort vergessen“ aus der claude.ai-Version sind in dieser Version noch nicht enthalten.

## Lokal ausprobieren

`index.html` im Browser öffnen. Ohne Supabase-Verbindung funktioniert die App nur lokal, und dort werden keine Daten geteilt.
