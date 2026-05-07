import { apiClient } from './client';

export interface DashboardSummary {
  submissions_today: number;
  open_flags_by_severity: { high: number; medium: number; low: number };
  shifts_at_risk: number;
  avg_review_time_minutes: number | null;
  recent_actions: Array<{
    id: string;
    action_type: string;
    related_object_type: string;
    related_object_id: string;
    note: string | null;
    created_at: string;
  }>;
}

export type PriorityItem =
  | {
      type: 'flag';
      id: string;
      category: string;
      severity: 'high' | 'medium' | 'low';
      extracted_reason: string;
      shift_id: string;
      client_id: string;
      created_at: string;
    }
  | {
      type: 'shift_at_risk';
      id: string;
      scheduled_start: string;
      scheduled_end: string;
      client_id: string;
      caregiver_id: string;
      call_out_reason: string | null;
      created_at: string;
    };

export interface ShiftBriefFlag {
  category: string;
  severity: 'high' | 'medium' | 'low';
  extracted_reason: string;
}

export interface ShiftBriefClient {
  client_id: string;
  client_name: string;
  shift_count_today: number;
  caregivers_today: string[];
  new_flags: ShiftBriefFlag[];
  highest_severity: 'high' | 'medium' | 'low';
  last_handoff_at: string | null;
  continuity_break: boolean;
  supervisor_attention_needed: boolean;
}

export interface RawNote {
  id: string;
  shift_id: string;
  input_type: 'text' | 'voice';
  raw_text: string;
  transcript_confidence: number | null;
  created_at: string;
}

export const dashboardApi = {
  summary: async (): Promise<DashboardSummary> => {
    const { data } = await apiClient.get<DashboardSummary>(
      '/dashboard/summary',
    );
    return data;
  },
  priorityQueue: async (): Promise<{ items: PriorityItem[] }> => {
    const { data } = await apiClient.get<{ items: PriorityItem[] }>(
      '/dashboard/priority-queue',
    );
    return data;
  },
  shiftBrief: async (): Promise<{ clients: ShiftBriefClient[] }> => {
    const { data } = await apiClient.get<{ clients: ShiftBriefClient[] }>(
      '/dashboard/shift-brief',
    );
    return data;
  },
  rawNote: async (shiftId: string): Promise<RawNote> => {
    const { data } = await apiClient.get<RawNote>(
      `/shifts/${shiftId}/notes/raw`,
    );
    return data;
  },
};
