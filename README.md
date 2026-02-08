# daytonaclaw

One-command setup: creates a Daytona sandbox, configures OpenClaw with your Anthropic API key, starts the gateway, and prints the dashboard URL.

## Prerequisites

- **DAYTONA_API_KEY** – [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **ANTHROPIC_API_KEY** – [Anthropic Console](https://console.anthropic.com/)

## Usage

```bash
npm install
npm start
```

Requires no interaction. When it finishes, open the printed URL in your browser, paste the gateway token in the dashboard, and click Connect.

## Local Development

For local development, create a `.dev.vars` file with:

```
DEV_MODE=true               # Skip Cloudflare Access auth + bypass device pairing
```

## Changing settings in code

Edit **`OPENCLAW_SETTINGS`** in `src/index.ts` to change defaults (e.g. `channels.whatsapp.allowFrom`, `agents.defaults.model.primary`, or add Telegram/Discord). The same object is written to `~/.openclaw/openclaw.json` in the sandbox.

## Notes

- Preview URL expires in 1 hour; run `npm start` again to get a new one (reuses the same sandbox if it still exists).
- Sandbox name: `openclaw`. To remove it: `daytona sandbox delete openclaw` (or delete from the Daytona dashboard).
