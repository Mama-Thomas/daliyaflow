import { apiClient } from './client';

export type ShiftStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'missed'
  | 'at_risk'
  | 'covered';

export interface Shift {
  id: string;
  agency_id: string;
  client_id: string;
  caregiver_id: string;
  scheduled_start: string;
  scheduled_end: string;
  actual_start: string | null;
  actual_end: string | null;
  status: ShiftStatus;
  replacement_caregiver_id: string | null;
  call_out_reason: string | null;
  notes: string | null;
  template_id: string | null;
  template_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftTemplate {
  id: string;
  agency_id: string;
  name: string;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  crosses_midnight: boolean;
  color: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export const shiftsApi = {
  list: async (params: {
    date?: string;
    status?: string;
    caregiver_id?: string;
    client_id?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<Shift[]> => {
    const { data } = await apiClient.get<Shift[]>('/shifts', { params });
    return data;
  },
  get: async (shiftId: string): Promise<Shift> => {
    const { data } = await apiClient.get<Shift>(`/shifts/${shiftId}`);
    return data;
  },
  patch: async (
    shiftId: string,
    body: Partial<{
      status: ShiftStatus;
      call_out_reason: string;
      replacement_caregiver_id: string;
    }>,
  ): Promise<Shift> => {
    const { data } = await apiClient.patch<Shift>(`/shifts/${shiftId}`, body);
    return data;
  },
  markAtRisk: async (shiftId: string, reason: string): Promise<Shift> => {
    const { data } = await apiClient.post<Shift>(
      `/shifts/${shiftId}/at-risk`,
      { reason },
    );
    return data;
  },
  create: async (payload: {
    client_id: string;
    caregiver_id: string;
    scheduled_start: string;
    scheduled_end: string;
    template_id?: string;
    notes?: string;
  }): Promise<Shift> => {
    const { data } = await apiClient.post<Shift>('/shifts', payload);
    return data;
  },
};

export const shiftTemplatesApi = {
  list: async (): Promise<ShiftTemplate[]> => {
    const { data } = await apiClient.get<ShiftTemplate[]>('/shift-templates');
    return data;
  },
  create: async (payload: {
    name: string;
    start_time: string;
    end_time: string;
    crosses_midnight: boolean;
    color: string;
    display_order: number;
  }): Promise<ShiftTemplate> => {
    const { data } = await apiClient.post<ShiftTemplate>(
      '/shift-templates',
      payload,
    );
    return data;
  },
  update: async (
    id: string,
    payload: Partial<{
      name: string;
      start_time: string;
      end_time: string;
      is_active: boolean;
      color: string;
      display_order: number;
    }>,
  ): Promise<ShiftTemplate> => {
    const { data } = await apiClient.patch<ShiftTemplate>(
      `/shift-templates/${id}`,
      payload,
    );
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/shift-templates/${id}`);
  },
};
