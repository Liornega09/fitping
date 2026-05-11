# FitPing Workout Bot

Simple WhatsApp-first workout logger backend.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Liornega09/fitping)

## Stack
- Node.js + TypeScript
- Fastify webhook
- Prisma + PostgreSQL

## Quick start
1. Install Node.js 20+ and npm.
2. Copy `.env.example` to `.env` and fill values.
3. Install deps: `npm install`
4. Generate Prisma client: `npm run prisma:generate`
5. Run migrations: `npm run prisma:migrate -- --name init`
6. Seed exercises: `npm run seed`
7. Start server: `npm run dev`

## Deploy to Render

Click the button above or follow these steps:

1. Fork this repo.
2. Go to [render.com](https://render.com) → New → Blueprint.
3. Connect your fork — Render reads `render.yaml` and creates:
   - Web service (FitPing API)
   - PostgreSQL database
   - Two cron jobs (weekly summary + nudge)
4. Set the secret env vars in the Render dashboard:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
   - `INTERNAL_JOBS_TOKEN` (any random string)
   - `OPENAI_API_KEY` (optional — enables LLM fallback)
5. After deploy, point your Twilio WhatsApp webhook to:
   `https://<your-service>.onrender.com/webhooks/whatsapp`

> Note: Render free-tier web services spin down after inactivity.
> For production use, upgrade to a paid plan or use an external uptime monitor.

## Endpoint
- `POST /webhooks/whatsapp`

Expected incoming fields (Twilio form post):
- `From`
- `Body`

Returns JSON:
- `{ "reply": "..." }`

By default, this endpoint returns TwiML XML for Twilio. Add `?format=json` for local JSON tests.

## MVP commands
- `start A`
- `bench 28 10,10,8`
- `done`
- `undo`
- `summary today`
- `summary week`
- `progress bench`
- `weight 92.4`
- `sleep 6.5`
- `energy 7`
- `pain right shoulder 3/10`

## Local smoke test
With the server running, send a Twilio-style form post:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/webhooks/whatsapp -Body @{ From='whatsapp:+972500000000'; Body='start A' }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/webhooks/whatsapp -Body @{ From='whatsapp:+972500000000'; Body='bench 28 10,10,8' }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/webhooks/whatsapp -Body @{ From='whatsapp:+972500000000'; Body='done' }
```

For JSON output during local testing, use:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/webhooks/whatsapp?format=json' -Body @{ From='whatsapp:+972500000000'; Body='summary week' }
```

## Twilio WhatsApp Sandbox
1. Start the server: `npm run dev`
2. Start a tunnel: `ngrok http 3000`
3. In Twilio Console, open Messaging > Try it out > Send a WhatsApp message.
4. Set the sandbox inbound webhook URL to `https://YOUR-NGROK-DOMAIN/webhooks/whatsapp`.
5. Send the sandbox join code from WhatsApp.
6. Test: `start A`, `bench 28 10,10,8`, `done`.

## LLM fallback (optional)
When the regex parser cannot understand a message, FitPing optionally asks
OpenAI's `gpt-4o-mini` to translate the message into a structured intent.
The deterministic handlers still execute the action — the model only does
classification, never side effects or replies.

Enable by setting:
- `OPENAI_API_KEY` (required)
- `OPENAI_MODEL` (optional, defaults to `gpt-4o-mini`)

If the key is unset the LLM path is silently skipped and the user sees the
existing "could not parse" message.

## Weekly auto-summary cronEvery Monday morning, FitPing can send each user a recap of the previous
week (workouts, sets per muscle, top PR).

Trigger via the protected internal endpoint:

```
POST /internal/jobs/weekly-summary
Authorization: Bearer <INTERNAL_JOBS_TOKEN>
```

The endpoint:
- requires `INTERNAL_JOBS_TOKEN` to be set (returns 503 otherwise)
- requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
  to send WhatsApp messages (otherwise summaries are computed but skipped)
- is idempotent on `(userId, weekStart)` — safe to retry

Schedule it from any external cron (Render Cron Job, GitHub Actions, etc.):

```yaml
# .github/workflows/weekly-summary.yml
on:
  schedule:
    - cron: '0 8 * * 1'   # every Monday 08:00 UTC
jobs:
  trigger:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -fsS -X POST \
            -H "Authorization: Bearer ${{ secrets.INTERNAL_JOBS_TOKEN }}" \
            ${{ secrets.FITPING_BASE_URL }}/internal/jobs/weekly-summary
```
