import { apiClient } from './client';
import { useAuthStore } from '@/store/authStore';
import type { LoginResponse, TokenPair, User } from '@/types';

export const authApi = {
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', {
      email,
      password,
    });
    return data;
  },

  requestMagicLink: async (email: string): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>(
      '/auth/magic-link',
      { email },
    );
    return data;
  },

  verifyMagicLink: async (token: string): Promise<LoginResponse> => {
    const { data } = await apiClient.post<LoginResponse>(
      '/auth/magic-link/verify',
      { token },
    );
    return data;
  },

  refresh: async (): Promise<TokenPair> => {
    const refresh_token = useAuthStore.getState().refreshToken;
    if (!refresh_token) throw new Error('no refresh token');
    const { data } = await apiClient.post<TokenPair>('/auth/refresh', {
      refresh_token,
    });
    return data;
  },

  logout: async (refresh_token?: string): Promise<void> => {
    const token = refresh_token ?? useAuthStore.getState().refreshToken;
    if (!token) return;
    await apiClient.post('/auth/logout', { refresh_token: token });
  },

  me: async (): Promise<User> => {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },
};
