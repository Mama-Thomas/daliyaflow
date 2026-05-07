import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  lastActivity: number;
  setSession: (data: { accessToken: string; refreshToken: string; user: User }) => void;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
  bumpActivity: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      lastActivity: Date.now(),
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user, lastActivity: Date.now() }),
      setTokens: ({ accessToken, refreshToken }) =>
        set({ accessToken, refreshToken, lastActivity: Date.now() }),
      clear: () =>
        set({ accessToken: null, refreshToken: null, user: null, lastActivity: Date.now() }),
      isAuthenticated: () => Boolean(get().accessToken && get().user),
      bumpActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: 'daliyaflow-auth',
      // Tokens are stored in localStorage for now. In production we'd move
      // refresh tokens to httpOnly cookies once the backend issues them.
    },
  ),
);

// Roles → inactivity timeout (minutes). Caregivers are mid-shift workers and
// get a longer window before the modal appears.
export function sessionTimeoutMinutesFor(role: string | undefined): number {
  if (role === 'caregiver') return 60;
  return 30;
}

export const SESSION_TIMEOUT_WARNING_MINUTES = 5;
