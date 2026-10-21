import { SOURCE_LABELS, type Timed } from "../../data/dataSource.ts";
import { formatMs } from "../../utils/format.ts";
import "./QueryTiming.css";

interface QueryTimingProps {
  summary: string;
  result?: Timed<unknown>;
}

function breakdown({ dbMs, latencyMs }: Timed<unknown>): string {
  const parts: string[] = [];
  if (dbMs !== undefined) parts.push(`database ${formatMs(dbMs)}`);
  if (latencyMs !== undefined) parts.push(`simulated latency ${formatMs(latencyMs)}`);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

export function QueryTiming({ summary, result }: QueryTimingProps) {
  return (
    <p className="timing" aria-live="polite">
      {result && (
        <>
          {summary} in <strong>{formatMs(result.totalMs)}</strong>
          {breakdown(result)}
          <span className="timing-source">{SOURCE_LABELS[result.source]}</span>
        </>
      )}
    </p>
  );
}
