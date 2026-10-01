# Lakeside Arcade

## Run locally

Use Node.js 20 or newer.

```sh
npm install
WEBSITE_PASSWORD='your-password' npm start
```

Open `http://localhost:3000`.

## Site password

Set `WEBSITE_PASSWORD` in the server environment before starting the app. The server will not start without it. Sessions expire after 12 hours; serve the site over HTTPS.

## Homework Cheater

Photo answers use a vision-capable model through the server. Set `OPENAI_API_KEY` in the server environment before starting the app. The default model is `gpt-4o-mini`; override it with `OPENAI_MODEL` if needed. An OpenAI-compatible endpoint can be selected with `OPENAI_BASE_URL`.

The key stays on the server and must never be added to `index.html`. The image endpoint accepts JPG, PNG, and WebP, limits image size and request frequency, and returns an explicit setup message if the key is missing.

## Online rooms

Deploy the Node server on a host that supports WebSocket upgrades. The page and `/ws` endpoint must be reachable from the same public hostname; use `wss` through HTTPS. Create a game room and share its code or invite link. Chess and Voxel Grove sync moves/world changes; the other games share live standings for score challenges.

Room data is held in memory and is cleared when all players leave or the server restarts.