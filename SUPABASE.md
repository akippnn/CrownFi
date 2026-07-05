# Setting up Supabase (the database CrownFi runs on)

CrownFi stores all app data (fans, votes, tickets, collectibles, rounds) in **Postgres**.
The easiest managed Postgres is **Supabase** (free tier is plenty for testing). This guide
takes you from zero to a running app in ~10 minutes.

> The app still runs Stellar and the wallet in **mock mode** (`STELLAR_MODE=mock`,
> `WALLET_PROVIDER=mock`), so you do NOT need any blockchain keys to get going. You only need
> the database.

---

## 1. Create a Supabase project

1. Go to <https://supabase.com> and sign in (GitHub login works).
2. Click **New project**.
3. Fill in:
   - **Name**: `crownfi` (anything).
   - **Database Password**: click **Generate a password** and **copy it somewhere safe** —
     you need it in step 3. (If it contains symbols like `@ : / #`, keep the exact string; step 3
     explains encoding.)
   - **Region**: pick the one closest to you.
4. Click **Create new project** and wait ~2 minutes for it to provision.

---

## 2. Get your two connection strings

CrownFi needs **two** URLs (Prisma uses a pooled connection at runtime and a direct one for
migrations):

1. In your project, click the green **Connect** button in the top bar
   (or go to **Project Settings → Database**).
2. Choose the **ORMs** tab and select **Prisma**. Supabase shows exactly the two lines you need:

   - `DATABASE_URL` — the **pooled** connection (host contains `pooler`, port **6543**, ends with
     `?pgbouncer=true`).
   - `DIRECT_URL` — the **direct** connection (port **5432**).

   If you only see a "Connection string" box instead of the ORMs tab, use:
   - **Transaction pooler** string → `DATABASE_URL` (add `?pgbouncer=true` at the end if missing).
   - **Session pooler / Direct connection** string → `DIRECT_URL`.

3. Both URLs contain `[YOUR-PASSWORD]` — replace that with the password from step 1.
   - **If your password has special characters**, URL-encode them:
     `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `?` → `%3F`, `&` → `%26`.
     (Simplest fix: in Supabase → **Settings → Database → Reset database password** and choose one
     with only letters and numbers.)

---

## 3. Put them in `web/.env`

Open `web/.env` and set these two lines (leave everything else as-is):

```dotenv
DATABASE_URL="postgresql://postgres.abcdxyz:YOURPASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.abcdxyz:YOURPASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
```

(Your real values come from step 2 — the `postgres.<ref>`, region, and password will differ.)

The Prisma schema is already set to Postgres, so no code changes are needed:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## 4. Create the tables and seed data

From the `web/` folder:

```bash
cd web
npm install
npx prisma migrate dev --name init   # creates all tables in your Supabase DB
npm run seed                          # adds 4 contestants, 1 open round, 4 collectibles
npm run dev
```

Open <http://localhost:3000>. The contestant carousel and stats should now load with data.

> `prisma migrate dev` uses `DIRECT_URL` (port 5432); the running app uses `DATABASE_URL`
> (pooled, 6543). If `migrate` hangs or errors, double-check `DIRECT_URL` is the **5432** one.

---

## 5. Verify it worked

- Home page shows the four seeded contestants and non-crashing stats.
- **Supabase → Table Editor** now lists tables: `Fan`, `Contestant`, `VotingRound`, `Vote`,
  `Ticket`, `Collectible`, `Purchase`, `OrganizerRequest`, `Checkpoint`.
- Connect Freighter (top-right menu) → vote → (admin) close the round → verify your receipt.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Unexpected end of JSON input` in the browser | The DB isn't reachable. The app now shows an empty state instead of crashing — check the **terminal** for `[api] read failed`, then fix `DATABASE_URL`. |
| `P1001 Can't reach database server` | Wrong host/port, or the project is still provisioning. Re-copy the strings from **Connect**. |
| `password authentication failed` | Password wrong or not URL-encoded. Reset it in **Settings → Database** and use letters/numbers only. |
| `prepared statement already exists` / pooler errors at runtime | Make sure `DATABASE_URL` ends with `?pgbouncer=true`. |
| Migrations hang | `DIRECT_URL` must be the **5432** (non-pooled) connection. |

---

## Going to production (later)

- Keep secrets out of git — `web/.env` is already `.gitignore`d.
- Rotate the DB password before launch; use Supabase connection pooling limits.
- When you're ready to leave mock mode, deploy the Stellar contracts (see `DEPLOY.md`) and set
  `STELLAR_MODE="live"` with the printed contract ids.
