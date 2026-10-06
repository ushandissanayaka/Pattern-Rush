# Cipher Clash server

## Run locally

```powershell
npm run dev
```

The server listens on port 3000 by default. Check it at `http://localhost:3000/api/health`. Set `PORT` in the environment to use another port.

## Layout

- `data/` stores local server data.
- `src/index.js` starts the HTTP server.
- `src/config/`, `gameplay/`, `objects/`, `players/`, `progress/`, `routes/`, and `shared/` are organized for the game backend modules.

The current backend only provides the health endpoint. Matchmaking, authoritative game logic, player state, and persistence have not been implemented yet.
