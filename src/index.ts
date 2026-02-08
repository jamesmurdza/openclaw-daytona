import "dotenv/config";
import { Daytona } from "@daytonaio/sdk";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";

const OPENCLAW_PORT = 18789;
const SHOW_LOGS = true;
const MAKE_PUBLIC = true;
const USER_CONFIG_PATH = join(process.cwd(), "config.json");
const ENV_SANDBOX_PATH = join(process.cwd(), ".env.sandbox");

let currentSandbox: Awaited<ReturnType<Daytona["create"]>> | null = null;

// OpenClaw config to run in a Daytona sandbox
const OPENCLAW_CONFIG = {
  gateway: {
    mode: "local" as const,
    port: OPENCLAW_PORT,
    bind: "lan" as const,
    auth: { mode: "token" as const, token: "" },
    controlUi: { allowInsecureAuth: true },
  },
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
    },
  },
};

// Load user config from config.json
function loadUserConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(USER_CONFIG_PATH, "utf8"));
}

// Merge two objects recursively
function deepMerge<T>(target: T, source: Record<string, unknown>): T {
  const out = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const a = (out as Record<string, unknown>)[key];
    const b = source[key];
    if (
      a != null &&
      b != null &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      (out as Record<string, unknown>)[key] = deepMerge(
        a as Record<string, unknown>,
        b as Record<string, unknown>,
      );
    } else {
      (out as Record<string, unknown>)[key] = b;
    }
  }
  return out as T;
}

// Load sandbox env from .env.sandbox
function loadSandboxEnv(): Record<string, string> {
  if (existsSync(ENV_SANDBOX_PATH)) {
    const parsed = dotenv.parse(readFileSync(ENV_SANDBOX_PATH));
    return Object.fromEntries(
      Object.entries(parsed).filter(([, v]) => v != null && v !== "") as [
        string,
        string,
      ][],
    ) as Record<string, string>;
  }
  return {};
}

// Main function
async function main() {
  const sandboxEnv = loadSandboxEnv();

  const daytona = new Daytona();
  const gatewayToken = randomBytes(24).toString("hex");

  console.log(
    "Creating Daytona sandbox (daytona-medium, auto-stop disabled)...",
  );
  const sandbox = await daytona.create({
    snapshot: "daytona-medium", // This snapshot has openclaw installed
    autoStopInterval: 0,
    envVars: sandboxEnv,
    public: MAKE_PUBLIC,
  });
  currentSandbox = sandbox;
  process.on("SIGINT", async () => {
    console.log("\nShutting down sandbox...");
    try {
      await currentSandbox?.delete(30);
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });

  const home = await sandbox.getUserHomeDir().catch(() => "/home/daytona");
  const openclawDir = `${home}/.openclaw`;

  const userConfig = loadUserConfig();
  const baseConfig = deepMerge(
    OPENCLAW_CONFIG as Record<string, unknown>,
    userConfig,
  ) as typeof OPENCLAW_CONFIG & Record<string, unknown>;
  const config = {
    ...baseConfig,
    gateway: {
      ...baseConfig.gateway,
      auth: { mode: "token" as const, token: gatewayToken },
    },
  };
  const configJson = JSON.stringify(config, null, 2);

  console.log("Writing OpenClaw config...");
  await sandbox.process.executeCommand(`mkdir -p ${openclawDir}`);
  await sandbox.fs.uploadFile(
    Buffer.from(configJson, "utf8"),
    `${openclawDir}/openclaw.json`,
  );

  const sessionId = "openclaw-gateway";
  console.log("Starting OpenClaw gateway (streaming output)...");
  await sandbox.process.createSession(sessionId);
  const { cmdId } = await sandbox.process.executeSessionCommand(sessionId, {
    command: "openclaw gateway run",
    runAsync: true,
  });

  // Stream gateway stdout/stderr to the terminal
  sandbox.process
    .getSessionCommandLogs(
      sessionId,
      cmdId!,
      SHOW_LOGS ? (chunk) => process.stdout.write(chunk) : () => {},
      SHOW_LOGS ? (chunk) => process.stderr.write(chunk) : () => {},
    )
    .catch(() => {}); // ignore when process exits or connection closes

  const signed = await sandbox.getPreviewLink(OPENCLAW_PORT);

  const dashboardUrl =
    signed.url +
    (signed.url.includes("?") ? "&" : "?") +
    `token=${gatewayToken}`;
  console.log("Dashboard URL: " + dashboardUrl);
  console.log("Ctrl+C to shut down and delete the sandbox.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
