import { apiClient } from './client';

export interface SessionRead {
  id: string;
  device_info: { user_agent?: string } & Record<string, unknown>;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export interface AgencyRead {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  plan: string;
}

export const usersApi = {
  updateMe: async (payload: {
    first_name?: string;
    last_name?: string;
  }): Promise<unknown> => {
    const { data } = await apiClient.patch('/users/me', payload);
    return data;
  },

  getMyAgency: async (): Promise<AgencyRead> => {
    const { data } = await apiClient.get<AgencyRead>('/agencies/me');
    return data;
  },

  updateAgency: async (
    agencyId: string,
    payload: { name?: string; timezone?: string },
  ): Promise<AgencyRead> => {
    const { data } = await apiClient.patch<AgencyRead>(
      `/agencies/${agencyId}`,
      payload,
    );
    return data;
  },

  listSessions: async (): Promise<SessionRead[]> => {
    const { data } = await apiClient.get<SessionRead[]>('/auth/sessions');
    return data;
  },

  revokeSession: async (id: string): Promise<void> => {
    await apiClient.delete(`/auth/sessions/${id}`);
  },

  revokeAllSessions: async (): Promise<void> => {
    await apiClient.delete('/auth/sessions/all');
  },
};

export const waitlistApi = {
  submit: async (payload: {
    name: string;
    agency_name: string;
    email: string;
    challenge_description?: string;
  }): Promise<{ message: string }> => {
    const { data } = await apiClient.post<{ message: string }>(
      '/waitlist',
      payload,
    );
    return data;
  },
};

// ---------- Invitations / team management ----------

export type InvitableRole = 'caregiver' | 'coordinator' | 'supervisor';

export interface UserSummary {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  last_login_at: string | null;
  is_invitation: boolean;
  invitation_expires_at: string | null;
}

export interface InvitationLookup {
  valid: boolean;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  role?: string;
  reason?: 'expired' | 'already_accepted' | 'not_found';
}

export interface InviteAcceptResponse {
  access_token: string;
  refresh_token: string;
  user: UserSummary;
}

export const invitationsApi = {
  invite: async (payload: {
    email: string;
    first_name: string;
    last_name: string;
    role: InvitableRole;
  }): Promise<{ invitation_id: string; expires_at: string }> => {
    const { data } = await apiClient.post('/users/invite', payload);
    return data;
  },

  lookup: async (token: string): Promise<InvitationLookup> => {
    const { data } = await apiClient.get<InvitationLookup>(
      `/users/invite/${token}`,
    );
    return data;
  },

  accept: async (
    token: string,
    payload: {
      password?: string;
      first_name?: string;
      last_name?: string;
    },
  ): Promise<InviteAcceptResponse> => {
    const { data } = await apiClient.post<InviteAcceptResponse>(
      `/users/invite/${token}/accept`,
      payload,
    );
    return data;
  },

  list: async (): Promise<UserSummary[]> => {
    const { data } = await apiClient.get<UserSummary[]>('/users');
    return data;
  },

  deactivate: async (userId: string): Promise<void> => {
    await apiClient.delete(`/users/${userId}`);
  },

  updateRole: async (userId: string, role: string): Promise<UserSummary> => {
    const { data } = await apiClient.patch<UserSummary>(
      `/users/${userId}/role`,
      { role },
    );
    return data;
  },

  resend: async (invitationId: string): Promise<void> => {
    await apiClient.post(`/users/invite/${invitationId}/resend`);
  },

  cancel: async (invitationId: string): Promise<void> => {
    await apiClient.delete(`/users/invite/${invitationId}`);
  },
};
