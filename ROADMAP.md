# Roadmap: Juna & Matti

## Stand

- **Version 1.0:** läuft auf claude.ai (Link `Gw3BVM9g9qBC34CLXrKwhT`). Dort ist der volle Funktionsumfang gebaut, der Speicher liegt bei claude.ai.
- **Version 1.5:** läuft auf eigenen Servern. Grundlage ist die Repo-Version (`app.js`, Supabase als Datenbank). Dort fehlt noch alles, was nach dem Umzug in der claude.ai-Version dazugekommen ist.

## Version 1.5: Umstellung auf eigene Server

Alles, was in der claude.ai-Version schon gebaut ist, muss in `app.js` übertragen werden:

- [ ] Admin-Tab mit Passwort setzen, Preisen, Personen, Spalten und Daten
- [ ] Admin-Rechte nur im Admin-Tab, sonst wie eine normale Person
- [ ] Passwort-Anfragen im Admin-Tab, Zähler am Admin-Button
- [ ] „Passwort vergessen“ auf dem Login-Screen (Reset über Supabase klären)
- [ ] Geteilte Notizen und To-do-Listen (privat oder mit Personen)
- [ ] Verbesserungsvorschläge mit Status (offen, umgesetzt, nicht umgesetzt) und Nachrichten bei Ablehnung
- [ ] Profilfotos (eigenes Profil, Admin für alle Profile)
- [ ] Preise nach Käufer, Beträge nur bei eigenen Käufen
- [ ] Name und Username nur einmal anzeigen, wenn sie gleich sind
- [ ] Juna steht im Dialog „Bei wem kauft …?“ immer vorne
- [ ] Versionsnummer in `index.html` auf 1.5 setzen

Vor dem Start auf der Domain:

- [ ] Supabase-Setup ausführen (`supabase/setup.sql`) und Registrierung danach schließen
- [ ] App-Icon auf dem iPhone prüfen (Safari, „Zum Home-Bildschirm“)
- [ ] Admin-Schutz serverseitig prüfen (aktuell nur in der App)

## Offene Entscheidungen

- [ ] **Kontostand:** Wenn Matti bei Laura kauft, steigt Lauras Kontostand um den Preis, den Matti zahlt. Entweder lassen oder der Verkäufer bekommt einen festen Preis.
- [ ] **Rabatt pro Person:** Ohne eigenen Rabatt übernimmt eine Person den Standardrabatt (12 € ab 10 Stück). Im Admin-Tab bei jeder Person prüfen.
- [ ] **Bestehende Preise:** Preise, die vor der Umstellung pro Person eingetragen wurden, gelten jetzt als Preis für die kaufende Person. Prüfen.
- [ ] **Nachricht bei „Umgesetzt“:** Soll die Person dafür auch eine Nachricht bekommen?
- [ ] **Foto-Hinweis:** Soll unter dem Foto-Knopf stehen „Foto aus der Fotomediathek wählen“?

## Später

- [ ] Push-Benachrichtigungen für Nachrichten und Anfragen (braucht die eigenen Server)
- [ ] Gruppenchat (Idee, noch nicht entschieden)
