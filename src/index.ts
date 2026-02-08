import 'dotenv/config'
import { Daytona } from '@daytonaio/sdk'
import { randomBytes } from 'crypto'

const OPENCLAW_PORT = 18789
const GATEWAY_START_WAIT_MS = 8000

let currentSandbox: Awaited<ReturnType<Daytona['create']>> | null = null

/** OpenClaw config: edit these to change defaults (channels, model, etc.) */
export const OPENCLAW_SETTINGS = {
  gateway: {
    mode: 'local',
    port: OPENCLAW_PORT,
    bind: 'lan', // required so Daytona preview proxy can reach the gateway (loopback rejects external connections)
    auth: { mode: 'token' as const, token: '' }, // filled at runtime
    controlUi: { allowInsecureAuth: true },
  },
  agents: {
    defaults: {
      workspace: '~/.openclaw/workspace',
      model: { primary: 'anthropic/claude-sonnet-4-5' },
    },
  },
  auth: {
    profiles: {
      'anthropic:api': { provider: 'anthropic', mode: 'api_key' as const },
    },
    order: { anthropic: ['anthropic:api'] },
  },
  channels: {
    whatsapp: { allowFrom: [] as string[] },
  },
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('Set ANTHROPIC_API_KEY in the environment or .env')
    process.exit(1)
  }

  const daytona = new Daytona()
  const gatewayToken = randomBytes(24).toString('hex')

  console.log('Creating Daytona sandbox (daytona-medium, auto-stop disabled)...')
  const sandbox = await daytona.create({
    snapshot: 'daytona-medium',
    autoStopInterval: 0,
    envVars: { ANTHROPIC_API_KEY: apiKey },
  })
  currentSandbox = sandbox
  process.on('SIGINT', async () => {
    console.log('\nShutting down sandbox...')
    try {
      await currentSandbox?.delete(30)
    } catch (e) {
      console.error(e)
    }
    process.exit(0)
  })

  const home = await sandbox.getUserHomeDir().catch(() => '/home/daytona')
  const openclawDir = `${home}/.openclaw`

  const config = {
    ...OPENCLAW_SETTINGS,
    gateway: {
      ...OPENCLAW_SETTINGS.gateway,
      auth: { mode: 'token' as const, token: gatewayToken },
    },
  }
  const configJson = JSON.stringify(config, null, 2)

  console.log('Writing OpenClaw config...')
  await sandbox.process.executeCommand(`mkdir -p ${openclawDir}`)
  await sandbox.fs.uploadFile(Buffer.from(configJson, 'utf8'), `${openclawDir}/openclaw.json`)

  // API key is provided via sandbox env; OpenClaw reads it for anthropic api_key profile
  const sessionId = 'openclaw-gateway'
  console.log('Starting OpenClaw gateway (streaming output)...')
  await sandbox.process.createSession(sessionId)
  const { cmdId } = await sandbox.process.executeSessionCommand(sessionId, {
    command: 'openclaw gateway run',
    runAsync: true,
  })

  await new Promise((r) => setTimeout(r, GATEWAY_START_WAIT_MS))

  // Stream gateway stdout/stderr to the terminal
  sandbox.process
    .getSessionCommandLogs(
      sessionId,
      cmdId!,
      (chunk) => process.stdout.write(chunk),
      (chunk) => process.stderr.write(chunk),
    )
    .catch(() => {}) // ignore when process exits or connection closes

  const maxAttempts = 3
  const retryDelayMs = 5000
  let signed: Awaited<ReturnType<typeof sandbox.getPreviewLink>> | null = null
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      signed = await sandbox.getPreviewLink(OPENCLAW_PORT)
      break
    } catch (err) {
      if (attempt === maxAttempts) throw err
      console.log(`Preview URL request timed out, retrying in ${retryDelayMs / 1000}s (${attempt}/${maxAttempts})...`)
      await new Promise((r) => setTimeout(r, retryDelayMs))
    }
  }
  if (!signed) throw new Error('Failed to get preview URL')

  const dashboardUrl = signed.url + (signed.url.includes('?') ? '&' : '?') + `token=${gatewayToken}`
  console.log('\n--- OpenClaw dashboard ---')
  console.log(dashboardUrl)
  console.log('Ctrl+C to shut down and delete the sandbox.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
