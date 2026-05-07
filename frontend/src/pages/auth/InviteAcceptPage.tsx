import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { BrandPanel } from '@/components/auth/BrandPanel';
import { invitationsApi } from '@/api/users';
import { getApiErrorMessage } from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/utils/cn';

export default function InviteAcceptPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const lookup = useQuery({
    queryKey: ['invitation-lookup', token],
    queryFn: () => invitationsApi.lookup(token),
    enabled: Boolean(token),
    retry: false,
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordId = useId();

  useEffect(() => {
    if (lookup.data?.valid) {
      setFirstName(lookup.data.first_name ?? '');
      setLastName(lookup.data.last_name ?? '');
    }
  }, [lookup.data]);

  const accept = useMutation({
    mutationFn: () =>
      invitationsApi.accept(token, {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        password: password.trim() ? password : undefined,
      }),
    onSuccess: (data) => {
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user as unknown as Parameters<
          typeof setSession
        >[0]['user'],
      });
      navigate(
        data.user.role === 'caregiver'
          ? '/caregiver/home'
          : '/coordinator/dashboard',
      );
    },
    onError: (err) => setError(getApiErrorMessage(err)),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    accept.mutate();
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-surface">
      <div className="hidden lg:block">
        <BrandPanel />
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] animate-fade-in-up">
          {lookup.isLoading && (
            <p className="text-sm text-slate">Checking your invitation…</p>
          )}

          {lookup.data && !lookup.data.valid && (
            <div>
              <h1 className="font-display text-3xl text-ink mb-2">
                Invitation unavailable
              </h1>
              <p className="text-sm text-slate mb-6">
                {lookup.data.reason === 'expired'
                  ? 'This invitation has expired.'
                  : lookup.data.reason === 'already_accepted'
                    ? 'This invitation has already been accepted.'
                    : 'This invitation could not be found.'}
              </p>
              <p className="text-sm text-muted-text">
                Contact your coordinator for a new invitation.
              </p>
            </div>
          )}

          {lookup.data?.valid && (
            <>
              <h1 className="font-display text-3xl text-ink mb-1">
                Welcome to {lookup.data.organization_name}
              </h1>
              <p className="text-sm text-slate mb-8">
                You've been invited to join as a{' '}
                <strong>{(lookup.data.role || '').replace('_', ' ')}</strong>.
              </p>

              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-5"
                noValidate
              >
                <Input
                  label="Email"
                  value={lookup.data.email ?? ''}
                  disabled
                  readOnly
                />
                <Input
                  label="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                />
                <Input
                  label="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                />

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor={passwordId}
                    className="text-sm font-medium text-slate"
                  >
                    Set a password{' '}
                    <span
                      className="font-normal"
                      style={{ color: 'var(--color-muted-text)' }}
                    >
                      (optional — you can also sign in with a magic link)
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id={passwordId}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      minLength={8}
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
                      aria-label={
                        showPassword ? 'Hide password' : 'Show password'
                      }
                      className="absolute inset-y-0 right-0 flex items-center px-3"
                      style={{ color: 'var(--color-muted-text)' }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="text-sm text-[var(--color-error)] bg-[var(--color-risk-high-pale)] border border-[var(--color-error-border)] rounded-md px-3 py-2"
                  >
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  fullWidth
                  loading={accept.isPending}
                >
                  Join DaliyaFlow
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
