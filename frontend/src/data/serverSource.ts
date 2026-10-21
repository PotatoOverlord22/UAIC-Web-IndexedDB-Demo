import type { Employee, EmployeeProfile } from "../models/employee.ts";
import type { Headcount, OrgSize } from "../models/organization.ts";
import type { Photo } from "../models/photo.ts";
import type { DataSource, Timed } from "./dataSource.ts";
import { savedLatencyRange, savedSimulatedLatency } from "./preferences.ts";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function serverTiming(header: string | null, metric: string): number | undefined {
  const match = header?.match(new RegExp(`\\b${metric};dur=([\\d.]+)`));
  return match ? Number(match[1]) : undefined;
}

async function request<T>(
  path: string,
  accept: string,
  read: (response: Response) => Promise<T>,
  signal?: AbortSignal,
): Promise<Timed<T>> {
  const headers = { Accept: accept, "Simulated-Latency": savedSimulatedLatency() ? savedLatencyRange() : "off" };

  const started = performance.now();
  const response = await fetch(path, { signal, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiError(response.status, body?.error ?? `Request failed with status ${response.status}`);
  }
  const data = await read(response);
  const totalMs = performance.now() - started;

  const timing = response.headers.get("Server-Timing");
  return {
    data,
    source: "server",
    totalMs,
    dbMs: serverTiming(timing, "db"),
    latencyMs: serverTiming(timing, "latency"),
  };
}

const getJson = <T>(path: string, signal?: AbortSignal) =>
  request<T>(path, "application/json", (response) => response.json(), signal);

function decodePhotoBatch(buffer: ArrayBuffer): Photo[] {
  const view = new DataView(buffer);
  const photos: Photo[] = [];
  for (let offset = 0; offset < buffer.byteLength; ) {
    if (offset + 8 > buffer.byteLength) throw new Error("Photo batch is truncated");
    const employeeId = view.getUint32(offset);
    const length = view.getUint32(offset + 4);
    if (offset + 8 + length > buffer.byteLength) throw new Error("Photo batch is truncated");
    const png = new Blob([new Uint8Array(buffer, offset + 8, length)], { type: "image/png" });
    photos.push({ employeeId, png });
    offset += 8 + length;
  }
  return photos;
}

export const getServerHealth = (signal?: AbortSignal) =>
  getJson<{ status: string; employees: number }>("/api/health", signal);

export const getAllEmployees = () => getJson<Employee[]>("/api/employees");

export const getPhotoBatch = (afterId: number, limit: number) =>
  request(`/api/photos?after=${afterId}&limit=${limit}`, "application/octet-stream", async (response) =>
    decodePhotoBatch(await response.arrayBuffer()),
  );

export const serverSource: DataSource = {
  name: "server",

  searchEmployees({ text, division, location, limit }, signal) {
    const params = new URLSearchParams({ q: text, limit: String(limit) });
    if (division) params.set("division", division);
    if (location) params.set("location", location);
    return getJson(`/api/employees/search?${params}`, signal);
  },

  getEmployee: (id, signal) => getJson<EmployeeProfile>(`/api/employees/${id}`, signal),
  getDirectReports: (id, signal) => getJson<Employee[]>(`/api/employees/${id}/reports`, signal),
  getOrgSize: (id, signal) => getJson<OrgSize>(`/api/employees/${id}/org`, signal),
  getHeadcount: (signal) => getJson<Headcount>("/api/stats/headcount", signal),
  getPhoto: (employeeId, signal) =>
    request(`/api/employees/${employeeId}/photo`, "image/png", (response) => response.blob(), signal),
};
