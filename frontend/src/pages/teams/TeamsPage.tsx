import { useCallback } from "react";
import { QueryTiming } from "../../components/query-timing/QueryTiming.tsx";
import { useDataSource } from "../../data/store.ts";
import { LEVEL_NAMES } from "../../models/employee.ts";
import type { Headcount } from "../../models/organization.ts";
import { formatCount } from "../../utils/format.ts";
import { useAsync } from "../../utils/hooks.ts";
import "./TeamsPage.css";

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8];

function byDivision(rows: Headcount["byDivision"]) {
  const divisions = new Map<string, Map<number, number>>();
  for (const { division, level, count } of rows) {
    if (!divisions.has(division)) divisions.set(division, new Map());
    divisions.get(division)!.set(level, count);
  }
  return [...divisions].map(([division, levels]) => ({
    division,
    levels,
    total: [...levels.values()].reduce((sum, count) => sum + count, 0),
  }));
}

export function TeamsPage() {
  const dataSource = useDataSource();
  const loadHeadcount = useCallback((signal: AbortSignal) => dataSource.getHeadcount(signal), [dataSource]);
  const headcount = useAsync(loadHeadcount);
  const data = headcount.data?.data;

  return (
    <section className="page">
      <h1>Teams</h1>
      {headcount.error && <p className="error">Could not load headcount: {headcount.error.message}</p>}
      <QueryTiming summary="Headcount calculated" result={headcount.data} />

      {data && (
        <>
          <div className="table-wrap">
            <table className="table table-numeric">
              <caption>Headcount by division and level</caption>
              <thead>
                <tr>
                  <th scope="col">Division</th>
                  {LEVELS.map((level) => (
                    <th scope="col" key={level}>
                      {LEVEL_NAMES[level]}
                    </th>
                  ))}
                  <th scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {byDivision(data.byDivision).map((row) => (
                  <tr key={row.division}>
                    <th scope="row">{row.division}</th>
                    {LEVELS.map((level) => (
                      <td key={level}>{formatCount(row.levels.get(level) ?? 0)}</td>
                    ))}
                    <td>
                      <strong>{formatCount(row.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="table table-numeric">
              <caption>Headcount by location</caption>
              <thead>
                <tr>
                  <th scope="col">Location</th>
                  <th scope="col">People</th>
                </tr>
              </thead>
              <tbody>
                {data.byLocation.map((row) => (
                  <tr key={row.location}>
                    <th scope="row">{row.location}</th>
                    <td>{formatCount(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
