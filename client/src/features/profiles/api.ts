import { fetchJsonApi, API_BASE } from "../../api/base";

export interface UserProfileData {
  bio?: string | null;
  favoriteTeam?: string | null;
  experienceLevel?: string | null;
  preferredFormats?: string[];
  paymentHandles?: {
    venmo?: string;
    paypal?: string;
    zelle?: string;
    cashapp?: string;
  } | null;
  timezone?: string | null;
  isPublic?: boolean;
}

export interface ProfileUser {
  id: number;
  name: string | null;
  email?: string;
  avatarUrl: string | null;
  venmoHandle?: string | null;
  zelleHandle?: string | null;
  paypalHandle?: string | null;
}

export interface LeagueHistoryEntry {
  leagueId: number;
  leagueName: string;
  season: number;
  sport: string;
  role: string;
}

export interface ProfileResponse {
  user: ProfileUser;
  profile: UserProfileData | null;
  leagueHistory: LeagueHistoryEntry[];
}

export async function getMyProfile(): Promise<ProfileResponse> {
  return fetchJsonApi<ProfileResponse>(`${API_BASE}/profiles/me`);
}

export async function updateMyProfile(data: UserProfileData): Promise<{ profile: UserProfileData }> {
  return fetchJsonApi(`${API_BASE}/profiles/me`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getPublicProfile(userId: number): Promise<ProfileResponse> {
  return fetchJsonApi<ProfileResponse>(`${API_BASE}/profiles/${userId}`);
}
