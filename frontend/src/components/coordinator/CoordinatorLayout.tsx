import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { PageTransition } from '@/components/ui/PageTransition';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNavDrawer } from './MobileNavDrawer';

export function CoordinatorLayout() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex bg-surface">
      <Sidebar />
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onOpenNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 px-4 sm:px-6 py-6">
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
