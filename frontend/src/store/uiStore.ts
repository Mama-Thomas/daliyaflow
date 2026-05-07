import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationItem {
  id: string;
  type: 'flag' | 'shift' | 'system';
  title: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface ToastItem {
  id: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface NotificationPreferences {
  high_severity_alerts: boolean;
  shift_at_risk_alerts: boolean;
  escalation_alerts: boolean;
  morning_digest: boolean;
}

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebar: (collapsed: boolean) => void;

  notifications: NotificationItem[];
  addNotification: (n: Omit<NotificationItem, 'id' | 'read' | 'created_at'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearNotifications: () => void;

  notificationPrefs: NotificationPreferences;
  setNotificationPref: (key: keyof NotificationPreferences, value: boolean) => void;

  toasts: ToastItem[];
  pushToast: (t: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebar: (collapsed) => set({ sidebarCollapsed: collapsed }),

      notifications: [],
      addNotification: (n) =>
        set((s) => ({
          notifications: [
            {
              id: crypto.randomUUID(),
              read: false,
              created_at: new Date().toISOString(),
              ...n,
            },
            ...s.notifications,
          ].slice(0, 50),
        })),
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      clearNotifications: () => set({ notifications: [] }),

      notificationPrefs: {
        high_severity_alerts: true,
        shift_at_risk_alerts: true,
        escalation_alerts: true,
        morning_digest: true,
      },
      setNotificationPref: (key, value) =>
        set((s) => ({
          notificationPrefs: { ...s.notificationPrefs, [key]: value },
        })),

      toasts: [],
      pushToast: (t) =>
        set((s) => ({
          toasts: [{ id: crypto.randomUUID(), ...t }, ...s.toasts].slice(0, 5),
        })),
      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'daliyaflow-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        notifications: s.notifications,
        notificationPrefs: s.notificationPrefs,
      }),
    },
  ),
);
