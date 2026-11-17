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

## Eigener Server (VPS)

Die Seite ist statisch: Der Server liefert nur die Dateien aus, die Daten liegen bei Supabase. Benötigt wird ein Linux-Server (z. B. Ubuntu 22.04 oder neuer).

**Diese Dateien gehören auf den Server:** `index.html`, `app.js`, `styles.css`, `emojis.js`, `manifest.webmanifest`, `icon.svg`, `icon-180.png`, `icon-512.png`. Dazu die Konfiguration `deploy/nginx.conf`. `supabase/setup.sql` brauchst du nur einmal, für Supabase.

1. **DNS:** Bei deinem Domain-Anbieter einen A-Eintrag für `example.de` und `www` auf die IP des Servers setzen.
2. **Installieren:** `sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx`
3. **Dateien kopieren:** `sudo mkdir -p /var/www/finanzapp`, dann die Dateien aus der Liste oben nach `/var/www/finanzapp/` kopieren.
4. **Konfiguration:** `sudo cp deploy/nginx.conf /etc/nginx/sites-available/finanzapp`. In der Datei `example.de` durch deine Domain ersetzen. Dann `sudo ln -s /etc/nginx/sites-available/finanzapp /etc/nginx/sites-enabled/`, `sudo rm -f /etc/nginx/sites-enabled/default` und `sudo nginx -t && sudo systemctl reload nginx`.
5. **HTTPS:** `sudo certbot --nginx -d example.de -d www.example.de`. Certbot richtet das Zertifikat ein und leitet HTTP auf HTTPS um.
6. **Supabase:** Als *Site URL* die Adresse `https://example.de` eintragen (siehe oben).

**Updates:** Neue Dateien nach `/var/www/finanzapp/` kopieren. Nginx muss dafür nicht neu gestartet werden.

**Alternative mit Docker:** `deploy/Dockerfile` (Anleitung dort).

**Stand dieser Version:** Der Admin-Tab, „Passwort vergessen“, die geteilten Notizen und die Namensanzeige aus der claude.ai-Version sind hier noch nicht enthalten.
