import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink, splitLink, createWSClient, wsLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@annex/server/routers";
import { getAuthToken } from "./hooks/useAuth";

export const trpc = createTRPCReact<AppRouter>();

function getWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = getAuthToken();
  const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
  // In dev (port 5173), backend is on port 3000; in prod, same host
  const isDev = window.location.port === "5173";
  const host = isDev ? `${window.location.hostname}:3000` : window.location.host;
  return `${protocol}//${host}${tokenParam}`;
}

let wsClient: ReturnType<typeof createWSClient> | null = null;
let wsConnected = false;

function getWsClient() {
  if (!wsClient) {
    wsClient = createWSClient({
      url: getWsUrl,
      onOpen: () => {
        wsConnected = true;
      },
      onClose: () => {
        wsConnected = false;
      },
    });
  }
  return wsClient;
}

export function getTrpcClient() {
  return trpc.createClient({
    transformer: superjson,
    links: [
      splitLink({
        condition: (op) => {
          // Always use WebSocket for subscriptions
          if (op.type === "subscription") return true;
          // Use WebSocket for queries/mutations when connected
          return wsConnected;
        },
        true: wsLink({ client: getWsClient() }),
        false: httpBatchLink({
          url: "/trpc",
          headers() {
            const token = getAuthToken();
            return token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : {};
          },
        }),
      }),
    ],
  });
}
