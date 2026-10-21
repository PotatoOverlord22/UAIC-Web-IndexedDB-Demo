import {
  allEmployees,
  countEmployees,
  directReports,
  getEmployee,
  getPhoto,
  headcount,
  managerChain,
  orgSize,
  photoBatch,
  searchEmployees,
} from "./db.ts";
import { HttpError, Router } from "./http.ts";
import type { Photo } from "./models/photo.ts";

const MAX_QUERY_LENGTH = 64;
const MAX_TOKENS = 4;

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, "Invalid employee id");
  return id;
}

function parseInteger(value: string | null, name: string, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, `${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseNameTokens(value: string | null): string[] {
  const query = (value ?? "").trim().toLowerCase();
  if (query.length > MAX_QUERY_LENGTH) throw new HttpError(400, `q must be at most ${MAX_QUERY_LENGTH} characters`);
  return query.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
}

function requireEmployee(id: number) {
  const found = getEmployee(id);
  if (!found.value) throw new HttpError(404, "Employee not found");
  return found;
}

function encodePhotoBatch(photos: Photo[]): Uint8Array {
  const bytes = new Uint8Array(photos.reduce((size, photo) => size + 8 + photo.png.byteLength, 0));
  const view = new DataView(bytes.buffer);
  let offset = 0;
  for (const { employeeId, png } of photos) {
    view.setUint32(offset, employeeId);
    view.setUint32(offset + 4, png.byteLength);
    bytes.set(png, offset + 8);
    offset += 8 + png.byteLength;
  }
  return bytes;
}

export const router = new Router()
  .get("/api/health", () => {
    const { value, dbMs } = countEmployees();
    return { body: { status: "ok", employees: value }, dbMs };
  })
  .get("/api/employees", () => {
    const { value, dbMs } = allEmployees();
    return { body: value, dbMs };
  })
  .get("/api/employees/search", ({ query }) => {
    const { value, dbMs } = searchEmployees({
      tokens: parseNameTokens(query.get("q")),
      division: query.get("division") || undefined,
      location: query.get("location") || undefined,
      limit: parseInteger(query.get("limit"), "limit", 50, 1, 500),
    });
    return { body: value, dbMs };
  })
  .get("/api/employees/:id", ({ params }) => {
    const id = parseId(params.id);
    const employee = requireEmployee(id);
    const chain = managerChain(id);
    return { body: { ...employee.value, managerChain: chain.value }, dbMs: employee.dbMs + chain.dbMs };
  })
  .get("/api/employees/:id/reports", ({ params }) => {
    const id = parseId(params.id);
    const employee = requireEmployee(id);
    const reports = directReports(id);
    return { body: reports.value, dbMs: employee.dbMs + reports.dbMs };
  })
  .get("/api/employees/:id/org", ({ params }) => {
    const id = parseId(params.id);
    const employee = requireEmployee(id);
    const org = orgSize(id);
    return { body: org.value, dbMs: employee.dbMs + org.dbMs };
  })
  .get("/api/employees/:id/photo", ({ params }) => {
    const { value, dbMs } = getPhoto(parseId(params.id));
    if (!value) throw new HttpError(404, "Photo not found");
    return { body: value, dbMs, contentType: "image/png" };
  })
  .get("/api/photos", ({ query }) => {
    const { value, dbMs } = photoBatch(
      parseInteger(query.get("after"), "after", 0, 0, Number.MAX_SAFE_INTEGER),
      parseInteger(query.get("limit"), "limit", 2000, 1, 5000),
    );
    return { body: encodePhotoBatch(value), dbMs, contentType: "application/octet-stream" };
  })
  .get("/api/stats/headcount", () => {
    const { value, dbMs } = headcount();
    return { body: value, dbMs };
  });
