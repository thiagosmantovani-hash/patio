import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'gerente' | 'vendedor';
}

export interface Company {
  id: number;
  slug: string;
  name: string;
  trial_ends_at: string | null;
  created_at: string;
}

interface Session {
  user: User;
  company: Company;
  platform: boolean;
}

export interface SignupData {
  company_name: string;
  document?: string;
  city?: string;
  phone?: string;
  name: string;
  email: string;
  password: string;
  accept_terms: boolean;
}

interface AuthState {
  user: User | null;
  company: Company | null;
  /** Dono da plataforma (vê o painel com todas as empresas). */
  platform: boolean;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: SignupData) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...roles: User['role'][]) => boolean;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = () =>
    api
      .get<Session>('/auth/me')
      .then(setSession)
      .catch(() => setSession(null));

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    refresh().finally(() => setReady(true));
  }, []);

  const user = session?.user ?? null;
  const value: AuthState = {
    user,
    company: session?.company ?? null,
    platform: Boolean(session?.platform),
    ready,
    login: async (email, password) => setSession(await api.post<Session>('/auth/login', { email, password })),
    signup: async (data) => setSession(await api.post<Session>('/auth/signup', data)),
    logout: async () => {
      await api.post('/auth/logout').catch(() => {});
      setSession(null);
    },
    refresh,
    can: (...roles) => Boolean(user && roles.includes(user.role)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
