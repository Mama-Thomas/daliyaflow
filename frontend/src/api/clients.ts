import { apiClient } from './client';

export interface Client {
  id: string;
  agency_id: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  care_context_summary: string | null;
  address_neighborhood: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CareCardPayload {
  welcome_line: string;
  key_things_to_know: string[];
  watch_for: string[];
  pending_tasks: string[];
  coordinator_note: string;
}

export const clientsApi = {
  list: async (): Promise<Client[]> => {
    const { data } = await apiClient.get<Client[]>('/clients');
    return data;
  },
  get: async (clientId: string): Promise<Client> => {
    const { data } = await apiClient.get<Client>(`/clients/${clientId}`);
    return data;
  },
  handoffHistory: async (
    clientId: string,
    limit = 25,
    offset = 0,
  ): Promise<
    Array<{
      handoff_id: string;
      shift_id: string;
      scheduled_start: string;
      scheduled_end: string;
      caregiver: { id: string; first_name: string; last_initial: string };
      summary: Record<string, unknown>;
      finalized_at: string | null;
      caregiver_accepted: boolean;
      created_at: string;
    }>
  > => {
    const { data } = await apiClient.get<
      Array<{
        handoff_id: string;
        shift_id: string;
        scheduled_start: string;
        scheduled_end: string;
        caregiver: { id: string; first_name: string; last_initial: string };
        summary: Record<string, unknown>;
        finalized_at: string | null;
        caregiver_accepted: boolean;
        created_at: string;
      }>
    >(`/clients/${clientId}/handoff-history`, {
      params: { limit, offset },
    });
    return data;
  },
  carecard: async (
    clientId: string,
  ): Promise<{
    client_id: string;
    generated_at: string;
    card: CareCardPayload;
  }> => {
    const { data } = await apiClient.get<{
      client_id: string;
      generated_at: string;
      card: CareCardPayload;
    }>(`/clients/${clientId}/continuity-briefing`);
    return data;
  },
  shiftBrief: async (
    clientId: string,
  ): Promise<{
    client_id: string;
    entries: Array<{
      handoff_id: string;
      caregiver_first_name: string;
      caregiver_last_initial: string;
      shift_date: string;
      summary_overview: string;
      notable_changes: string;
      risk_flags: Array<{ category: string; severity: string }>;
    }>;
  }> => {
    const { data } = await apiClient.get<{
      client_id: string;
      entries: Array<{
        handoff_id: string;
        caregiver_first_name: string;
        caregiver_last_initial: string;
        shift_date: string;
        summary_overview: string;
        notable_changes: string;
        risk_flags: Array<{ category: string; severity: string }>;
      }>;
    }>(`/clients/${clientId}/shift-brief`);
    return data;
  },
  timeline: async (
    clientId: string,
    days: number = 30,
  ): Promise<{
    client_id: string;
    days: number;
    entries: Array<TimelineEntry>;
  }> => {
    const { data } = await apiClient.get(
      `/clients/${clientId}/timeline`,
      { params: { days } },
    );
    return data;
  },
  familySummary: async (
    clientId: string,
  ): Promise<{
    summary_text: string;
    generated_at: string;
    week_start: string;
    week_end: string;
  }> => {
    const { data } = await apiClient.get(
      `/clients/${clientId}/family-summary`,
    );
    return data;
  },
};

export interface TimelineEntry {
  date: string;
  type: 'shift' | 'flag' | 'continuity_event' | 'coordinator_action';
  caregiver_name: string | null;
  caregiver_id?: string;
  summary: string;
  severity: 'low' | 'medium' | 'high' | null;
  is_continuity_break: boolean;
  details_id: string;
  shift_id?: string;
  category?: string;
  status?: string;
  metadata?: { pattern?: string; pattern_count?: number; window_days?: number };
  action_type?: string;
}
