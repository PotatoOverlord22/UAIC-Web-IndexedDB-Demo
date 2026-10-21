import { Navigate, Route, Routes } from "react-router";
import { Header } from "./components/header/Header.tsx";
import { DirectoryPage } from "./pages/directory/DirectoryPage.tsx";
import { OrgChartPage } from "./pages/org-chart/OrgChartPage.tsx";
import { ProfilePage } from "./pages/profile/ProfilePage.tsx";
import { SettingsPage } from "./pages/settings/SettingsPage.tsx";
import { TeamsPage } from "./pages/teams/TeamsPage.tsx";
import "./App.css";

export default function App() {
  return (
    <>
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<DirectoryPage />} />
          <Route path="/people/:id" element={<ProfilePage />} />
          <Route path="/org" element={<OrgChartPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
