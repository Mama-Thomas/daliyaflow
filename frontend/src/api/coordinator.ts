import { apiClient } from './client';

export interface CoordinatorAction {
  id: string;
  related_object_type: string;
  related_object_id: string;
  action_type: string;
  note: string | null;
  created_by: string;
  created_at: string;
}

export const coordinatorApi = {
  listActions: async (params: {
    related_type?: string;
    related_id?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<CoordinatorAction[]> => {
    const { data } = await apiClient.get<CoordinatorAction[]>(
      '/coordinator/actions',
      { params },
    );
    return data;
  },
  createAction: async (body: {
    related_object_type: string;
    related_object_id: string;
    action_type: string;
    note?: string;
  }): Promise<CoordinatorAction> => {
    const { data } = await apiClient.post<CoordinatorAction>(
      '/coordinator/actions',
      body,
    );
    return data;
  },
};

export const continuityApi = {
  list: async (params: {
    status?: string;
    severity?: string;
  } = {}): Promise<
    Array<{
      id: string;
      client_id: string;
      shift_id: string | null;
      category: string;
      description: string;
      severity: string;
      status: string;
      resolved_by: string | null;
      resolved_at: string | null;
      created_at: string;
    }>
  > => {
    const { data } = await apiClient.get('/continuity/events', { params });
    return data as Array<{
      id: string;
      client_id: string;
      shift_id: string | null;
      category: string;
      description: string;
      severity: string;
      status: string;
      resolved_by: string | null;
      resolved_at: string | null;
      created_at: string;
    }>;
  },
  patch: async (
    id: string,
    status: 'open' | 'in_progress' | 'resolved',
  ): Promise<unknown> => {
    const { data } = await apiClient.patch(`/continuity/events/${id}`, {
      status,
    });
    return data;
  },
};
