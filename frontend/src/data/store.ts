import { useSyncExternalStore } from "react";
import type { DataSource, SourceName } from "./dataSource.ts";
import {
  closeIndexedDb,
  deleteIndexedDb,
  getIndexedDbStatus,
  getLastSynced,
  indexedDbSource,
  syncFromServer,
  type SyncPhase,
  type SyncResult,
} from "./indexedDbSource.ts";
import {
  type LatencyRange,
  savedLatencyRange,
  savedSimulatedLatency,
  savedSource,
  saveLatencyRange,
  saveSimulatedLatency,
  saveSource,
} from "./preferences.ts";
import { serverSource } from "./serverSource.ts";

const SOURCES: Record<SourceName, DataSource> = { server: serverSource, indexeddb: indexedDbSource };

interface SyncState {
  running: boolean;
  phase: SyncPhase;
  saved: number;
  total: number;
  result?: SyncResult & { durationMs: number };
  error?: string;
}

interface DataState {
  source: SourceName;
  simulatedLatency: boolean;
  latencyRange: LatencyRange;
  sync: SyncState;
  indexedDbRevision: number;
}

const IDLE_SYNC: SyncState = { running: false, phase: "employees", saved: 0, total: 0 };

let state: DataState = {
  source: savedSource(),
  simulatedLatency: savedSimulatedLatency(),
  latencyRange: savedLatencyRange(),
  sync: IDLE_SYNC,
  indexedDbRevision: 0,
};
const listeners = new Set<() => void>();

function update(next: Partial<DataState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDataState(): DataState {
  return useSyncExternalStore(subscribe, () => state);
}

export function useDataSource(): DataSource {
  return SOURCES[useDataState().source];
}

function switchSource(source: SourceName) {
  saveSource(source);
  update({ source });
}

export async function syncIndexedDb(): Promise<boolean> {
  if (state.sync.running) return false;
  const started = performance.now();
  update({ sync: { ...IDLE_SYNC, running: true } });
  try {
    const result = await syncFromServer((phase, saved, total) => update({ sync: { running: true, phase, saved, total } }));
    update({
      sync: { ...IDLE_SYNC, result: { ...result, durationMs: performance.now() - started } },
      indexedDbRevision: state.indexedDbRevision + 1,
    });
    return true;
  } catch (error) {
    update({
      sync: { ...IDLE_SYNC, error: (error as Error).message },
      indexedDbRevision: state.indexedDbRevision + 1,
    });
    return false;
  }
}

export async function selectSource(source: SourceName): Promise<void> {
  if (source === "server") {
    switchSource("server");
    await closeIndexedDb();
    return;
  }

  if (!(await getLastSynced()) && !(await syncIndexedDb())) {
    await deleteIndexedDb();
    return;
  }
  switchSource("indexeddb");
}

export function setSimulatedLatency(enabled: boolean): void {
  saveSimulatedLatency(enabled);
  update({ simulatedLatency: enabled });
}

export function setLatencyRange(range: LatencyRange): void {
  saveLatencyRange(range);
  update({ latencyRange: range });
}

export async function deleteIndexedDbData(): Promise<void> {
  switchSource("server");
  await deleteIndexedDb();
  update({ sync: IDLE_SYNC, indexedDbRevision: state.indexedDbRevision + 1 });
}

async function fallBackToServerWithoutIndexedDbData() {
  if (state.source !== "indexeddb") return;
  try {
    if (!(await getLastSynced()) && state.source === "indexeddb" && !state.sync.running) await selectSource("server");
  } catch (error) {
    console.error("Could not read IndexedDB, using the server instead:", error);
    switchSource("server");
  }
}

fallBackToServerWithoutIndexedDbData();

export { getIndexedDbStatus };
