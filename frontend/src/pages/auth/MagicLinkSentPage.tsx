import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui';
import { authApi } from '@/api/auth';

const RESEND_SECONDS = 60;

export default function MagicLinkSentPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resentNote, setResentNote] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = window.setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [secondsLeft]);

  const resendMutation = useMutation({
    mutationFn: () => authApi.requestMagicLink(email),
    onSuccess: () => {
      setSecondsLeft(RESEND_SECONDS);
      setResentNote('We sent a fresh link. Check your inbox again.');
    },
    onError: () => {
      setResentNote('Could not resend the link. Please try again in a moment.');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-6">
      <div className="w-full max-w-md text-center animate-fade-in-up">
        <div className="size-16 rounded-full bg-forest-pale text-forest mx-auto flex items-center justify-center mb-6">
          <Mail size={28} className="animate-fade-in-up" />
        </div>

        <h1 className="font-display text-3xl text-ink mb-2">
          Check your email
        </h1>
        <p className="text-slate mb-1">
          We've sent a sign-in link to{' '}
          <span className="font-medium text-ink">{email || 'your inbox'}</span>.
        </p>
        <p className="text-sm text-muted-text">
          The link is valid for 15 minutes.
        </p>

        {resentNote && (
          <div className="mt-6 text-sm text-forest bg-forest-pale rounded-md px-3 py-2">
            {resentNote}
          </div>
        )}

        <div className="mt-10">
          <Button
            variant="secondary"
            size="md"
            disabled={secondsLeft > 0 || resendMutation.isPending || !email}
            loading={resendMutation.isPending}
            onClick={() => resendMutation.mutate()}
            fullWidth
          >
            {secondsLeft > 0
              ? `Resend in ${secondsLeft}s`
              : 'Resend sign-in link'}
          </Button>
          <Link
            to="/auth/sign-in"
            className="block text-sm text-slate mt-4 hover:text-forest"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
