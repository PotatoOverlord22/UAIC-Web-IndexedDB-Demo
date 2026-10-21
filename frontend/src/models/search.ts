import type { Employee } from "./employee.ts";

export interface SearchQuery {
  text: string;
  division?: string;
  location?: string;
  limit: number;
}

export interface SearchResult {
  total: number;
  results: Employee[];
}
