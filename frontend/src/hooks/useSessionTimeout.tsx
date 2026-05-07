import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { authApi } from '@/api/auth';
import {
  SESSION_TIMEOUT_WARNING_MINUTES,
  sessionTimeoutMinutesFor,
  useAuthStore,
} from '@/store/authStore';

const CHECK_INTERVAL_MS = 60_000; // every 60 seconds per spec

export function SessionTimeoutGuard() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);
  const lastActivity = useAuthStore((s) => s.lastActivity);
  const clear = useAuthStore((s) => s.clear);
  const bumpActivity = useAuthStore((s) => s.bumpActivity);

  const [warningVisible, setWarningVisible] = useState(false);
  const [extending, setExtending] = useState(false);
  const intervalRef = useRef<number | null>(null);

  const timeoutMin = sessionTimeoutMinutesFor(role);
  const warnAtMs = (timeoutMin - SESSION_TIMEOUT_WARNING_MINUTES) * 60_000;
  const expireAtMs = timeoutMin * 60_000;

  const handleStaySignedIn = useCallback(async () => {
    setExtending(true);
    try {
      const tokens = await authApi.refresh();
      useAuthStore.getState().setTokens({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      bumpActivity();
      setWarningVisible(false);
    } catch {
      // Refresh failed — sign out.
      clear();
      navigate('/auth/sign-in?reason=timeout', { replace: true });
    } finally {
      setExtending(false);
    }
  }, [bumpActivity, clear, navigate]);

  useEffect(() => {
    if (!accessToken) {
      setWarningVisible(false);
      return;
    }

    const tick = () => {
      const idle = Date.now() - useAuthStore.getState().lastActivity;
      if (idle >= expireAtMs) {
        // Hard timeout — revoke + redirect.
        try {
          authApi
            .logout()
            .catch(() => undefined);
        } catch {
          /* swallow */
        }
        clear();
        setWarningVisible(false);
        navigate('/auth/sign-in?reason=timeout', { replace: true });
      } else if (idle >= warnAtMs) {
        setWarningVisible(true);
      }
    };

    intervalRef.current = window.setInterval(tick, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [accessToken, clear, expireAtMs, navigate, warnAtMs]);

  // Re-check when lastActivity updates so the warning hides on user action.
  useEffect(() => {
    if (!warningVisible) return;
    const idle = Date.now() - lastActivity;
    if (idle < warnAtMs) {
      setWarningVisible(false);
    }
  }, [lastActivity, warnAtMs, warningVisible]);

  if (!warningVisible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.55)] px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
    >
      <div
        className="w-full max-w-sm rounded-xl bg-[var(--color-surface)] p-6 shadow-xl"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <h2
          id="session-warning-title"
          className="text-lg font-semibold"
          style={{ color: 'var(--color-text)' }}
        >
          Are you still there?
        </h2>
        <p
          className="mt-2 text-sm"
          style={{ color: 'var(--color-muted-text)' }}
        >
          Your session will expire in {SESSION_TIMEOUT_WARNING_MINUTES} minutes
          due to inactivity.
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="primary"
            onClick={handleStaySignedIn}
            disabled={extending}
            className="flex-1"
          >
            {extending ? 'Extending…' : 'Stay signed in'}
          </Button>
        </div>
      </div>
    </div>
  );
}
