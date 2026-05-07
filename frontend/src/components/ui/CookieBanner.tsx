import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

const STORAGE_KEY = 'daliyaflow_cookie_consent';

type Consent = 'accepted' | 'declined';

function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'accepted' || v === 'declined') return v;
    return null;
  } catch {
    return null;
  }
}

function writeConsent(value: Consent) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore — banner just won't persist if storage is locked */
  }
}

export function CookieBanner() {
  // `null` = unknown (still reading on mount), `false` = already chosen and
  // hidden, `true` = first visit, render the banner.
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    setShow(readConsent() === null);
  }, []);

  if (show !== true) return null;

  function dismiss(value: Consent) {
    writeConsent(value);
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.06)] cookie-banner-slide-up"
      // Keep above mobile bottom nav (z-30) but below modals (z-50).
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <style>{`
        @keyframes cookie-banner-slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .cookie-banner-slide-up {
          animation: cookie-banner-slide-up 250ms ease-out both;
        }
      `}</style>
      <div className="mx-auto max-w-5xl px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <p className="text-sm text-slate flex-1">
          DaliyaFlow uses essential cookies to keep you signed in and remember
          your preferences. By continuing to use DaliyaFlow you agree to our
          use of cookies.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:shrink-0">
          <Button size="sm" onClick={() => dismiss('accepted')}>
            Accept
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dismiss('declined')}
          >
            Decline
          </Button>
        </div>
      </div>
    </div>
  );
}
