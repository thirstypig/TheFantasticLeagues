// One HTTP 'upgrade' router for every WebSocketServer on a server.
//
// Two `new WebSocketServer({ server, path })` instances on the same HTTP server
// conflict: each listens for 'upgrade', and the one whose path doesn't match
// aborts the handshake with a 400 on the shared socket — even after the other
// has already answered 101. So every service creates its WebSocketServer with
// `noServer: true` and registers its path here; a single listener per HTTP
// server dispatches by pathname and destroys sockets for unknown paths.
import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocketServer } from "ws";

const routesByServer = new WeakMap<HttpServer, Map<string, WebSocketServer>>();

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return "";
  }
}

/**
 * Create a `noServer` WebSocketServer for `path` and route `httpServer`'s
 * upgrade requests for that exact pathname to it. Connection handling
 * (auth, rooms) stays with the caller's 'connection' listener.
 */
export function createRoutedWebSocketServer(httpServer: HttpServer, path: string): WebSocketServer {
  let routes = routesByServer.get(httpServer);
  if (!routes) {
    const table = new Map<string, WebSocketServer>();
    routes = table;
    routesByServer.set(httpServer, table);
    httpServer.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const wss = table.get(pathnameOf(req));
      if (!wss) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    });
  }
  if (routes.has(path)) throw new Error(`WebSocket path already registered: ${path}`);
  const wss = new WebSocketServer({ noServer: true });
  routes.set(path, wss);
  wss.on("close", () => {
    if (routes!.get(path) === wss) routes!.delete(path);
  });
  return wss;
}
