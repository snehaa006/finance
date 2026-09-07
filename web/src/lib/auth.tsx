import * as React from "react";
import { api } from "./api";

interface AuthState {
  authenticated: boolean | null; // null while the session check is in flight
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = React.createContext<AuthState>({
  authenticated: null,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => React.useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    api
      .get<{ authenticated: boolean }>("/auth/session")
      .then((s) => setAuthenticated(s.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  const login = React.useCallback(async (password: string) => {
    await api.post("/auth/login", { password });
    setAuthenticated(true);
  }, []);

  const logout = React.useCallback(async () => {
    await api.post("/auth/logout");
    setAuthenticated(false);
  }, []);

  return <Ctx.Provider value={{ authenticated, login, logout }}>{children}</Ctx.Provider>;
}
