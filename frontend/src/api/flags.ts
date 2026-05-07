import { apiClient } from './client';
import { SuggestedFlag } from './handoff';

export const flagsListApi = {
  list: async (params: {
    status?: string;
    severity?: string;
    client_id?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<SuggestedFlag[]> => {
    const { data } = await apiClient.get<SuggestedFlag[]>('/flags', { params });
    return data;
  },
  patchStatus: async (
    flagId: string,
    status: 'confirmed' | 'dismissed' | 'escalated' | 'resolved',
    note?: string,
  ): Promise<SuggestedFlag> => {
    const { data } = await apiClient.patch<SuggestedFlag>(`/flags/${flagId}`, {
      status,
      note,
    });
    return data;
  },
};
