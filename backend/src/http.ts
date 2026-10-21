import type { ServerResponse } from "node:http";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface RouteResult {
  body: unknown;
  dbMs: number;
  contentType?: string;
}

export interface RouteContext {
  params: Record<string, string>;
  query: URLSearchParams;
}

export type Handler = (context: RouteContext) => RouteResult;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  #routes: Route[] = [];

  get(path: string, handler: Handler): this {
    const keys: string[] = [];
    const source = path.replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key);
      return "(\\d+)";
    });
    this.#routes.push({ method: "GET", pattern: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | undefined {
    for (const route of this.#routes) {
      if (route.method !== method) continue;
      const found = route.pattern.exec(pathname);
      if (!found) continue;
      const params = Object.fromEntries(route.keys.map((key, i) => [key, found[i + 1]]));
      return { handler: route.handler, params };
    }
    return undefined;
  }
}

export function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  timings: Record<string, number>,
  contentType = "application/json; charset=utf-8",
): void {
  const serializeStarted = performance.now();
  const payload = body instanceof Uint8Array ? body : Buffer.from(JSON.stringify(body));
  const allTimings = { ...timings, serialize: performance.now() - serializeStarted };

  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": payload.byteLength,
    "Cache-Control": "no-store",
    "Server-Timing": Object.entries(allTimings)
      .map(([name, ms]) => `${name};dur=${ms.toFixed(2)}`)
      .join(", "),
  });
  res.end(payload);
}
