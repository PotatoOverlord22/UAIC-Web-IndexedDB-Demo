import { NavLink } from "react-router";
import "./Header.css";

const NAV_ITEMS = [
  { to: "/", label: "Directory" },
  { to: "/org", label: "Org chart" },
  { to: "/teams", label: "Teams" },
  { to: "/settings", label: "Settings" },
];

export function Header() {
  return (
    <header className="header">
      <NavLink to="/" className="header-logo">
        <img src="/arasaka-logo.webp" alt="Arasaka" width={248} height={28} />
      </NavLink>
      <nav aria-label="Main">
        <ul className="nav">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === "/"} className="nav-link">
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
