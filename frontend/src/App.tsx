import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import {
  AuthGuard,
  PublicOnlyRoute,
  RoleGuard,
  RoleHomeRedirect,
} from '@/components/auth/AuthGuard';
import { MobileLayout } from '@/components/caregiver/MobileLayout';
import { CoordinatorLayout } from '@/components/coordinator/CoordinatorLayout';
import { ToastViewport } from '@/components/ui/Toast';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { CookieBanner } from '@/components/ui/CookieBanner';
import { SessionTimeoutGuard } from '@/hooks/useSessionTimeout';

const SignInPage = lazy(() => import('@/pages/auth/SignInPage'));
const MagicLinkSentPage = lazy(() => import('@/pages/auth/MagicLinkSentPage'));
const InviteAcceptPage = lazy(() => import('@/pages/auth/InviteAcceptPage'));

const CaregiverHomePage = lazy(
  () => import('@/pages/caregiver/HomePage'),
);
const CaregiverShiftsPage = lazy(
  () => import('@/pages/caregiver/ShiftsPage'),
);
const ShiftDetailPage = lazy(
  () => import('@/pages/caregiver/ShiftDetailPage'),
);
const HandoffSubmissionPage = lazy(
  () => import('@/pages/caregiver/HandoffSubmissionPage'),
);
const HandoffViewPage = lazy(
  () => import('@/pages/caregiver/HandoffViewPage'),
);
const PriorHandoffsPage = lazy(
  () => import('@/pages/caregiver/PriorHandoffsPage'),
);
const CaregiverAlertsPage = lazy(
  () => import('@/pages/caregiver/AlertsPage'),
);
const CaregiverProfilePage = lazy(
  () => import('@/pages/caregiver/ProfilePage'),
);
const QuickActionsPage = lazy(
  () => import('@/pages/caregiver/QuickActionsPage'),
);

const DashboardPage = lazy(
  () => import('@/pages/coordinator/DashboardPage'),
);
const ClientsPage = lazy(() => import('@/pages/coordinator/ClientsPage'));
const ClientDetailPage = lazy(
  () => import('@/pages/coordinator/ClientDetailPage'),
);
const FlagsPage = lazy(() => import('@/pages/coordinator/FlagsPage'));
const CoordinatorShiftsPage = lazy(
  () => import('@/pages/coordinator/ShiftsPage'),
);
const ContinuityPage = lazy(
  () => import('@/pages/coordinator/ContinuityPage'),
);
const CoordinatorSettingsPage = lazy(
  () => import('@/pages/coordinator/SettingsPage'),
);
const LandingPage = lazy(() => import('@/pages/landing/LandingPage'));

function UnknownRouteFallback() {
  // Signed-in users get bounced to their role home; otherwise back to /.
  // RoleHomeRedirect handles both: it sends authed users to their home and
  // unauthed users to /auth/sign-in. We additionally check for /auth/login
  // alias above so this is just a safety net.
  return <RoleHomeRedirect />;
}

function PageFallback() {
  return (
    <div className="min-h-screen p-6 max-w-2xl mx-auto">
      <SkeletonCard />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastViewport />
        <CookieBanner />
        <SessionTimeoutGuard />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public landing — signed-in users get bounced to their role home. */}
            <Route
              path="/"
              element={
                <PublicOnlyRoute>
                  <LandingPage />
                </PublicOnlyRoute>
              }
            />

            {/* Auth */}
            <Route path="/auth/sign-in" element={<SignInPage />} />
            <Route
              path="/auth/login"
              element={<Navigate to="/auth/sign-in" replace />}
            />
            <Route
              path="/auth/magic-link-sent"
              element={<MagicLinkSentPage />}
            />
            <Route
              path="/auth/invite/:token"
              element={<InviteAcceptPage />}
            />
            <Route
              path="/sign-in"
              element={<Navigate to="/auth/sign-in" replace />}
            />
            <Route
              path="/magic-link-sent"
              element={<Navigate to="/auth/magic-link-sent" replace />}
            />

            {/* Caregiver */}
            <Route
              path="/caregiver"
              element={
                <AuthGuard>
                  <RoleGuard allowed={['caregiver', 'admin']}>
                    <MobileLayout />
                  </RoleGuard>
                </AuthGuard>
              }
            >
              <Route index element={<Navigate to="home" replace />} />
              <Route path="home" element={<CaregiverHomePage />} />
              <Route path="shifts" element={<CaregiverShiftsPage />} />
              <Route
                path="shifts/:shiftId"
                element={<ShiftDetailPage />}
              />
              <Route
                path="shifts/:shiftId/submit"
                element={<HandoffSubmissionPage />}
              />
              <Route
                path="shifts/:shiftId/handoff"
                element={<HandoffViewPage />}
              />
              <Route path="submit" element={<QuickActionsPage />} />
              <Route
                path="clients/:clientId/handoffs"
                element={<PriorHandoffsPage />}
              />
              <Route path="alerts" element={<CaregiverAlertsPage />} />
              <Route path="profile" element={<CaregiverProfilePage />} />
            </Route>

            {/* Coordinator */}
            <Route
              path="/coordinator"
              element={
                <AuthGuard>
                  <RoleGuard
                    allowed={['coordinator', 'supervisor', 'admin']}
                  >
                    <CoordinatorLayout />
                  </RoleGuard>
                </AuthGuard>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route
                path="clients/:clientId"
                element={<ClientDetailPage />}
              />
              <Route path="flags" element={<FlagsPage />} />
              <Route path="shifts" element={<CoordinatorShiftsPage />} />
              <Route path="continuity" element={<ContinuityPage />} />
              <Route path="settings" element={<CoordinatorSettingsPage />} />
            </Route>

            {/* Legacy redirects from previous sprints */}
            <Route
              path="/today"
              element={<Navigate to="/caregiver/home" replace />}
            />
            <Route
              path="/dashboard/*"
              element={<Navigate to="/coordinator/dashboard" replace />}
            />
            <Route
              path="/shifts/:shiftId/handoff"
              element={<Navigate to="/caregiver/home" replace />}
            />

            {/* Catch-all: signed-in users go to role home, others to landing. */}
            <Route path="*" element={<UnknownRouteFallback />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
