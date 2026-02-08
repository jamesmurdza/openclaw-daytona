import "dotenv/config";
import { Daytona, Sandbox } from "@daytonaio/sdk";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
import { deepMerge } from "./utils.js";

const OPENCLAW_PORT = 18789;
const SHOW_LOGS = true;
const MAKE_PUBLIC = true;
const USER_CONFIG_PATH = join(process.cwd(), "config.json");
const ENV_SANDBOX_PATH = join(process.cwd(), ".env.sandbox");
const DAYTONA_SNAPSHOT = "daytona-medium"; // This snapshot has openclaw installed

let currentSandbox: Sandbox | null = null;
let sandboxDeleted = false;

// Read env file and return a record of key-value pairs
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const parsed = dotenv.parse(readFileSync(path));
  return Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v != null && v !== "") as [
      string,
      string,
    ][],
  ) as Record<string, string>;
}

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

// Main function
async function main() {
  // Create a new Daytona instance
  const daytona = new Daytona();

  // Create a new sandbox
  console.log(
    "Creating Daytona sandbox (daytona-medium, auto-stop disabled)...",
  );
  const sandbox = await daytona.create({
    snapshot: DAYTONA_SNAPSHOT,
    autoStopInterval: 0,
    envVars: readEnvFile(ENV_SANDBOX_PATH),
    public: MAKE_PUBLIC,
  });
  currentSandbox = sandbox;

  // Handle SIGINT
  process.on("SIGINT", async () => {
    if (sandboxDeleted) return;
    sandboxDeleted = true;
    console.log("\nShutting down sandbox...");
    try {
      await currentSandbox?.delete(30);
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });

  // Get the user home directory
  const home = await sandbox.getUserHomeDir();
  const openclawDir = `${home}/.openclaw`;

  // Read the user config and merge it with the base config
  const userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, "utf8"));
  const baseConfig = deepMerge(OPENCLAW_CONFIG, userConfig);

  // Generate a random gateway token and add it to the config
  const gatewayToken = randomBytes(24).toString("hex");
  const config = deepMerge(baseConfig, {
    gateway: {
      auth: { mode: "token" as const, token: gatewayToken },
    },
  });

  // Write the config to the sandbox
  console.log("Writing OpenClaw config...");
  await sandbox.process.executeCommand(`mkdir -p ${openclawDir}`);
  await sandbox.fs.uploadFile(
    Buffer.from(JSON.stringify(config, null, 2), "utf8"),
    `${openclawDir}/openclaw.json`,
  );

  // Start the gateway
  const sessionId = "openclaw-gateway";
  console.log("Starting OpenClaw gateway (streaming output)...");
  await sandbox.process.createSession(sessionId);
  const { cmdId } = await sandbox.process.executeSessionCommand(sessionId, {
    command: "openclaw gateway run",
    runAsync: true,
  });

  // Delete sandbox when the process ends
  const deleteAndExit = async () => {
    if (sandboxDeleted) return;
    sandboxDeleted = true;
    console.log("Deleting sandbox...");
    try {
      await currentSandbox?.delete();
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  };

  // Stream gateway stdout/stderr to the terminal
  sandbox.process
    .getSessionCommandLogs(
      sessionId,
      cmdId!,
      SHOW_LOGS ? (chunk) => process.stdout.write(chunk) : () => {},
      SHOW_LOGS ? (chunk) => process.stderr.write(chunk) : () => {},
    )
    .then(deleteAndExit)
    .catch(deleteAndExit);

  const signed = await sandbox.getPreviewLink(OPENCLAW_PORT);
  const dashboardUrl = `${signed.url}?token=${gatewayToken}`;
  
  console.log(`Dashboard URL: ${dashboardUrl}`);
  console.log("Ctrl+C to shut down and delete the sandbox.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
