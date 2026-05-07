import { useId, useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { BrandPanel } from '@/components/auth/BrandPanel';
import { authApi } from '@/api/auth';
import { getApiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';

export default function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordId = useId();
  const reason = searchParams.get('reason');
  const timeoutBanner = useMemo(
    () =>
      reason === 'timeout'
        ? 'You were signed out after 30 minutes of inactivity.'
        : null,
    [reason],
  );

  const loginMutation = useMutation({
    mutationFn: () => authApi.login(email.trim().toLowerCase(), password),
    onSuccess: (data) => {
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      });
      navigate(
        data.user.role === 'caregiver'
          ? '/caregiver/home'
          : '/coordinator/dashboard',
      );
    },
    onError: (err) => setFormError(getApiErrorMessage(err)),
  });

  const magicLinkMutation = useMutation({
    mutationFn: () => authApi.requestMagicLink(email.trim().toLowerCase()),
    onSuccess: () =>
      navigate(`/auth/magic-link-sent?email=${encodeURIComponent(email)}`),
    onError: (err) => setFormError(getApiErrorMessage(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError('Please enter your email and password.');
      return;
    }
    loginMutation.mutate();
  }

  function handleMagicLink() {
    setFormError(null);
    if (!email.trim()) {
      setFormError('Enter your email above to receive a sign-in link.');
      return;
    }
    magicLinkMutation.mutate();
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-surface">
      <div className="hidden lg:block">
        <BrandPanel />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] animate-fade-in-up">
          <h1 className="font-display text-3xl text-ink mb-8">Sign in to DaliyaFlow</h1>

          {timeoutBanner && (
            <div
              role="status"
              className="mb-6 text-sm rounded-md px-3 py-2"
              style={{
                background: 'var(--color-gold-light)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
              }}
            >
              {timeoutBanner}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organization.com"
              required
            />

            <div className="flex flex-col gap-2">
              <label
                htmlFor={passwordId}
                className="text-sm font-medium text-slate"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id={passwordId}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className={cn(
                    'w-full rounded-md border bg-white px-3 py-2 pr-10 text-base text-ink',
                    'placeholder:text-mist transition-shadow duration-150 ease-out',
                    'focus:outline-none border-border',
                    'focus:border-forest focus:shadow-[0_0_0_3px_rgba(27,77,62,0.12)]',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center px-3"
                  style={{ color: 'var(--color-muted-text)' }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = 'var(--color-primary)')
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = 'var(--color-muted-text)')
                  }
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {formError && (
              <div
                role="alert"
                className="text-sm text-[var(--color-error)] bg-[var(--color-risk-high-pale)] border border-[var(--color-error-border)] rounded-md px-3 py-2"
              >
                {formError}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              fullWidth
              loading={loginMutation.isPending}
            >
              Sign in
            </Button>

            <button
              type="button"
              onClick={handleMagicLink}
              disabled={magicLinkMutation.isPending}
              className="inline-flex items-center justify-center gap-2 text-sm text-forest font-medium hover:underline disabled:opacity-50"
            >
              <Mail size={14} />
              {magicLinkMutation.isPending
                ? 'Sending link...'
                : 'Sign in without password'}
            </button>
          </form>

          <p className="text-xs text-muted-text mt-10 text-center">
            By signing in you agree to DaliyaFlow's terms of use.
          </p>
        </div>
      </div>
    </div>
  );
}
