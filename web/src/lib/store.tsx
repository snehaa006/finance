import * as React from "react";
import { api } from "./api";
import type { Account, Category } from "./types";

/**
 * Accounts and categories are small, change rarely, and are needed by nearly
 * every screen (and by the quick-add sheet), so they live in one context that
 * screens can invalidate after a mutation.
 */
interface AppData {
  accounts: Account[];
  categories: Category[];
  loading: boolean;
  /** Bumped whenever data changes, so pages can re-run their own fetches. */
  revision: number;
  refresh: () => Promise<void>;
}

const Ctx = React.createContext<AppData>({
  accounts: [],
  categories: [],
  loading: true,
  revision: 0,
  refresh: async () => {},
});

export const useAppData = () => React.useContext(Ctx);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [revision, setRevision] = React.useState(0);

  const refresh = React.useCallback(async () => {
    const [a, c] = await Promise.all([
      api.get<Account[]>("/accounts"),
      api.get<Category[]>("/categories"),
    ]);
    setAccounts(a);
    setCategories(c);
    setRevision((r) => r + 1);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, [refresh]);

  return (
    <Ctx.Provider value={{ accounts, categories, loading, revision, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
