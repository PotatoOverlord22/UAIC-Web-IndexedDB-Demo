import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { closeDatabase, DB_PATH } from "./db.ts";
import { HttpError, send } from "./http.ts";
import { router } from "./routes.ts";

const HOST = "127.0.0.1";
const PORT = 3001;
const MAX_LATENCY_MS = 2000;

interface LatencyRange {
  minMs: number;
  maxMs: number;
}

const DEFAULT_LATENCY: LatencyRange = { minMs: 30, maxMs: 40 };

function parseLatency(header: string | string[] | undefined): LatencyRange | undefined {
  if (header === undefined) return DEFAULT_LATENCY;
  const value = typeof header === "string" ? header.trim() : "";
  if (value === "off") return undefined;

  const match = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(value);
  const minMs = Number(match?.[1]);
  const maxMs = Number(match?.[2] ?? match?.[1]);
  if (!match || minMs > maxMs || maxMs > MAX_LATENCY_MS) {
    throw new HttpError(400, `Simulated-Latency must be "off", "<ms>" or "<min>-<max>", up to ${MAX_LATENCY_MS} ms`);
  }
  return { minMs, maxMs };
}

async function simulateLatency({ minMs, maxMs }: LatencyRange): Promise<number> {
  const started = performance.now();
  await delay(minMs + Math.random() * (maxMs - minMs));
  return performance.now() - started;
}

const server = createServer(async (req, res) => {
  const started = performance.now();
  const url = new URL(req.url ?? "/", "http://localhost");
  const timings: Record<string, number> = {};
  let latency: LatencyRange | undefined;
  let status = 200;
  let body: unknown;
  let contentType: string | undefined;

  try {
    latency = parseLatency(req.headers["simulated-latency"]);
    const route = router.match(req.method ?? "GET", url.pathname);
    if (!route) throw new HttpError(404, "Not found");
    const result = route.handler({ params: route.params, query: url.searchParams });
    body = result.body;
    contentType = result.contentType;
    timings.db = result.dbMs;
  } catch (error) {
    status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    body = { error: status === 500 ? "Internal server error" : (error as Error).message };
  }

  if (latency) timings.latency = await simulateLatency(latency);
  if (!res.destroyed) send(res, status, body, timings, contentType);

  const waited = timings.latency === undefined ? "off" : `${timings.latency.toFixed(1)} ms`;
  console.log(
    `${req.method} ${url.pathname}${url.search} ${status} ${(performance.now() - started).toFixed(1)} ms (latency ${waited})`,
  );
});

server.listen(PORT, HOST, () => {
  const { minMs, maxMs } = DEFAULT_LATENCY;
  console.log(`API listening on http://${HOST}:${PORT} (database: ${DB_PATH}, default latency: ${minMs}-${maxMs} ms)`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
