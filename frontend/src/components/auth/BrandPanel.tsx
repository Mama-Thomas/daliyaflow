import { Leaf } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BrandPanel() {
  return (
    <div
      className="relative flex flex-col justify-between p-10 lg:p-14 text-white overflow-hidden h-full"
      style={{
        background:
          'linear-gradient(135deg, var(--color-forest) 0%, var(--color-forest-light) 70%, var(--color-forest-glow) 100%)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.6) 0, transparent 35%), radial-gradient(circle at 75% 80%, rgba(255,255,255,0.5) 0, transparent 30%)',
        }}
      />
      <div className="relative">
        <Link
          to="/"
          className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-md"
          aria-label="DaliyaFlow home"
        >
          <div className="size-10 rounded-md bg-white/15 backdrop-blur-sm flex items-center justify-center">
            <Leaf size={20} aria-hidden />
          </div>
          <div className="font-display text-2xl tracking-tight">DaliyaFlow</div>
        </Link>
      </div>
      <div className="relative max-w-md">
        <p className="font-display italic text-2xl lg:text-3xl leading-snug font-light">
          Less missed information.
          <br />
          Safer handoffs.
          <br />
          Faster coordinator response.
        </p>
        <p className="mt-6 text-sm text-white/70">
          AI handoffs and care continuity for senior care teams.
        </p>
      </div>
      <div className="relative text-xs text-white/50">
        © {new Date().getFullYear()} DaliyaFlow
      </div>
    </div>
  );
}
