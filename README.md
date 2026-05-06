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

### 1) Deploy Backend (Render)

1. Go to Render and click **New +** -> **Blueprint**.
2. Connect your GitHub repo: `gabriel18278172/Multiplayer-chess`.
3. Render will detect `render.yaml` and create service `multiplayer-chess-server`.
4. In Render service settings, add environment variable:
   - `CLIENT_URL=https://<your-vercel-domain>.vercel.app`
5. Deploy and wait until status is **Live**.
6. Copy your backend URL, for example:
   - `https://multiplayer-chess-server.onrender.com`
7. Test health endpoint in browser:
   - `https://multiplayer-chess-server.onrender.com/health`

### 2) Deploy Frontend (Vercel)

1. Go to Vercel and click **Add New Project**.
2. Import repo: `gabriel18278172/Multiplayer-chess`.
3. Configure build settings:
   - Framework Preset: `Vite`
   - Install Command: `npm install`
   - Build Command: `npm run build --workspace client`
   - Output Directory: `client/dist`
4. Add environment variable in Vercel project settings:
   - `VITE_SERVER_URL=https://multiplayer-chess-server.onrender.com`
5. Deploy.

### 3) Final Wiring

1. Copy your real Vercel URL.
2. Update Render env var `CLIENT_URL` to exactly that Vercel URL.
3. Redeploy Render service.
4. Open your Vercel app in two browser windows and join same room code to verify real-time multiplayer works.

### Notes

- WebSockets are required for multiplayer, so backend should not be hosted on Vercel serverless functions.
- `CLIENT_URL` supports one URL or multiple comma-separated URLs (useful for production + preview domains).
