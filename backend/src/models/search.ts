import type { Employee } from "./employee.ts";

export interface SearchResult {
  total: number;
  results: Employee[];
}
