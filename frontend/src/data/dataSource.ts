import type { Employee, EmployeeProfile } from "../models/employee.ts";
import type { Headcount, OrgSize } from "../models/organization.ts";
import type { SearchQuery, SearchResult } from "../models/search.ts";

export type SourceName = "server" | "indexeddb";

export const SOURCE_LABELS: Record<SourceName, string> = {
  server: "Server",
  indexeddb: "IndexedDB",
};

export interface Timed<T> {
  data: T;
  source: SourceName;
  totalMs: number;
  dbMs?: number;
  latencyMs?: number;
}

export interface DataSource {
  name: SourceName;
  searchEmployees(query: SearchQuery, signal?: AbortSignal): Promise<Timed<SearchResult>>;
  getEmployee(id: number, signal?: AbortSignal): Promise<Timed<EmployeeProfile>>;
  getDirectReports(id: number, signal?: AbortSignal): Promise<Timed<Employee[]>>;
  getOrgSize(id: number, signal?: AbortSignal): Promise<Timed<OrgSize>>;
  getHeadcount(signal?: AbortSignal): Promise<Timed<Headcount>>;
  getPhoto(employeeId: number, signal?: AbortSignal): Promise<Timed<Blob>>;
}
