import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { Server, ServerWebSocket } from "bun";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { appRouter } from "./routers/index.js";
import type { Context } from "./trpc.js";
import { initConfig } from "./config/index.js";
import { getJobQueueService } from "./services/jobQueue.js";
import { verifySession, registerAuthTasks } from "./services/auth.js";
import { registerPipelineHandlers } from "./services/pipeline.js";
import { registerTvPipelineHandlers } from "./services/tvPipeline.js";
import { getIrcAnnounceMonitor } from "./services/ircAnnounce.js";
import { getRssAnnounceMonitor } from "./services/rssAnnounce.js";
import { getEncoderDispatchService, type EncoderWebSocketData } from "./services/encoderDispatch.js";
import { getSchedulerService } from "./services/scheduler.js";
import { getCryptoService } from "./services/crypto.js";
import { migrateEnvSecretsIfNeeded } from "./services/secrets.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize configuration early to catch errors
const config = initConfig();

// Initialize crypto service and migrate env secrets to encrypted storage
// This must happen before any service that might use secrets
(async () => {
  try {
    const crypto = getCryptoService();
    await crypto.initialize();
    console.log("[Startup] Crypto service initialized");

    // Migrate any secrets from env/config to encrypted storage
    const { migrated, skipped } = await migrateEnvSecretsIfNeeded();
    if (migrated.length > 0 || skipped.length > 0) {
      console.log(`[Startup] Secrets migration complete: ${migrated.length} migrated, ${skipped.length} skipped`);
    }
  } catch (error) {
    console.error("[Startup] Failed to initialize crypto/secrets:", error);
    // Don't exit - the app can still work with env vars
  }
})();

// Initialize job queue (will be started after server is ready)
const jobQueue = getJobQueueService();

// Initialize scheduler (will be started after server is ready)
const scheduler = getSchedulerService();

// Register pipeline handlers for request processing
registerPipelineHandlers();
registerTvPipelineHandlers();

// Cookie name for auth token
const AUTH_COOKIE_NAME = "annex_session";

// =============================================================================
// WebSocket Data Types
// =============================================================================

type WebSocketData = EncoderWebSocketData;

// =============================================================================
// Helper Functions
// =============================================================================

function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join("=").trim();
    }
  });

  return cookies;
}

function getSessionTokenFromRequest(req: Request): string | null {
  // First, check Authorization header (Bearer token)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Then check cookies
  const cookies = parseCookies(req.headers.get("cookie"));
  return cookies[AUTH_COOKIE_NAME] || null;
}

async function createContext(req: Request): Promise<Context> {
  const sessionToken = getSessionTokenFromRequest(req);

  // Try to verify the session and get user
  let user = null;
  if (sessionToken) {
    try {
      user = await verifySession(sessionToken);
    } catch {
      // Invalid session, continue without user
    }
  }

  return {
    config,
    sessionToken,
    user,
  };
}

