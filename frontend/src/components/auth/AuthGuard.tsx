import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

export function AuthGuard({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const location = useLocation();
  if (!isAuthed) {
    // Sprint 8: redirect straight to the canonical sign-in path. The previous
    // `/auth/login` hop produced a brief flash of `/auth/login` in the URL
    // bar before the alias re-resolved to `/auth/sign-in`, which made it
    // look like the landing page was redirecting to a login form even when
    // the user expected to land on `/`.
    return (
      <Navigate
        to="/auth/sign-in"
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return <>{children}</>;
}

/** Public-route gate: signed-in users get bounced to their role home. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthenticated());
  const user = useAuthStore((s) => s.user);
  if (isAuthed && user) {
    if (user.role === 'caregiver') {
      return <Navigate to="/caregiver/home" replace />;
    }
    return <Navigate to="/coordinator/dashboard" replace />;
  }
  return <>{children}</>;
}

export function RoleGuard({
  allowed,
  children,
}: {
  allowed: Array<'caregiver' | 'coordinator' | 'supervisor' | 'admin'>;
  children: ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  if (!allowed.includes(user.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface px-6">
        <div className="text-center max-w-md animate-fade-in-up">
          <div className="font-display text-3xl text-forest mb-2">
            403 — not authorised
          </div>
          <p className="text-sm text-slate">
            Your role doesn't have access to this area. Try the section assigned
            to your role from the navigation.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function RoleHomeRedirect() {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Navigate to="/auth/sign-in" replace />;
  if (user.role === 'caregiver') return <Navigate to="/caregiver/home" replace />;
  return <Navigate to="/coordinator/dashboard" replace />;
}
