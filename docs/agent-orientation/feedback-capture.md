# Feedback Capture

TERP Operator embeds the Crikket feedback widget as a root utility after login. This is meant for quick user-testing feedback, screenshots, and recordings without asking testers to install the Crikket browser extension.

## Runtime Shape

- TERP owns the widget mount: `src/client/components/FeedbackCapture.tsx`.
- TERP vendors the Crikket browser SDK at `public/vendor/crikket/capture.global.js`.
- TERP sends the active widget config through `/api/client-config`; do not rely only on Vite build-time envs for deployed Docker builds.
- TERP allows the configured Crikket host and direct upload storage in server CSP `connect-src`; screen/video capture preview uses `blob:` media.
- Crikket owns report storage, uploads, keys, and the dashboard.

## Local Development

The local TERP defaults assume the Crikket dev stack is running:

```bash
VITE_CRIKKET_ENABLED=true
VITE_CRIKKET_HOST=http://localhost:3000
VITE_CRIKKET_KEY=crk_terp_operator_feedback_local
VITE_CRIKKET_SCRIPT_SRC=/vendor/crikket/capture.global.js
```

Set `VITE_CRIKKET_ENABLED=false` in `.env` to remove the widget while debugging TERP UI noise. Production does not mount the widget unless `VITE_CRIKKET_KEY` is set.

## DigitalOcean Staging

The TERP staging app is `terp-agro-staging` in DigitalOcean App Platform. The deployed TERP app points the widget at:

```text
https://terp-crikket-feedback.64.23.130.173.sslip.io
```

Public capture key:

```text
crk_terp_operator_feedback_do
```

As of 2026-05-26, DigitalOcean staging was pointed at branch `codex/crikket-feedback-20260526` for immediate user testing. After this branch merges, switch the App Platform branch back to `main` if it has not already been reset.

Crikket is hosted on a small DigitalOcean droplet because App Platform repeatedly failed while deploying the upstream prebuilt Crikket images with a platform-level `InternalError`.

Known DO resources:

| Resource | Value |
|---|---|
| Droplet | `terp-crikket-feedback-01` |
| Droplet IP | `64.23.130.173` |
| App path on droplet | `/opt/crikket` |
| Managed Postgres | `terp-crikket-feedback-pg` |
| Postgres cluster ID | `5cf4373f-235e-4c1c-9a12-f5cbc3913a9c` |
| Spaces bucket | `terp-crikket-feedback-20260526` |
| Region | `sfo3` |

Do not put secrets in this repo. The droplet has runtime `.env` files under `/opt/crikket`; DigitalOcean stores the managed database password and Spaces keys. If those secrets need rotation, rotate them in DigitalOcean and then update the droplet env files directly.

## Operational Checks

SSH and inspect containers:

```bash
ssh root@64.23.130.173
cd /opt/crikket
docker compose ps
docker compose logs --tail=100 server
docker compose logs --tail=100 web
docker compose logs --tail=100 caddy
```

Smoke test capture authorization from the TERP staging origin:

```bash
curl -sS -X POST \
  https://terp-crikket-feedback.64.23.130.173.sslip.io/api/embed/capture-token \
  -H 'content-type: application/json' \
  -H 'origin: https://terp-agro-staging-5asc2.ondigitalocean.app' \
  -H 'x-crikket-public-key: crk_terp_operator_feedback_do' \
  --data '{}'
```

Expected result: HTTP 200 with a `token` and `expiresAt`.

## Updating Origins

The active capture key allowlist currently includes:

- `https://terp-agro-staging-5asc2.ondigitalocean.app`
- `https://terp-app-b9s35.ondigitalocean.app`
- `http://localhost:5173`
- `http://127.0.0.1:5173`

If a TERP staging URL changes, update the Crikket `capture_public_key.allowed_origins` row for `crk_terp_operator_feedback_do`, update `.do/terp-agro-staging.yaml` if the host/key changes, and rerun a capture-token smoke test.

## Dashboard Login

The seeded Crikket dashboard account is:

```text
owner@terp.test
```

Use the shared TERP demo password already used for local testing. If login fails after a redeploy, first confirm the managed database is still attached and migrations have run.
