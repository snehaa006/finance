import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Dashboard } from "@/pages/Dashboard";
import { Transactions } from "@/pages/Transactions";
import { Accounts } from "@/pages/Accounts";
import { Reconcile } from "@/pages/Reconcile";
import { ReconcileDetail } from "@/pages/ReconcileDetail";
import { Settings } from "@/pages/Settings";
import { Login } from "@/pages/Login";
import { AppDataProvider } from "@/lib/store";
import { useAuth } from "@/lib/auth";

export function App() {
  const { authenticated } = useAuth();

  // Hold the first paint until the session check resolves, so a logged-in
  // reload doesn't flash the login screen.
  if (authenticated === null) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!authenticated) return <Login />;

  return (
    <AppDataProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="reconcile" element={<Reconcile />} />
          <Route path="reconcile/:id" element={<ReconcileDetail />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppDataProvider>
  );
}
