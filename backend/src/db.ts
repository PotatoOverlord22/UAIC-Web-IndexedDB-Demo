import { DatabaseSync, type StatementSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Employee } from "./models/employee.ts";
import type { Headcount, OrgSize } from "./models/organization.ts";
import type { Photo } from "./models/photo.ts";
import type { SearchResult } from "./models/search.ts";

export const DB_PATH = fileURLToPath(new URL("../data/arasaka.db", import.meta.url));

if (!existsSync(DB_PATH)) {
  throw new Error(`Database not found at ${DB_PATH}. Run "npm run seed" in the scripts folder first.`);
}

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export interface Timed<T> {
  value: T;
  dbMs: number;
}

interface SearchFilters {
  tokens: string[];
  division?: string;
  location?: string;
  limit: number;
}

const columns = (table: string) => `
  ${table}.id, ${table}.first_name AS firstName, ${table}.last_name AS lastName, ${table}.email, ${table}.title,
  ${table}.level, ${table}.division, ${table}.location, ${table}.manager_id AS managerId, ${table}.start_date AS startDate`;

const statements = new Map<string, StatementSync>();

function statement(sql: string): StatementSync {
  let prepared = statements.get(sql);
  if (!prepared) {
    prepared = db.prepare(sql);
    statements.set(sql, prepared);
  }
  return prepared;
}

function timed<T>(run: () => T): Timed<T> {
  const started = performance.now();
  const value = run();
  return { value, dbMs: performance.now() - started };
}

const prefixEnd = (prefix: string) => `${prefix}\uffff`;

export function countEmployees(): Timed<number> {
  return timed(() => Number(statement("SELECT count(*) AS total FROM employees").get()?.total));
}

export function allEmployees(): Timed<Employee[]> {
  return timed(() => statement(`SELECT ${columns("employees")} FROM employees ORDER BY id`).all() as unknown as Employee[]);
}

export function searchEmployees({ tokens, division, location, limit }: SearchFilters): Timed<SearchResult> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  for (const token of tokens) {
    conditions.push("((first_lower >= ? AND first_lower < ?) OR (last_lower >= ? AND last_lower < ?))");
    params.push(token, prefixEnd(token), token, prefixEnd(token));
  }
  if (division) {
    conditions.push("division = ?");
    params.push(division);
  }
  if (location) {
    conditions.push("location = ?");
    params.push(location);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return timed(() => {
    const total = Number(statement(`SELECT count(*) AS total FROM employees ${where}`).get(...params)?.total);
    const results = statement(
      `SELECT ${columns("employees")} FROM employees ${where} ORDER BY last_lower, first_lower, id LIMIT ?`,
    ).all(...params, limit) as unknown as Employee[];
    return { total, results };
  });
}

export function getEmployee(id: number): Timed<Employee | undefined> {
  return timed(
    () => statement(`SELECT ${columns("employees")} FROM employees WHERE id = ?`).get(id) as Employee | undefined,
  );
}

export function managerChain(id: number): Timed<Employee[]> {
  return timed(
    () =>
      statement(`
        WITH RECURSIVE chain (id, manager_id, depth) AS (
          SELECT id, manager_id, 0 FROM employees WHERE id = ?
          UNION ALL
          SELECT e.id, e.manager_id, chain.depth + 1 FROM employees e JOIN chain ON e.id = chain.manager_id
        )
        SELECT ${columns("e")} FROM chain JOIN employees e ON e.id = chain.id
        WHERE chain.depth > 0
        ORDER BY chain.depth DESC
      `).all(id) as unknown as Employee[],
  );
}

export function directReports(id: number): Timed<Employee[]> {
  return timed(
    () =>
      statement(
        `SELECT ${columns("employees")} FROM employees WHERE manager_id = ? ORDER BY last_lower, first_lower, id`,
      ).all(id) as unknown as Employee[],
  );
}

export function orgSize(id: number): Timed<OrgSize> {
  return timed(() => {
    const byLevel = statement(`
      WITH RECURSIVE org (id) AS (
        SELECT id FROM employees WHERE manager_id = ?
        UNION ALL
        SELECT e.id FROM employees e JOIN org ON e.manager_id = org.id
      )
      SELECT e.level, count(*) AS count FROM org JOIN employees e ON e.id = org.id
      GROUP BY e.level
      ORDER BY e.level
    `).all(id) as unknown as OrgSize["byLevel"];
    return { total: byLevel.reduce((sum, row) => sum + row.count, 0), byLevel };
  });
}

export function headcount(): Timed<Headcount> {
  return timed(() => ({
    byDivision: statement(`
      SELECT division, level, count(*) AS count FROM employees
      GROUP BY division, level
      ORDER BY division, level
    `).all() as unknown as Headcount["byDivision"],
    byLocation: statement(`
      SELECT location, count(*) AS count FROM employees
      GROUP BY location
      ORDER BY count DESC
    `).all() as unknown as Headcount["byLocation"],
  }));
}

export function closeDatabase(): void {
  db.close();
}

export function getPhoto(id: number): Timed<Uint8Array | undefined> {
  return timed(() => statement("SELECT png FROM photos WHERE employee_id = ?").get(id)?.png as Uint8Array | undefined);
}

export function photoBatch(afterId: number, limit: number): Timed<Photo[]> {
  return timed(
    () =>
      statement(
        "SELECT employee_id AS employeeId, png FROM photos WHERE employee_id > ? ORDER BY employee_id LIMIT ?",
      ).all(afterId, limit) as unknown as Photo[],
  );
}
