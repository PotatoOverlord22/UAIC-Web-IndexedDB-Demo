import type { Employee } from "../models/employee.ts";
import type { Headcount } from "../models/organization.ts";
import type { Photo } from "../models/photo.ts";
import { formatCount } from "../utils/format.ts";
import { firstTime, logIndexedDb, warnIndexedDb } from "../utils/log.ts";

export interface StoredEmployee extends Employee {
  path: number[];
  nameTokens: string[];
}

interface IndexedDbSearch {
  tokens: string[];
  division?: string;
  location?: string;
  limit: number;
}

const DB_NAME = "arasaka-directory";
const DB_VERSION = 3;
const EMPLOYEES = "employees";
const PHOTOS = "photos";
const META = "meta";
const CHUNK_SIZE = 1000;

const quote = (value: unknown) => JSON.stringify(value);
const list = (values: unknown[]) => `[${values.map(quote).join(", ")}]`;
const lines = (...code: string[]) => code.join("\n");

export function openDatabase(onClosed: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Opening database ${quote(DB_NAME)}, version ${DB_VERSION}`,
      `indexedDB.open(${quote(DB_NAME)}, ${DB_VERSION})`,
    );
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      logIndexedDb(
        `Upgrade needed: the browser has version ${event.oldVersion}, the app needs version ${event.newVersion}`,
        "request.onupgradeneeded",
      );
      const db = request.result;
      const oldStores = [...db.objectStoreNames];
      if (oldStores.length > 0) {
        logIndexedDb(
          "Deleting the old object stores",
          lines(...oldStores.map((name) => `db.deleteObjectStore(${quote(name)})`)),
        );
      }
      for (const name of oldStores) db.deleteObjectStore(name);

      logIndexedDb(
        "Creating the object stores and indexes",
        lines(
          `const employees = db.createObjectStore(${quote(EMPLOYEES)}, { keyPath: "id" })`,
          `employees.createIndex("managerId", "managerId")`,
          `employees.createIndex("division", "division")`,
          `employees.createIndex("name", ["lastName", "firstName"])`,
          `employees.createIndex("nameTokens", "nameTokens", { multiEntry: true })`,
          `employees.createIndex("path", "path", { multiEntry: true })`,
          `db.createObjectStore(${quote(PHOTOS)})`,
          `db.createObjectStore(${quote(META)})`,
        ),
      );
      const employees = db.createObjectStore(EMPLOYEES, { keyPath: "id" });
      employees.createIndex("managerId", "managerId");
      employees.createIndex("division", "division");
      employees.createIndex("name", ["lastName", "firstName"]);
      employees.createIndex("nameTokens", "nameTokens", { multiEntry: true });
      employees.createIndex("path", "path", { multiEntry: true });

      db.createObjectStore(PHOTOS);
      db.createObjectStore(META);
    };

    request.onblocked = () =>
      warnIndexedDb("The upgrade is waiting for other tabs of this app to close", "request.onblocked");

    request.onsuccess = () => {
      const db = request.result;
      logIndexedDb(`Connected to ${quote(db.name)}, version ${db.version}`, "request.onsuccess", db);
      db.onversionchange = () => {
        logIndexedDb(
          "Another tab is upgrading or deleting the database, so this tab closes its connection",
          lines("db.onversionchange", "db.close()"),
        );
        db.close();
        onClosed();
      };
      db.onclose = () => {
        logIndexedDb("The browser closed the connection", "db.onclose");
        onClosed();
      };
      resolve(db);
    };

    request.onerror = () => reject(request.error);
  });
}

export function clearAll(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      "Clearing every object store in one readwrite transaction",
      lines(
        `const transaction = db.transaction(${list([EMPLOYEES, PHOTOS, META])}, "readwrite")`,
        `transaction.objectStore(${quote(EMPLOYEES)}).clear()`,
        `transaction.objectStore(${quote(PHOTOS)}).clear()`,
        `transaction.objectStore(${quote(META)}).delete("lastSynced")`,
      ),
    );
    const transaction = db.transaction([EMPLOYEES, PHOTOS, META], "readwrite");
    transaction.objectStore(EMPLOYEES).clear();
    transaction.objectStore(PHOTOS).clear();
    transaction.objectStore(META).delete("lastSynced");
    transaction.oncomplete = () => {
      logIndexedDb("Object stores cleared", "transaction.oncomplete");
      resolve();
    };
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveEmployees(
  db: IDBDatabase,
  employees: StoredEmployee[],
  onProgress: (saved: number) => void,
): Promise<void> {
  logIndexedDb(
    `Saving ${formatCount(employees.length)} employees, ${formatCount(CHUNK_SIZE)} per readwrite transaction`,
    lines(
      `const transaction = db.transaction(${quote(EMPLOYEES)}, "readwrite")`,
      `const store = transaction.objectStore(${quote(EMPLOYEES)})`,
      "for (const employee of chunk) store.put(employee)",
    ),
  );
  for (let start = 0; start < employees.length; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, employees.length);
    const sample = start === 0;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(EMPLOYEES, "readwrite");
      const store = transaction.objectStore(EMPLOYEES);
      for (const employee of employees.slice(start, end)) {
        store.put(employee);
      }
      transaction.oncomplete = () => {
        if (sample) {
          logIndexedDb(
            `Saved employees ${formatCount(start + 1)} to ${formatCount(end)} (only the first transaction is logged)`,
            "transaction.oncomplete",
          );
        }
        resolve();
      };
      transaction.onabort = () => reject(transaction.error);
    });
    onProgress(end);
  }
}

export function savePhotos(db: IDBDatabase, photos: Photo[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const sample = firstTime("photo batch");
    if (sample) {
      logIndexedDb(
        `Saving ${formatCount(photos.length)} photos as Blobs in one transaction (only the first batch is logged)`,
        lines(
          `const store = db.transaction(${quote(PHOTOS)}, "readwrite").objectStore(${quote(PHOTOS)})`,
          "for (const { employeeId, png } of photos) store.put(png, employeeId)",
        ),
      );
    }
    const transaction = db.transaction(PHOTOS, "readwrite");
    const store = transaction.objectStore(PHOTOS);
    for (const { employeeId, png } of photos) {
      store.put(png, employeeId);
    }
    transaction.oncomplete = () => {
      if (sample) logIndexedDb(`Saved ${formatCount(photos.length)} photos`, "transaction.oncomplete");
      resolve();
    };
    transaction.onabort = () => reject(transaction.error);
  });
}

export function setLastSynced(db: IDBDatabase, isoDate: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(META, "readwrite");
    transaction.objectStore(META).put(isoDate, "lastSynced");
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

export function getEmployee(db: IDBDatabase, id: number): Promise<StoredEmployee | undefined> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Reading employee ${id} by primary key`,
      `db.transaction(${quote(EMPLOYEES)}).objectStore(${quote(EMPLOYEES)}).get(${id})`,
    );
    const request = db.transaction(EMPLOYEES).objectStore(EMPLOYEES).get(id);
    request.onsuccess = () => {
      logIndexedDb(request.result ? `Got employee ${id}` : `No employee ${id}`, "request.onsuccess", request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function getEmployees(db: IDBDatabase, ids: number[]): Promise<StoredEmployee[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Reading ${ids.length} employees by primary key in one transaction`,
      lines(
        `const store = db.transaction(${quote(EMPLOYEES)}).objectStore(${quote(EMPLOYEES)})`,
        `${list(ids)}.forEach((id) => store.get(id))`,
      ),
    );
    const transaction = db.transaction(EMPLOYEES);
    const store = transaction.objectStore(EMPLOYEES);
    const found: StoredEmployee[] = [];

    ids.forEach((id, position) => {
      const request = store.get(id);
      request.onsuccess = () => {
        found[position] = request.result;
      };
    });

    transaction.oncomplete = () => {
      const employees = found.filter(Boolean);
      logIndexedDb(`Got ${employees.length} employees`, "transaction.oncomplete", employees);
      resolve(employees);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export function getPhoto(db: IDBDatabase, employeeId: number): Promise<Blob | undefined> {
  return new Promise((resolve, reject) => {
    const sample = firstTime("photo read");
    if (sample) {
      logIndexedDb(
        `Reading photo ${employeeId} (only the first photo read is logged)`,
        `db.transaction(${quote(PHOTOS)}).objectStore(${quote(PHOTOS)}).get(${employeeId})`,
      );
    }
    const request = db.transaction(PHOTOS).objectStore(PHOTOS).get(employeeId);
    request.onsuccess = () => {
      if (sample) {
        const message = request.result ? `Got photo ${employeeId}` : `No photo ${employeeId}`;
        logIndexedDb(message, "request.onsuccess", request.result);
      }
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function getDirectReports(db: IDBDatabase, managerId: number): Promise<StoredEmployee[]> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Reading the direct reports of ${managerId} through the "managerId" index`,
      `db.transaction(${quote(EMPLOYEES)}).objectStore(${quote(EMPLOYEES)}).index("managerId").getAll(${managerId})`,
    );
    const request = db.transaction(EMPLOYEES).objectStore(EMPLOYEES).index("managerId").getAll(managerId);
    request.onsuccess = () => {
      logIndexedDb(`Got ${formatCount(request.result.length)} direct reports`, "request.onsuccess", request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function getEveryoneUnder(db: IDBDatabase, managerId: number): Promise<StoredEmployee[]> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Reading everyone under ${managerId} through the "path" index`,
      `db.transaction(${quote(EMPLOYEES)}).objectStore(${quote(EMPLOYEES)}).index("path").getAll(${managerId})`,
    );
    const request = db.transaction(EMPLOYEES).objectStore(EMPLOYEES).index("path").getAll(managerId);
    request.onsuccess = () => {
      logIndexedDb(`Got ${formatCount(request.result.length)} people`, "request.onsuccess", request.result);
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function searchEmployees(
  db: IDBDatabase,
  { tokens, division, location, limit }: IndexedDbSearch,
): Promise<{ total: number; results: StoredEmployee[] }> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EMPLOYEES);
    const store = transaction.objectStore(EMPLOYEES);

    if (tokens.length === 0 && !division && !location) {
      logIndexedDb(
        `Counting the employees and reading the first ${limit} through the "name" index`,
        lines(`store.count()`, `store.index("name").getAll(null, ${limit})`),
      );
      const countRequest = store.count();
      const pageRequest = store.index("name").getAll(null, limit);
      transaction.oncomplete = () => {
        logIndexedDb(
          `Got ${pageRequest.result.length} of ${formatCount(countRequest.result)} employees`,
          "transaction.oncomplete",
          pageRequest.result,
        );
        resolve({ total: countRequest.result, results: pageRequest.result });
      };
      transaction.onerror = () => reject(transaction.error);
      return;
    }

    let source: IDBObjectStore | IDBIndex = store;
    let range: IDBKeyRange | null = null;
    let message = "No index covers this filter, so a cursor reads every employee";
    let code = "store.openCursor()";
    if (tokens.length > 0) {
      source = store.index("nameTokens");
      range = IDBKeyRange.bound(tokens[0], `${tokens[0]}\uffff`);
      message = `Searching for names starting with "${tokens[0]}" through the "nameTokens" index`;
      code = `store.index("nameTokens").openCursor(IDBKeyRange.bound("${tokens[0]}", "${tokens[0]}\\uffff"))`;
    } else if (division) {
      source = store.index("division");
      range = IDBKeyRange.only(division);
      message = `Filtering by division through the "division" index`;
      code = `store.index("division").openCursor(IDBKeyRange.only(${quote(division)}))`;
    }
    logIndexedDb(message, code);

    const matches = new Map<number, StoredEmployee>();
    let visited = 0;
    const request = source.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        const sorted = [...matches.values()].sort(compareByName);
        logIndexedDb(
          `Cursor finished: read ${formatCount(visited)} records, ${formatCount(sorted.length)} matched`,
          "request.onsuccess (cursor is null)",
          sorted,
        );
        resolve({ total: sorted.length, results: sorted.slice(0, limit) });
        return;
      }

      visited += 1;
      const employee: StoredEmployee = cursor.value;
      if (matchesSearch(employee, tokens, division, location)) matches.set(employee.id, employee);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function matchesSearch(employee: StoredEmployee, tokens: string[], division?: string, location?: string): boolean {
  return (
    tokens.every((token) => employee.nameTokens.some((name) => name.startsWith(token))) &&
    (!division || employee.division === division) &&
    (!location || employee.location === location)
  );
}

export function compareByName(a: StoredEmployee, b: StoredEmployee): number {
  const [aFirst, aLast] = a.nameTokens;
  const [bFirst, bLast] = b.nameTokens;
  if (aLast !== bLast) return aLast < bLast ? -1 : 1;
  if (aFirst !== bFirst) return aFirst < bFirst ? -1 : 1;
  return a.id - b.id;
}

export function getHeadcount(db: IDBDatabase): Promise<Headcount> {
  return new Promise((resolve, reject) => {
    const byDivision = new Map<string, number>();
    const byLocation = new Map<string, number>();
    let visited = 0;

    logIndexedDb(
      "Counting people per division and location: there is no GROUP BY, so a cursor reads every employee",
      `db.transaction(${quote(EMPLOYEES)}).objectStore(${quote(EMPLOYEES)}).openCursor()`,
    );
    const request = db.transaction(EMPLOYEES).objectStore(EMPLOYEES).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        const headcount: Headcount = {
          byDivision: [...byDivision]
            .map(([key, count]) => {
              const [division, level] = key.split("|");
              return { division, level: Number(level), count };
            })
            .sort((a, b) => a.division.localeCompare(b.division) || a.level - b.level),
          byLocation: [...byLocation]
            .map(([location, count]) => ({ location, count }))
            .sort((a, b) => b.count - a.count),
        };
        logIndexedDb(
          `Cursor finished: read ${formatCount(visited)} records`,
          "request.onsuccess (cursor is null)",
          headcount,
        );
        resolve(headcount);
        return;
      }

      visited += 1;
      const { division, level, location }: StoredEmployee = cursor.value;
      const key = `${division}|${level}`;
      byDivision.set(key, (byDivision.get(key) ?? 0) + 1);
      byLocation.set(location, (byLocation.get(location) ?? 0) + 1);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export function getLastSynced(db: IDBDatabase): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(META).objectStore(META).get("lastSynced");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function countRecords(db: IDBDatabase, storeName: typeof EMPLOYEES | typeof PHOTOS): Promise<number> {
  return new Promise((resolve, reject) => {
    logIndexedDb(
      `Counting the records in ${quote(storeName)}`,
      `db.transaction(${quote(storeName)}).objectStore(${quote(storeName)}).count()`,
    );
    const request = db.transaction(storeName).objectStore(storeName).count();
    request.onsuccess = () => {
      logIndexedDb(`${quote(storeName)} has ${formatCount(request.result)} records`, "request.onsuccess");
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

export function closeDatabase(db: IDBDatabase): void {
  logIndexedDb(`Closing the connection to ${quote(db.name)}`, "db.close()");
  db.close();
}

export function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    logIndexedDb(`Deleting database ${quote(DB_NAME)}`, `indexedDB.deleteDatabase(${quote(DB_NAME)})`);
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onblocked = () =>
      warnIndexedDb("Deleting the database is waiting for other tabs to close", "request.onblocked");
    request.onsuccess = () => {
      logIndexedDb("Database deleted", "request.onsuccess");
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
