# Multiplayer Chess

Polished multiplayer chess app with a Chess.com-inspired visual style.

## Stack
- Frontend: React + Vite
- Multiplayer backend: Node.js + Express + Socket.IO
- Chess validation: chess.js
- Deployment: Frontend on Vercel, backend on a WebSocket-friendly host (Render/Railway/Fly.io)

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run both apps:
   ```bash
   npm run dev
   ```
3. Open the frontend URL shown by Vite (usually http://localhost:5173).

## Environment Variables

Frontend (`client/.env`):

```bash
VITE_SERVER_URL=http://localhost:3001
```

Backend (`server/.env`):

```bash
PORT=3001
CLIENT_URL=http://localhost:5173
```

## Deploy

- Deploy `client` to Vercel.
- Deploy `server` to Render/Railway/Fly.io (WebSockets required).
- Set `VITE_SERVER_URL` in Vercel to the backend URL.
