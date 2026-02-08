import 'dotenv/config'
import { Daytona } from '@daytonaio/sdk'
import { randomBytes } from 'crypto'

const OPENCLAW_PORT = 18789
const SHOW_LOGS = true
const MAKE_PUBLIC = true

let currentSandbox: Awaited<ReturnType<Daytona['create']>> | null = null

/** OpenClaw config: edit these to change defaults (channels, model, etc.) */
export const OPENCLAW_SETTINGS = {
  gateway: {
    mode: 'local',
    port: OPENCLAW_PORT,
    bind: 'lan', // required so Daytona preview proxy can reach the gateway (loopback rejects external connections)
    auth: { mode: 'token' as const, token: '' }, // filled at runtime
    controlUi: { allowInsecureAuth: true }
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
    snapshot: 'daytona-medium', // This snapshot has openclaw installed
    autoStopInterval: 0,
    envVars: { ANTHROPIC_API_KEY: apiKey },
    public: MAKE_PUBLIC,
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

  // Stream gateway stdout/stderr to the terminal
  sandbox.process
    .getSessionCommandLogs(
      sessionId,
      cmdId!,
      SHOW_LOGS ? (chunk) => process.stdout.write(chunk) : () => {},
      SHOW_LOGS ? (chunk) => process.stderr.write(chunk) : () => {},
    )
    .catch(() => {}) // ignore when process exits or connection closes

  const signed = await sandbox.getPreviewLink(OPENCLAW_PORT)

  const dashboardUrl = signed.url + (signed.url.includes('?') ? '&' : '?') + `token=${gatewayToken}`
  console.log('\n--- OpenClaw dashboard ---')
  console.log(dashboardUrl)
  console.log('Ctrl+C to shut down and delete the sandbox.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
