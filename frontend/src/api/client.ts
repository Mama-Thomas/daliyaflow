import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { useAuthStore } from '@/store/authStore';
import type { ApiErrorResponse, TokenPair } from '@/types';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Bump activity on every authenticated outbound call. The session-timeout
  // hook reads lastActivity to decide when to warn / sign the user out.
  const auth = useAuthStore.getState();
  if (auth.accessToken) {
    auth.bumpActivity();
  }
  const token = auth.accessToken;
  if (config.headers) {
    if (token) {
      // Use .set() so AxiosHeaders normalises the casing and won't be
      // wiped by a per-call `headers: {}` config.
      if (typeof (config.headers as { set?: unknown }).set === 'function') {
        (config.headers as { set: (k: string, v: string) => void }).set(
          'Authorization',
          `Bearer ${token}`,
        );
      } else {
        (config.headers as Record<string, string>).Authorization =
          `Bearer ${token}`;
      }
    }
    if (typeof (config.headers as { set?: unknown }).set === 'function') {
      (config.headers as { set: (k: string, v: string) => void }).set(
        'X-Request-ID',
        crypto.randomUUID(),
      );
    } else {
      (config.headers as Record<string, string>)['X-Request-ID'] =
        crypto.randomUUID();
    }
    // Strip any caller-provided Content-Type when the body is FormData —
    // axios needs to compute the multipart boundary itself, otherwise the
    // backend rejects the body and the request would surface as a misleading
    // 4xx in the console.
    if (
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData &&
      typeof (config.headers as { delete?: unknown }).delete === 'function'
    ) {
      (config.headers as { delete: (k: string) => void }).delete('Content-Type');
    }
  }
  return config;
});

let refreshInFlight: Promise<TokenPair> | null = null;

async function performRefresh(): Promise<TokenPair> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('no refresh token');
  const { data } = await axios.post<TokenPair>(`${API_URL}/auth/refresh`, {
    refresh_token: refreshToken,
  });
  useAuthStore.getState().setTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  });
  return data;
}

apiClient.interceptors.response.use(
  (resp: AxiosResponse) => resp,
  async (error: AxiosError<ApiErrorResponse>) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean;
    };

    // Only skip refresh-and-retry for the auth endpoints that participate in
    // the refresh handshake itself. Other /auth/* endpoints (sessions, me,
    // logout) still need the standard 401 → refresh → retry path.
    const url = original?.url ?? '';
    const isRefreshHandshakeUrl =
      url.includes('/auth/refresh') ||
      url.includes('/auth/login') ||
      url.includes('/auth/magic-link');

    if (
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      useAuthStore.getState().refreshToken &&
      !isRefreshHandshakeUrl
    ) {
      original._retried = true;
      try {
        refreshInFlight ||= performRefresh();
        const tokens = await refreshInFlight;
        refreshInFlight = null;
        if (original.headers) {
          original.headers.Authorization = `Bearer ${tokens.access_token}`;
        }
        return apiClient.request(original);
      } catch (refreshErr) {
        refreshInFlight = null;
        useAuthStore.getState().clear();
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError<ApiErrorResponse>(err)) {
    return (
      err.response?.data?.error?.message ||
      err.message ||
      'Something went wrong.'
    );
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
