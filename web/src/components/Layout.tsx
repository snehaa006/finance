import * as React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { FileCheck, LayoutDashboard, LogOut, Plus, Receipt, Settings, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TransactionSheet } from "@/components/TransactionSheet";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/transactions", label: "History", icon: Receipt, end: false },
  { to: "/accounts", label: "Accounts", icon: Wallet, end: false },
  { to: "/reconcile", label: "Statement", icon: FileCheck, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function Layout() {
  const [quickAdd, setQuickAdd] = React.useState(false);
  const { logout } = useAuth();

  return (
    <div className="min-h-dvh md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-4 w-4" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-brand">My Money</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <Button size="lg" className="mb-2" onClick={() => setQuickAdd(true)}>
          <Plus /> Add money in or out
        </Button>
        <Button variant="ghost" className="justify-start text-muted-foreground" onClick={logout}>
          <LogOut /> Log out
        </Button>
      </aside>

      <div className="flex-1">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wallet className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight text-brand">My Money</span>
          </div>
          <Button variant="ghost" size="icon" onClick={logout} aria-label="Log out">
            <LogOut />
          </Button>
        </header>

        {/* pb-28 keeps content clear of the fixed bottom nav and its FAB. */}
        <main className="mx-auto w-full max-w-5xl px-4 py-4 pb-28 sm:px-6 md:py-8 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile: floating quick-add + bottom nav */}
      <Button
        size="icon"
        onClick={() => setQuickAdd(true)}
        aria-label="Add money in or out"
        className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full shadow-lg md:hidden"
      >
        <Plus className="!size-6" />
      </Button>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <TransactionSheet open={quickAdd} onOpenChange={setQuickAdd} />
    </div>
  );
}