function findFile(filename: string): string | null {
  const possiblePaths = [
    path.resolve(__dirname, `../../../${filename}`),
    path.resolve(__dirname, `../../../../${filename}`),
    path.resolve(process.cwd(), filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

// =============================================================================
// HTTP Route Handlers
// =============================================================================

function handleDeployEncoder(req: Request): Response {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const scriptPath = findFile("scripts/setup-remote-encoder.sh");

  if (!scriptPath) {
    console.error("[Deploy] Setup script not found");
    return new Response("Encoder setup script not found", { status: 404 });
  }

  try {
    const script = fs.readFileSync(scriptPath, "utf-8");

    // Log the deployment request
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";
    console.log(`[Deploy] Serving encoder setup script to ${clientIp}`);

    return new Response(script, {
      status: 200,
      headers: {
        "Content-Type": "text/x-shellscript",
        "Content-Disposition": 'inline; filename="setup-remote-encoder.sh"',
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[Deploy] Failed to read setup script:", error);
    return new Response("Failed to read setup script", { status: 500 });
  }
}

function handleEncoderPackage(req: Request, url: URL): Response {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const clientIp = req.headers.get("x-forwarded-for") || "unknown";
  const pathname = url.pathname;

  // Route: /api/encoder/package/info - return package version info
  if (pathname === "/api/encoder/package/info") {
    const tarballPath = findFile("packages/encoder/annex-encoder-latest.tar.gz");
    const packagePath = findFile("packages/encoder/package.json");

    if (!tarballPath || !packagePath) {
      return new Response(
        JSON.stringify({ error: "Encoder package not built. Run: bun run --filter @annex/encoder build:dist" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
      const stats = fs.statSync(tarballPath);

      return new Response(
        JSON.stringify({
          version: pkg.version,
          size: stats.size,
          buildTime: stats.mtime.toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("[Encoder] Failed to read package info:", error);
      return new Response(
        JSON.stringify({ error: "Failed to read package info" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Route: /api/encoder/package/update-script - serve just the update.sh
  if (pathname === "/api/encoder/package/update-script") {
    const distDir = findFile("packages/encoder/dist-package");
    const scriptPath = distDir ? `${distDir}/update.sh` : null;

    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return new Response(
        "Update script not found. Run: bun run --filter @annex/encoder build:dist",
        { status: 404 }
      );
    }

    try {
      const script = fs.readFileSync(scriptPath, "utf-8");
      console.log(`[Encoder] Serving update script to ${clientIp}`);

      return new Response(script, {
        status: 200,
        headers: {
          "Content-Type": "text/x-shellscript",
          "Content-Disposition": 'inline; filename="update.sh"',
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("[Encoder] Failed to serve update script:", error);
      return new Response("Failed to serve update script", { status: 500 });
    }
  }

  // Route: /api/encoder/package/download - serve the tarball
  if (pathname === "/api/encoder/package/download") {
    const tarballPath = findFile("packages/encoder/annex-encoder-latest.tar.gz");

    if (!tarballPath) {
      return new Response(
        "Encoder package not built. Run: bun run --filter @annex/encoder build:dist",
        { status: 404 }
      );
    }

    try {
      const file = Bun.file(tarballPath);
      console.log(`[Encoder] Serving package to ${clientIp} (${(file.size / 1024).toFixed(1)} KB)`);

      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": "application/gzip",
          "Content-Length": file.size.toString(),
          "Content-Disposition": 'attachment; filename="annex-encoder.tar.gz"',
          "Cache-Control": "no-cache",
        },
      });
    } catch (error) {
      console.error("[Encoder] Failed to serve package:", error);
      return new Response("Failed to serve encoder package", { status: 500 });
    }
  }

  // Unknown sub-route
  return new Response("Not found", { status: 404 });
}

// CORS headers for responses
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// =============================================================================
// Encoder Dispatch Integration
// =============================================================================

const encoderDispatch = getEncoderDispatchService();

// =============================================================================
// Bun Server
// =============================================================================

const { port, host } = config.server;

const server = Bun.serve<WebSocketData>({
  port,
  hostname: host,

  async fetch(req: Request, server: Server<WebSocketData>): Promise<Response | undefined> {
    const url = new URL(req.url);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // WebSocket upgrade handling (only for encoder connections)
    if (req.headers.get("upgrade") === "websocket") {
      if (url.pathname === "/encoder") {
        const success = server.upgrade(req, {
          data: {
            type: "encoder",
            encoderId: null,
          } as EncoderWebSocketData,
        });
        return success ? undefined : new Response("WebSocket upgrade failed", { status: 500 });
      }
      // Reject other WebSocket connections
      return new Response("WebSocket only available at /encoder", { status: 404 });
    }

    // Custom routes
    if (url.pathname === "/deploy-encoder") {
      const response = handleDeployEncoder(req);
      // Add CORS headers
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    if (url.pathname.startsWith("/api/encoder/package")) {
      const response = handleEncoderPackage(req, url);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
      return response;
    }

    // tRPC HTTP handler
    if (url.pathname.startsWith("/trpc")) {
      const response = await fetchRequestHandler({
        endpoint: "/trpc",
        req,
        router: appRouter,
        createContext: () => createContext(req),
        responseMeta() {
          return { headers: corsHeaders };
        },
      });
      return response;
    }

    // Not found
    return new Response("Not Found", { status: 404 });
  },

  websocket: {
    open(_ws: ServerWebSocket<WebSocketData>) {
      encoderDispatch.handleConnection();
    },

    message(ws: ServerWebSocket<WebSocketData>, message: string | Buffer) {
      encoderDispatch.handleMessage(ws as ServerWebSocket<EncoderWebSocketData>, message);
    },

    close(ws: ServerWebSocket<WebSocketData>) {
      encoderDispatch.handleClose(ws as ServerWebSocket<EncoderWebSocketData>);
    },
  },
});

// Initialize encoder dispatch
encoderDispatch.initialize();

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     █████╗ ███╗   ██╗███╗   ██╗███████╗██╗  ██╗               ║
║    ██╔══██╗████╗  ██║████╗  ██║██╔════╝╚██╗██╔╝               ║
║    ███████║██╔██╗ ██║██╔██╗ ██║█████╗   ╚███╔╝                ║
║    ██╔══██║██║╚██╗██║██║╚██╗██║██╔══╝   ██╔██╗                ║
║    ██║  ██║██║ ╚████║██║ ╚████║███████╗██╔╝ ██╗               ║
║    ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝               ║
║                                                               ║
║    Media Acquisition & Delivery Platform                      ║
║    Powered by Bun                                             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝

Server running at http://${host}:${port}
Remote encoder WebSocket at ws://${host}:${port}/encoder

Encoder Deployment:
  Setup script: curl -fsSL http://${host}:${port}/deploy-encoder | sudo bash
  Package info: http://${host}:${port}/api/encoder/package/info
  Package download: http://${host}:${port}/api/encoder/package/download

Log level: ${config.logging.level}
`);

// Start the scheduler (main process loop)
scheduler.start();

// Register misc cleanup tasks with scheduler
registerAuthTasks();

// Start the job queue worker (recovers any stuck jobs from previous run)
jobQueue.start().catch((error) => {
  console.error("[JobQueue] Failed to start:", error);
});

// Start the IRC announce monitor (if enabled)
const ircMonitor = getIrcAnnounceMonitor();
ircMonitor.start().catch((error) => {
  console.error("[IRC] Failed to start:", error);
});

// Start the RSS announce monitor (if enabled)
const rssMonitor = getRssAnnounceMonitor();
rssMonitor.start().catch((error) => {
  console.error("[RSS] Failed to start:", error);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  encoderDispatch.shutdown();
  await scheduler.stop();
  await jobQueue.stop();
  ircMonitor.stop();
  rssMonitor.stop();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\nShutting down...");
  encoderDispatch.shutdown();
  await scheduler.stop();
  await jobQueue.stop();
  ircMonitor.stop();
  rssMonitor.stop();
  server.stop();
  process.exit(0);
});
