# Cody

Cody is a lightweight browser-based AI sidekick avatar with a chat bubble UI and a server-side LLM proxy.

## Purpose

Use Cody as an embeddable assistant inside another product.
Current implementation is intentionally open-ended so it can be reused across different project types.

## Files

- `index.html`: mounts the avatar and chat bubble UI
- `styles.css`: avatar positioning, bubble layout, animation CSS
- `script.js`: chat controller, keyboard emotes, Cody state API
- `proxy.php`: server-side proxy for OpenRouter requests
- `site_pet_grid.png`: sprite sheet
- `.env`: local secret storage for `OPENROUTER_API_KEY` only

## Runtime Flow

1. User sends a message in the bubble.
2. `script.js` posts conversation history to `proxy.php`.
3. `proxy.php` calls OpenRouter.
4. Response is returned to the browser.
5. Cody emote state changes during thinking/responding/error.

## Local Usage

Requirements:

- PHP available locally
- `.env` file with `OPENROUTER_API_KEY=...`

Run locally:

```bash
php -S localhost:8080
```

Open:

```text
http://localhost:8080
```

If using Herd, open the mapped local domain instead.

## Production Usage

Preferred:

- provide `OPENROUTER_API_KEY` as a server environment variable

Fallback:

- place a `.env` file next to `proxy.php` if your deployment allows it

## Frontend Integration API

Global API:

```js
window.Cody.trigger(stateName)
window.Cody.release()
window.Cody.isTriggered()
window.Cody.mapEmote(stateName, actionKey)
```

Current semantic states supported:

- `thinking`
- `typing`
- `responding`
- `idle`
- `sleeping`
- `error`
- `snarling`
- `spinning`
- `licking`
- `wagging`
- `pouting`
- `croc`

## Integration Notes

- Keep secrets out of browser code.
- Keep app-specific business rules outside Cody unless they are truly reusable.
- Treat Cody as a UI agent layer that reacts to app state and can send/receive text.
- If integrating with kanban or influencer workflows later, trigger Cody from app events rather than hard-coding domain logic into the avatar.

## Quick Debug Checks

Proxy test:

```bash
curl -sS http://localhost:8080/proxy.php \
  -H "Content-Type: application/json" \
  -d '{"history":[{"role":"user","content":"Say hi in one short sentence."}]}'
```

If the proxy fails, check:

- API key present
- host can reach OpenRouter
- deployed server can read environment variables or `.env`
