import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'gerente' | 'vendedor';
}

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...roles: User['role'][]) => boolean;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api
      .get<{ user: User }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value: AuthState = {
    user,
    ready,
    login: async (email, password) => {
      const r = await api.post<{ user: User }>('/auth/login', { email, password });
      setUser(r.user);
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => {});
      setUser(null);
    },
    can: (...roles) => Boolean(user && roles.includes(user.role)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
