import { useCallback } from "react";
import { Link, useParams } from "react-router";
import { EmployeePhoto } from "../../components/employee-photo/EmployeePhoto.tsx";
import { QueryTiming } from "../../components/query-timing/QueryTiming.tsx";
import { useDataSource } from "../../data/store.ts";
import { LEVEL_NAMES } from "../../models/employee.ts";
import { formatCount, formatDate } from "../../utils/format.ts";
import { useAsync } from "../../utils/hooks.ts";
import "./ProfilePage.css";

export function ProfilePage() {
  const id = Number(useParams().id);
  const dataSource = useDataSource();

  const loadProfile = useCallback((signal: AbortSignal) => dataSource.getEmployee(id, signal), [dataSource, id]);
  const loadReports = useCallback((signal: AbortSignal) => dataSource.getDirectReports(id, signal), [dataSource, id]);
  const loadOrg = useCallback((signal: AbortSignal) => dataSource.getOrgSize(id, signal), [dataSource, id]);
  const profile = useAsync(loadProfile);
  const reports = useAsync(loadReports);
  const org = useAsync(loadOrg);

  if (profile.error) return <p className="page error">Could not load this profile: {profile.error.message}</p>;
  const employee = profile.data?.data;
  if (!employee) return <p className="page muted">Loading profile…</p>;

  return (
    <section className="page">
      <nav aria-label="Reporting line" className="breadcrumb">
        <ol>
          {employee.managerChain.map((manager) => (
            <li key={manager.id}>
              <Link to={`/people/${manager.id}`}>
                {manager.firstName} {manager.lastName}
              </Link>
            </li>
          ))}
          <li aria-current="page">
            {employee.firstName} {employee.lastName}
          </li>
        </ol>
      </nav>

      <div className="profile-header">
        <EmployeePhoto employeeId={employee.id} size={64} />
        <div>
          <h1>
            {employee.firstName} {employee.lastName}
          </h1>
          <p className="subtitle">{employee.title}</p>
        </div>
      </div>
      <QueryTiming summary="Profile and reporting line loaded" result={profile.data} />

      <dl className="details">
        <div>
          <dt>Email</dt>
          <dd>
            <a href={`mailto:${employee.email}`}>{employee.email}</a>
          </dd>
        </div>
        <div>
          <dt>Division</dt>
          <dd>{employee.division}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{employee.location}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>
            {employee.level} · {LEVEL_NAMES[employee.level]}
          </dd>
        </div>
        <div>
          <dt>Joined</dt>
          <dd>{formatDate(employee.startDate)}</dd>
        </div>
      </dl>

      {org.data && org.data.data.total > 0 && (
        <section className="panel">
          <h2>Organization</h2>
          <QueryTiming summary={`${formatCount(org.data.data.total)} people in this org`} result={org.data} />
          <ul className="level-bars">
            {org.data.data.byLevel.map((row) => (
              <li key={row.level}>
                <span>{LEVEL_NAMES[row.level]}</span>
                <strong>{formatCount(row.count)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reports.data && reports.data.data.length > 0 && (
        <section className="panel">
          <h2>Direct reports</h2>
          <QueryTiming summary={`${reports.data.data.length} direct reports`} result={reports.data} />
          <ul className="people-list">
            {reports.data.data.map((report) => (
              <li key={report.id}>
                <span className="person">
                  <EmployeePhoto employeeId={report.id} size={24} />
                  <Link to={`/people/${report.id}`}>
                    {report.firstName} {report.lastName}
                  </Link>
                </span>
                <span className="muted">{report.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
