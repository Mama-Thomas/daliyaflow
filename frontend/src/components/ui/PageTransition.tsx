import { ReactNode } from 'react';

/**
 * Page-level fade-in. Uses the CSS `animate-fade-in-up` keyframe (defined in
 * tailwind.config.js) instead of framer-motion. CSS animations don't depend on
 * JS scheduling, so the page can never get stuck at opacity:0 if the animation
 * is interrupted (e.g. by a Suspense boundary remount mid-transition).
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div className="animate-fade-in-up">{children}</div>;
}
