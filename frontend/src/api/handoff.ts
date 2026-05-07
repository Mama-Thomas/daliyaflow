import { apiClient } from './client';

export interface SuggestedFlag {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  extracted_reason: string;
  status: 'suggested' | 'confirmed' | 'dismissed' | 'escalated' | 'resolved';
  shift_id: string;
  created_at?: string;
  caregiver_first_name?: string | null;
  client_preferred_name?: string | null;
  client_last_initial?: string | null;
  is_own_note?: boolean | null;
}

export interface HandoffSummaryPayload {
  summary_overview: string;
  notable_changes?: string;
  tasks_completed?: string[];
  tasks_pending?: string[];
  follow_up_items?: string[];
  supervisor_attention_needed?: boolean;
  supervisor_attention_reason?: string;
}

export interface HandoffStatus {
  status: 'pending' | 'processing' | 'complete' | 'failed';
  handoff_id: string | null;
  handoff_summary: HandoffSummaryPayload | null;
  suggested_flags: SuggestedFlag[];
  message?: string;
}

export interface NoteSubmitResponse {
  note_id: string;
  shift_id: string;
  status: 'processing';
  message: string;
}

export interface TranslateResult {
  original_text: string;
  detected_language: string;
  language_name: string;
  translated_text: string;
  confidence: number;
}

export interface NoteLanguageMeta {
  original_language?: string | null;
  language_name?: string | null;
  original_text?: string | null;
  translated_text?: string | null;
}

export const handoffApi = {
  submitText: async (
    shiftId: string,
    rawText: string,
    language?: NoteLanguageMeta,
  ): Promise<NoteSubmitResponse> => {
    const { data } = await apiClient.post<NoteSubmitResponse>(
      `/shifts/${shiftId}/notes`,
      {
        input_type: 'text',
        raw_text: rawText,
        original_language: language?.original_language ?? undefined,
        language_name: language?.language_name ?? undefined,
        original_text: language?.original_text ?? undefined,
        translated_text: language?.translated_text ?? undefined,
      },
    );
    return data;
  },

  submitVoice: async (
    shiftId: string,
    audio: Blob,
    transcript: string,
    language?: NoteLanguageMeta,
  ): Promise<NoteSubmitResponse> => {
    const fd = new FormData();
    fd.append('audio', audio, 'shift-note.webm');
    if (transcript) fd.append('raw_text', transcript);
    if (language?.original_language) {
      fd.append('original_language', language.original_language);
    }
    if (language?.language_name) fd.append('language_name', language.language_name);
    if (language?.original_text) fd.append('original_text', language.original_text);
    if (language?.translated_text) {
      fd.append('translated_text', language.translated_text);
    }
    // NOTE: do not set Content-Type manually — axios + FormData need to
    // generate the multipart boundary themselves, and any custom header
    // also wipes the request-interceptor-added Authorization on some
    // axios versions. We let axios infer Content-Type and rely on the
    // interceptor to add Bearer.
    const { data } = await apiClient.post<NoteSubmitResponse>(
      `/shifts/${shiftId}/notes/audio`,
      fd,
    );
    return data;
  },

  translate: async (
    shiftId: string,
    text: string,
    sourceLanguage?: string,
  ): Promise<TranslateResult> => {
    const { data } = await apiClient.post<TranslateResult>(
      `/shifts/${shiftId}/notes/translate`,
      { text, source_language: sourceLanguage ?? undefined },
    );
    return data;
  },

  transcribeVoice: async (
    shiftId: string,
    audio: Blob,
  ): Promise<{
    transcript: string;
    confidence: number;
    available: boolean;
    message: string | null;
  }> => {
    const fd = new FormData();
    fd.append('audio', audio, 'shift-note.webm');
    const { data } = await apiClient.post<{
      transcript: string;
      confidence: number;
      available: boolean;
      message: string | null;
    }>(`/shifts/${shiftId}/notes/transcribe`, fd);
    return data;
  },

  pollStatus: async (shiftId: string): Promise<HandoffStatus> => {
    const { data } = await apiClient.get<HandoffStatus>(
      `/shifts/${shiftId}/handoff/status`,
    );
    return data;
  },

  finalize: async (handoffId: string): Promise<HandoffStatus> => {
    const { data } = await apiClient.post<HandoffStatus>(
      `/handoffs/${handoffId}/finalize`,
    );
    return data;
  },

  sharedSubmissions: async (limit = 5): Promise<SharedSubmissionEntry[]> => {
    const { data } = await apiClient.get<SharedSubmissionEntry[]>(
      '/caregiver/shared-submissions',
      { params: { limit } },
    );
    return data;
  },
};

export interface SharedSubmissionEntry {
  handoff_id: string;
  shift_id: string;
  client_id: string;
  client_preferred_name: string | null;
  client_last_initial: string | null;
  caregiver_id: string;
  caregiver_first_name: string;
  is_own_submission: boolean;
  summary_overview: string;
  finalized_at: string | null;
  created_at: string;
}

export const flagsApi = {
  patch: async (
    flagId: string,
    body: {
      status?: 'confirmed' | 'dismissed' | 'escalated' | 'resolved';
      note?: string;
    },
  ): Promise<SuggestedFlag> => {
    const { data } = await apiClient.patch<SuggestedFlag>(
      `/flags/${flagId}`,
      body,
    );
    return data;
  },
  createManual: async (body: {
    shift_id: string;
    category: string;
    severity: 'low' | 'medium' | 'high';
    extracted_reason: string;
  }): Promise<SuggestedFlag> => {
    const { data } = await apiClient.post<SuggestedFlag>('/flags', body);
    return data;
  },
};
