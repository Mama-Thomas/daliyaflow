export type UserRole = 'caregiver' | 'coordinator' | 'supervisor' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface User {
  id: string;
  agency_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  last_login_at: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface ApiErrorResponse {
  error: ApiError;
  meta: { request_id?: string };
}

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskStatus = 'suggested' | 'confirmed' | 'dismissed' | 'escalated' | 'resolved';
