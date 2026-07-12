# Local Docker deployment with Tailscale Funnel

This deployment exposes **only** the CrownFi web service. Postgres, Redis, and the API have no host
ports and must never be funneled.

1. Copy `infra/.env.example` to `infra/.env` and replace every placeholder. Keep this file out of git.
2. Start the private stack: `docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d`.
3. Confirm only the web listener exists: `curl -fsS http://127.0.0.1:3000`.
4. In the Tailscale admin console, enable MagicDNS and HTTPS. Grant the dedicated host tag only the
   `funnel` node attribute; do not enable Funnel for every member.
5. On the host, after signing in and applying `tag:crownfi-demo`, run:
   `tailscale funnel --bg --https=443 http://127.0.0.1:3000`
6. Check with `tailscale funnel status`. To take the site offline immediately, run
   `tailscale funnel reset`, then `docker compose --env-file infra/.env -f infra/docker-compose.yml down`.

Funnel is public HTTPS. It is suitable only for the Testnet demo and only while the Mac remains
powered, connected, and supervised. Rotate `POSTGRES_PASSWORD` and `ADMIN_SESSION_SECRET` before
each shared deployment.
