# Driftsättning på rmstdope-infra

Hemmafix körs med profilen `fullstack` i
[rmstdope-infra](https://github.com/rmstdope/rmstdope-infra): en `web`-container
(den här imagen) som tar all trafik på `hemmafix.rmstdope.eu`, och en privat
Postgres. Caddy på VPS:en sköter HTTPS.

| Fil | Innehåll |
|---|---|
| `runtime/app.json` | Metadata: domän, profil, image-repo, port, hälsokontroll, CI-källa |
| `runtime/compose.json` | `web` + `db`, interna nätverket `private`, volymen `rmstdope-hemmafix-db-v1` |
| `runtime/route.caddy` | Standardrouten, exakt `config.scaffold(app)` |
| `smoke-test.sh` | CI-test av den färdiga imagen mot bundlens Postgres-image |
| `preserve-manifest.sh` | Ser till att en omkörning av CI aldrig byter digest för en redan publicerad revision |

**Registreringen fryses på värden.** Det finns inget kommando för att ändra den i
efterhand, så ändringar i `runtime/` (Postgres-version, minnesgränser, hemlighetsfiler,
miljövariabler) kräver en separat granskad procedur. Vanliga releaser byter bara
`web`-imagens digest.

## CI och publicering

`.github/workflows/ci.yml` körs på varje PR och push till `main`, med ett undantag för ändringar
som bara rör `docs/` (skisser och dokument):

- En sådan **PR** får sina tre obligatoriska kontroller (`checks`, `e2e`, `production-image`)
  gröna direkt: jobben startar men hoppar över sina steg (`scripts/ci-needed.sh`).
- En sådan **push till `main`** startar ingen körning, så ingen image publiceras och inget
  driftsätts. Det måste vara ingen körning alls: rmstdope-infra tar den senaste lyckade körningen
  och kräver att den har ett `deployment-manifest`. GitHub avgör det utifrån pushens första 300
  filer; blir en större push överhoppad av misstag publiceras koden med nästa kodändring.

Annars gäller:

1. **checks**: lint, typkontroll, enhetstester, migreringar mot en tom Postgres,
   kontroll att schema och migreringar stämmer, produktionsbygge.
2. **production-image**: bygger imagen (`GIT_SHA` inbakad) och röktestar exakt den
   (hälsa, `release.json`, migreringar, omstart, snabb stopp).
3. **publish** (bara `main`): pushar den testade imagen till
   `ghcr.io/rmstdope/hemmafix:<sha>` utan att bygga om och laddar upp artefakten
   `deployment-manifest` med `deployment.json`:
   `{"revision": "<sha>", "images": {"web": "ghcr.io/rmstdope/hemmafix@sha256:…"}}`.

## Engångsförberedelser

1. **Infrastruktur:** VPS:en ska köra en installerad rmstdope-infra-version som har
   profilen `fullstack` (PR #23 eller senare), och operatörs-CLI:t ska vara lika nytt.
2. **DNS:** `hemmafix.rmstdope.eu` ska peka på VPS:en (täcks av wildcard-posten om den finns).
3. **Första imagen:** merga till `main` och vänta tills CI är grönt, så finns
   paketet `ghcr.io/rmstdope/hemmafix`.
4. **Pakettillgång:** ge VPS:ens registry-identitet läsrätt till paketet
   (GitHub → Packages → hemmafix → Package settings), eller gör det publikt.
5. **GitHub-token på VPS:en:** lägg till `rmstdope/hemmafix` i den dedikerade
   tokenens repo-lista med läsrätt för *Contents* och *Actions*.
6. **Google OAuth:** redirect-URI:n `https://hemmafix.rmstdope.eu/api/auth/callback/google`
   ska finnas på OAuth-klienten (se huvud-README).

### Hemligheter

Båda filerna ska finnas **innan** registreringen, eftersom den validerar Compose med
dem. Skapa dem på VPS:en. Klistra aldrig in värdena i chatt eller i Git.

```sh
sudo install -d -m 0700 /srv/rmstdope/secrets/hemmafix
DB_PASSWORD="$(openssl rand -hex 24)"     # bara hex, då behövs ingen URL-kodning

sudo tee /srv/rmstdope/secrets/hemmafix/db.env >/dev/null <<EOF
POSTGRES_USER=hemmafix
POSTGRES_PASSWORD=$DB_PASSWORD
POSTGRES_DB=hemmafix
EOF

sudo tee /srv/rmstdope/secrets/hemmafix/web.env >/dev/null <<EOF
DATABASE_URL=postgres://hemmafix:$DB_PASSWORD@db:5432/hemmafix
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
GOOGLE_CLIENT_ID=<från Google Cloud Console>
GOOGLE_CLIENT_SECRET=<från Google Cloud Console>
ALLOWED_EMAILS=<adress1>,<adress2>
HOUSEHOLD_NAME=<hushållets namn, t.ex. Familjen>
EOF

sudo chmod 0600 /srv/rmstdope/secrets/hemmafix/*.env
unset DB_PASSWORD
```

`BETTER_AUTH_URL` och `PORT` står direkt i `compose.json`. Ändrar du `ALLOWED_EMAILS`
eller Google-nycklarna i `web.env` får du starta om appen med
`rmstdope-deploy restart hemmafix`. Det räknas inte som en ändring av registreringen.
Omstarten pausar automatiska uppdateringar, så slå på dem igen efteråt med
`rmstdope-deploy auto resume hemmafix`.

## Registrera, deploya och slå på automatiska uppdateringar

Från hemmafix-repot, med operatörs-CLI:t konfigurerat:

```sh
rmstdope-deploy app register hemmafix --bundle deploy/runtime
rmstdope-deploy validate hemmafix
rmstdope-deploy release hemmafix --latest
rmstdope-deploy auto enroll hemmafix
rmstdope-deploy auto status hemmafix
rmstdope-deploy auto resume hemmafix
```

Efter första releasen:

- Öppna https://hemmafix.rmstdope.eu och logga in. Den första tillåtna personen
  skapar hushållet och blir admin.
- Kontrollera att realtid fungerar genom Caddy: ha appen öppen på två enheter och
  bocka av något på den ena.

## Databas, migreringar och backup

- Migreringar körs när containern startar, under ett advisory lock. De måste vara
  **bakåtkompatibla**, eftersom en rollback bara byter image och aldrig backar schemat
  eller datan.
- **Backup:** än så länge finns det bara datan i volymen. Ta en manuell dump före
  riskabla ändringar:

  ```sh
  # Compose-projektet heter rmstdope-hemmafix, så containern heter rmstdope-hemmafix-db-1.
  sudo docker exec rmstdope-hemmafix-db-1 \
    sh -c 'pg_dump -U "$POSTGRES_USER" --format=custom "$POSTGRES_DB"' > hemmafix-$(date +%F).dump
  ```

  Förvara dumpar utanför VPS:en. Dumpar på samma disk skyddar inte mot att värden går förlorad.
- **Automatisk dump före releaser:** `deploy/runtime/app.json` har fältet
  `pre_release_backup`. Före en release, manuell eller automatisk, kör rmstdope-infra
  `pg_dump` i `db`-tjänsten i den release som är igång och sparar dumpen som
  `pre-release.dump` i den nya releasens katalog på VPS:en. `timeout 290` stoppar `pg_dump`
  inne i containern strax före rmstdope-infras gräns på 300 sekunder, eftersom
  rmstdope-infra bara kan döda sin egen klient.
  - Förutsättningar: rmstdope-infra PR #24 är installerad både i operatörs-CLI:t (manuella
    kommandon skickar CLI:ts egen worker) och på VPS:en (pollern), och hemmafix är
    omregistrerad från den här versionen av `deploy/runtime` (registreringen är fryst).
  - Ingen dump tas vid den allra första releasen, eller när releasen körs med `--skip-backup`.
  - Misslyckas dumpen startar releasen inte, den gamla fortsätter köra och automatiska
    uppdateringar pausas. En trasig backup stoppar alla releaser, även den som ska laga den.
    Vägen förbi är `rmstdope-deploy release hemmafix … --skip-backup`, som ger en release
    utan dump. Automatiska uppdateringar hoppar aldrig över dumpen.
  - Dumpen raderas tillsammans med sin release: misslyckade releaser efter sju dagar,
    lyckade när de inte längre är aktuell, föregående eller bland de fem senaste.
  - Återställning görs alltid för hand, eftersom den raderar allt som skrivits efter dumpen.
    Följ rmstdope-infras runbook, *Restore a pre-release database dump* i
    `docs/operations.md`. `rollback` och en misslyckad release skriver ut sökvägen när
    dumpen går att återställa till den release som då körs. Annars varnar de för att
    återställa den.
  - Dumparna ligger på samma disk som databasen. De skyddar mot en dålig migrering, inte mot
    att värden går förlorad, så den manuella dumpen ovan ska fortfarande förvaras utanför VPS:en.
