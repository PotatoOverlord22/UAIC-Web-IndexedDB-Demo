import { useCallback, useState } from "react";
import { Link } from "react-router";
import { EmployeePhoto } from "../../components/employee-photo/EmployeePhoto.tsx";
import type { Timed } from "../../data/dataSource.ts";
import { useDataSource } from "../../data/store.ts";
import type { Employee } from "../../models/employee.ts";
import { formatMs } from "../../utils/format.ts";
import { useAsync } from "../../utils/hooks.ts";
import "./OrgChartPage.css";

const CEO_ID = 1;
const INDIVIDUAL_CONTRIBUTOR_LEVEL = 8;

function OrgNode({ employee }: { employee: Employee }) {
  const dataSource = useDataSource();
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<Timed<Employee[]>>();
  const [error, setError] = useState<string>();
  const canExpand = employee.level < INDIVIDUAL_CONTRIBUTOR_LEVEL;

  async function toggle() {
    if (!expanded && !reports) {
      setLoading(true);
      setError(undefined);
      try {
        setReports(await dataSource.getDirectReports(employee.id));
      } catch (caught) {
        setError((caught as Error).message);
        return;
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  }

  return (
    <li>
      <div className="org-row">
        {canExpand ? (
          <button
            type="button"
            className="org-toggle"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${employee.firstName} ${employee.lastName}`}
            disabled={loading}
            onClick={toggle}
          >
            {loading ? "…" : expanded ? "−" : "+"}
          </button>
        ) : (
          <span className="org-toggle-spacer" aria-hidden="true" />
        )}
        <EmployeePhoto employeeId={employee.id} size={24} />
        <Link to={`/people/${employee.id}`}>
          {employee.firstName} {employee.lastName}
        </Link>
        <span className="muted">{employee.title}</span>
        {expanded && reports && (
          <span className="org-timing">
            {reports.data.length} reports · {formatMs(reports.totalMs)}
          </span>
        )}
        {error && <span className="error">{error}</span>}
      </div>
      {expanded && reports && (
        <ul className="org-children">
          {reports.data.map((report) => (
            <OrgNode key={report.id} employee={report} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function OrgChartPage() {
  const dataSource = useDataSource();
  const loadCeo = useCallback((signal: AbortSignal) => dataSource.getEmployee(CEO_ID, signal), [dataSource]);
  const ceo = useAsync(loadCeo);

  return (
    <section className="page">
      <h1>Org chart</h1>
      {ceo.error && <p className="error">Could not load the org chart: {ceo.error.message}</p>}
      {ceo.data && (
        <ul className="org-tree" key={dataSource.name}>
          <OrgNode employee={ceo.data.data} />
        </ul>
      )}
    </section>
  );
}
