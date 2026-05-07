import { ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageTransition } from '@/components/ui/PageTransition';
import { BottomNav } from './BottomNav';
import { CaregiverSidebar } from './CaregiverSidebar';

export function MobileLayout({ children }: { children?: ReactNode }) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-surface lg:flex">
      <CaregiverSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mx-auto w-full max-w-[480px] sm:max-w-2xl lg:max-w-none lg:mx-0 lg:px-6 min-h-screen bg-surface relative pb-24 lg:pb-8">
          <PageTransition key={location.pathname}>
            {children ?? <Outlet />}
          </PageTransition>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
