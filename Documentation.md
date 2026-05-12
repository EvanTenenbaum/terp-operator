# TERP Agro Documentation Notes

The user-facing runbook lives in `README.md`. Deployment is self-hosted with Docker Compose and PostgreSQL 16. Operational data remains inside the owner-controlled database and local archive/journal files.

Verification completed locally on 2026-05-11:

- `pnpm install`
- `colima start --cpu 2 --memory 4 --disk 20`
- `docker compose up -d postgres`
- `pnpm db:migrate`
- `pnpm db:seed`
- `pnpm typecheck`
- `pnpm build`
- `pnpm audit:parity`
- `pnpm exec playwright install chromium`
- `pnpm test:e2e`
- `curl -s http://localhost:8787/api/health`

Backend/frontend parity details live in `docs/backend-frontend-parity-audit.md`.
Latest Playwright run after the parity pass: 10 passed.
Ease-of-use frontend pass details live in `docs/ease-of-use-frontend-pass.md`.
