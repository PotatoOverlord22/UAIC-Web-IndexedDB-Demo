import { useCallback, useState } from "react";
import { Link } from "react-router";
import { EmployeePhoto } from "../../components/employee-photo/EmployeePhoto.tsx";
import { QueryTiming } from "../../components/query-timing/QueryTiming.tsx";
import { useDataSource } from "../../data/store.ts";
import { DIVISIONS, LOCATIONS } from "../../models/organization.ts";
import { formatCount } from "../../utils/format.ts";
import { useAsync, useDebouncedValue } from "../../utils/hooks.ts";
import "./DirectoryPage.css";

const PAGE_SIZE = 50;

export function DirectoryPage() {
  const dataSource = useDataSource();
  const [text, setText] = useState("");
  const [division, setDivision] = useState("");
  const [location, setLocation] = useState("");
  const debouncedText = useDebouncedValue(text, 200);

  const loadSearch = useCallback(
    (signal: AbortSignal) =>
      dataSource.searchEmployees({ text: debouncedText, division, location, limit: PAGE_SIZE }, signal),
    [dataSource, debouncedText, division, location],
  );
  const search = useAsync(loadSearch);
  const result = search.data;

  return (
    <section className="page">
      <h1>Directory</h1>

      <form className="filters" role="search" onSubmit={(event) => event.preventDefault()}>
        <label className="field field-grow">
          <span>Name</span>
          <input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search by first or last name"
            autoComplete="off"
            maxLength={64}
          />
        </label>
        <label className="field">
          <span>Division</span>
          <select value={division} onChange={(event) => setDivision(event.target.value)}>
            <option value="">All divisions</option>
            {DIVISIONS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Location</span>
          <select value={location} onChange={(event) => setLocation(event.target.value)}>
            <option value="">All locations</option>
            {LOCATIONS.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </form>

      {search.error && <p className="error">Could not load employees: {search.error.message}</p>}

      <QueryTiming
        summary={`${formatCount(result?.data.total ?? 0)} ${result?.data.total === 1 ? "result" : "results"}`}
        result={result}
      />

      <div className={search.loading ? "table-wrap is-loading" : "table-wrap"} aria-busy={search.loading}>
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Title</th>
              <th scope="col">Division</th>
              <th scope="col">Location</th>
            </tr>
          </thead>
          <tbody>
            {result?.data.results.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <span className="person">
                    <EmployeePhoto employeeId={employee.id} size={32} />
                    <Link to={`/people/${employee.id}`}>
                      {employee.firstName} {employee.lastName}
                    </Link>
                  </span>
                </td>
                <td>{employee.title}</td>
                <td>{employee.division}</td>
                <td>{employee.location}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result && result.data.total > result.data.results.length && (
        <p className="muted">
          Showing the first {formatCount(result.data.results.length)}. Refine the search to narrow the list.
        </p>
      )}
    </section>
  );
}
