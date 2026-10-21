import type { Employee } from "../models/employee.ts";
import type { DataSource, Timed } from "./dataSource.ts";
import * as idb from "./indexedDb.ts";
import type { StoredEmployee } from "./indexedDb.ts";
import { getAllEmployees, getPhotoBatch } from "./serverSource.ts";

export type SyncPhase = "employees" | "photos";

export interface SyncResult {
  employees: number;
  photos: number;
}

export interface IndexedDbStatus extends SyncResult {
  lastSynced?: string;
}

const PHOTO_BATCH_SIZE = 2000;

let connection: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  connection ??= idb
    .openDatabase(() => (connection = undefined))
    .catch((error) => {
      connection = undefined;
      throw error;
    });
  return connection;
}

async function timed<T>(query: (db: IDBDatabase) => Promise<T>): Promise<Timed<T>> {
  const db = await database();
  const started = performance.now();
  const data = await query(db);
  return { data, source: "indexeddb", totalMs: performance.now() - started };
}

export const indexedDbSource: DataSource = {
  name: "indexeddb",

  searchEmployees: ({ text, division, location, limit }) =>
    timed((db) =>
      idb.searchEmployees(db, {
        tokens: text.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 4),
        division,
        location,
        limit,
      }),
    ),

  getEmployee: (id) =>
    timed(async (db) => {
      const employee = await idb.getEmployee(db, id);
      if (!employee) throw new Error("Employee not found");
      return { ...employee, managerChain: await idb.getEmployees(db, employee.path) };
    }),

  getDirectReports: (id) => timed(async (db) => (await idb.getDirectReports(db, id)).sort(idb.compareByName)),

  getOrgSize: (id) =>
    timed(async (db) => {
      const members = await idb.getEveryoneUnder(db, id);
      const perLevel = new Map<number, number>();
      for (const { level } of members) perLevel.set(level, (perLevel.get(level) ?? 0) + 1);
      const byLevel = [...perLevel].map(([level, count]) => ({ level, count })).sort((a, b) => a.level - b.level);
      return { total: members.length, byLevel };
    }),

  getHeadcount: () => timed((db) => idb.getHeadcount(db)),

  getPhoto: (employeeId) =>
    timed(async (db) => {
      const photo = await idb.getPhoto(db, employeeId);
      if (!photo) throw new Error("Photo not found");
      return photo;
    }),
};

function toStoredEmployees(employees: Employee[]): StoredEmployee[] {
  const paths = new Map<number, number[]>();
  return [...employees]
    .sort((a, b) => a.level - b.level)
    .map((employee) => {
      const path = employee.managerId === null ? [] : [...paths.get(employee.managerId)!, employee.managerId];
      paths.set(employee.id, path);
      return { ...employee, path, nameTokens: [employee.firstName.toLowerCase(), employee.lastName.toLowerCase()] };
    });
}

async function syncPhotos(db: IDBDatabase, onSaved: (saved: number) => void): Promise<number> {
  let saved = 0;
  let afterId = 0;
  for (;;) {
    const batch = (await getPhotoBatch(afterId, PHOTO_BATCH_SIZE)).data;
    if (batch.length === 0) return saved;
    await idb.savePhotos(db, batch);
    saved += batch.length;
    afterId = batch[batch.length - 1].employeeId;
    onSaved(saved);
    if (batch.length < PHOTO_BATCH_SIZE) return saved;
  }
}

export async function syncFromServer(
  onProgress: (phase: SyncPhase, saved: number, total: number) => void,
): Promise<SyncResult> {
  const employees = toStoredEmployees((await getAllEmployees()).data);
  const total = employees.length;

  const db = await database();
  await idb.clearAll(db);

  onProgress("employees", 0, total);
  await idb.saveEmployees(db, employees, (saved) => onProgress("employees", saved, total));

  onProgress("photos", 0, total);
  const photos = await syncPhotos(db, (saved) => onProgress("photos", saved, total));

  await idb.setLastSynced(db, new Date().toISOString());
  return { employees: total, photos };
}

export async function getLastSynced(): Promise<string | undefined> {
  return idb.getLastSynced(await database());
}

export async function getIndexedDbStatus(): Promise<IndexedDbStatus> {
  const db = await database();
  return {
    lastSynced: await idb.getLastSynced(db),
    employees: await idb.countRecords(db, "employees"),
    photos: await idb.countRecords(db, "photos"),
  };
}

export async function closeIndexedDb(): Promise<void> {
  if (!connection) return;
  const pending = connection;
  connection = undefined;
  idb.closeDatabase(await pending);
}

export async function deleteIndexedDb(): Promise<void> {
  await closeIndexedDb();
  await idb.deleteDatabase();
}
