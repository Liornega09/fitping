# FitPing Workout Bot (MVP)

Simple WhatsApp-first workout logger backend.

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
