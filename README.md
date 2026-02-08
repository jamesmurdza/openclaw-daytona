# OpenClaw in a Daytona Sandbox

Run **OpenClaw** (AI agents, Claude, channels like WhatsApp) in a **cloud Daytona sandbox** with zero local install. Give you a public URL to the OpenClaw dashboard, fully wired with your config and secrets. Ctrl+C deletes the sandbox.

## Prerequisites

### Env setup (step by step)

1. **`.env`** (runs locally; used by the Daytona SDK)
   - Copy `.env.example` to `.env`
   - Add your key from [Daytona Dashboard](https://app.daytona.io/dashboard/keys):

   ```
   DAYTONA_API_KEY=your_key_here
   ```

2. **`.env.sandbox`** (injected into the sandbox; used by OpenClaw)
   - Copy `.env.sandbox.example` to `.env.sandbox`
   - Add your key from [Anthropic Console](https://console.anthropic.com/):

   ```
   ANTHROPIC_API_KEY=your_key_here
   ```
   - Any other vars you add here are loaded into the sandbox environment

## Usage

```bash
npm install
npm start
```

Requires no interaction. When it finishes, open the printed URL in your browser (the gateway token is included in the URL). Ctrl+C shuts down and deletes the sandbox.

## Configuration

- **`config.json`** – OpenClaw config merged with defaults
- **`src/index.ts`** – Edit `SHOW_LOGS`, `MAKE_PUBLIC`, `OPENCLAW_PORT` for runtime behavior

## Notes

- Sandbox is deleted on Ctrl+C or when the process exits.
