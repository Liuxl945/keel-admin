export interface AppMember {
  id: number;
  nickname: string;
  avatar: string | null;
  phone: string | null;
  createdAt: string;
}

export interface AppLoginResult {
  accessToken: string;
  refreshToken: string;
  user: AppMember;
}
