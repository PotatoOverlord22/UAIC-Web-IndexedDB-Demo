import { SOURCE_LABELS, type SourceName } from "../../data/dataSource.ts";
import { LATENCY_RANGES, type LatencyRange } from "../../data/preferences.ts";
import { getServerHealth } from "../../data/serverSource.ts";
import {
  deleteIndexedDbData,
  getIndexedDbStatus,
  selectSource,
  setLatencyRange,
  setSimulatedLatency,
  syncIndexedDb,
  useDataState,
} from "../../data/store.ts";
import { formatCount, formatDateTime, formatMegabytes, formatMs } from "../../utils/format.ts";
import { useAsync } from "../../utils/hooks.ts";
import "./SettingsPage.css";

const estimateStorage = () => navigator.storage.estimate();

function SyncProgress() {
  const { sync } = useDataState();

  if (sync.running) {
    return (
      <div className="sync-progress">
        <progress value={sync.saved} max={sync.total || undefined} aria-label="Sync progress" />
        <span className="muted">
          {sync.total === 0
            ? "Downloading…"
            : `Saved ${formatCount(sync.saved)} of ${formatCount(sync.total)} ${sync.phase}`}
        </span>
      </div>
    );
  }
  if (sync.error) return <p className="error">Sync failed: {sync.error}</p>;
  if (sync.result) {
    return (
      <p className="muted">
        Synced {formatCount(sync.result.employees)} employees and {formatCount(sync.result.photos)} photos in{" "}
        {(sync.result.durationMs / 1000).toFixed(1)} s.
      </p>
    );
  }
  return null;
}

function IndexedDbDetails() {
  const status = useAsync(getIndexedDbStatus);
  const storage = useAsync(estimateStorage);

  return (
    <dl className="details">
      <div>
        <dt>Last synced</dt>
        <dd>{status.data?.lastSynced ? formatDateTime(status.data.lastSynced) : "Not synced yet"}</dd>
      </div>
      <div>
        <dt>Employees stored</dt>
        <dd>{formatCount(status.data?.employees ?? 0)}</dd>
      </div>
      <div>
        <dt>Photos stored</dt>
        <dd>{formatCount(status.data?.photos ?? 0)}</dd>
      </div>
      <div>
        <dt>Storage used by this site</dt>
        <dd>{formatMegabytes(storage.data?.usage)}</dd>
      </div>
    </dl>
  );
}

function DataSourcePanel() {
  const { source, sync, indexedDbRevision } = useDataState();

  return (
    <section className="panel">
      <h2>Data source</h2>
      <label className="field">
        <span>Read employee data from</span>
        <select
          value={source}
          disabled={sync.running}
          onChange={(event) => selectSource(event.target.value as SourceName)}
        >
          {Object.entries(SOURCE_LABELS).map(([name, label]) => (
            <option key={name} value={name}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {source === "indexeddb" && <IndexedDbDetails key={indexedDbRevision} />}
      <SyncProgress />
      {source === "indexeddb" && (
        <div className="actions">
          <button type="button" className="button" disabled={sync.running} onClick={syncIndexedDb}>
            Sync now
          </button>
          <button
            type="button"
            className="button button-secondary"
            disabled={sync.running}
            onClick={deleteIndexedDbData}
          >
            Delete IndexedDB data
          </button>
        </div>
      )}
    </section>
  );
}

function ServerHealth() {
  const health = useAsync(getServerHealth);

  if (health.loading) return <p className="muted">Checking…</p>;
  if (health.error) return <p className="error">Unreachable: {health.error.message}</p>;
  if (!health.data) return null;

  return (
    <dl className="details">
      <div>
        <dt>Status</dt>
        <dd className="status-ok">Connected</dd>
      </div>
      <div>
        <dt>Employees</dt>
        <dd>{formatCount(health.data.data.employees)}</dd>
      </div>
      <div>
        <dt>Round trip</dt>
        <dd>{formatMs(health.data.totalMs)}</dd>
      </div>
      <div>
        <dt>Simulated latency</dt>
        <dd>{health.data.latencyMs === undefined ? "Off" : formatMs(health.data.latencyMs)}</dd>
      </div>
    </dl>
  );
}

function ServerPanel() {
  const { simulatedLatency, latencyRange } = useDataState();

  return (
    <section className="panel">
      <h2>Server</h2>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={simulatedLatency}
          onChange={(event) => setSimulatedLatency(event.target.checked)}
        />
        Simulate network latency
      </label>
      <label className="field latency-field">
        <span>Delay per request</span>
        <select
          value={latencyRange}
          disabled={!simulatedLatency}
          onChange={(event) => setLatencyRange(event.target.value as LatencyRange)}
        >
          {LATENCY_RANGES.map((range) => (
            <option key={range} value={range}>
              {range} ms
            </option>
          ))}
        </select>
      </label>
      <ServerHealth key={`${simulatedLatency}-${latencyRange}`} />
    </section>
  );
}

export function SettingsPage() {
  return (
    <section className="page settings">
      <h1>Settings</h1>
      <DataSourcePanel />
      <ServerPanel />
    </section>
  );
}
