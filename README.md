# Hemmafix

Familjens att-göra-lista. Logga in med Google, lägg till sysslor, tilldela dem
till någon i familjen och bocka av. Listan uppdateras i realtid på allas
enheter och kan installeras som app på mobilen (PWA).

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL 17 · Drizzle ORM ·
Better Auth (Google) · Tailwind CSS + shadcn/ui · Zod · Vitest ·
Docker, driftat via [rmstdope-infra](https://github.com/rmstdope/rmstdope-infra).

## Kom igång lokalt

```sh
pnpm install
cp .env.example .env            # fyll i BETTER_AUTH_SECRET, Google-nycklar, ALLOWED_EMAILS

# Postgres (med Docker Compose-pluginen):
docker compose -f docker-compose.dev.yml up -d
# ...eller utan:
docker run -d --name hemmafix-db -p 5432:5432 \
  -e POSTGRES_USER=hemmafix -e POSTGRES_PASSWORD=hemmafix -e POSTGRES_DB=hemmafix \
  -v hemmafix-pgdata-dev:/var/lib/postgresql/data postgres:17-alpine

pnpm db:migrate
pnpm dev                        # http://localhost:3000
```

### Google OAuth

Skapa en OAuth-klient av typen *Web application* i Google Cloud Console
(APIs & Services → Credentials) med dessa redirect-URI:er:

- `http://localhost:3000/api/auth/callback/google`
- `https://hemmafix.rmstdope.eu/api/auth/callback/google`

## Behörighet

Bara verifierade Google-adresser i `ALLOWED_EMAILS` kan logga in. Första
personen som loggar in skapar hushållet (`HOUSEHOLD_NAME`) och blir admin;
övriga blir medlemmar. Datamodellen stöder flera hushåll – inbjudningar
ersätter listan längre fram.

**Ta bort någons åtkomst:** ta bort adressen ur `ALLOWED_EMAILS` och starta om
appen. Listan kontrolleras vid varje anrop, så personen blir utloggad direkt.
Hen syns fortfarande som medlem (och kan ha uppgifter tilldelade) tills
medlemskapet tas bort i databasen:

```sql
delete from membership where user_id = (select id from "user" where email = 'adress@example.com');
```

## Skript

| Kommando | Vad |
|---|---|
| `pnpm dev` | Utvecklingsserver |
| `pnpm build` | Produktionsbygge (standalone) |
| `pnpm test` | Enhetstester (Vitest) |
| `pnpm lint` / `pnpm typecheck` | ESLint / TypeScript |
| `pnpm db:generate` | Skapa migrering från `src/db/schema.ts` |
| `pnpm db:migrate` | Kör migreringar |
| `pnpm db:studio` | Drizzle Studio |

## Struktur

```
src/
  app/            sidor, server actions (actions.ts), API-routes
    api/auth/     Better Auth
    api/events/   Server-Sent Events för realtid (Postgres LISTEN/NOTIFY)
    healthz/      hälsokontroll (kollar databasen)
    release.json/ release-identitet för rmstdope-infra
  components/     UI-komponenter (ui/ = shadcn)
  db/             Drizzle-schema och klient
  lib/            ren logik (validering, datum, allowlist) + tester
  server/         auth, data access layer, frågor
drizzle/          SQL-migreringar
scripts/          migrate.ts – körs vid containerstart
```

## Drift

Imagen (`Dockerfile`) kör migreringar vid start och lyssnar på port 8080 med
`/healthz` och `/release.json` enligt rmstdope-infras applikationskontrakt.
Sätt `GIT_SHA` som build-arg. Migreringar måste vara bakåtkompatibla
(`migration_policy: backward-compatible`).

Bygget behöver varken hemligheter eller databas. Better Auth loggar då
varningar om saknad hemlighet och bas-URL – det är väntat. I drift vägrar
den starta utan `BETTER_AUTH_SECRET`.

Vid SIGTERM stängs öppna realtidsströmmar så att containern avslutas direkt;
webbläsarna ansluter om automatiskt.
