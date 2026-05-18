export interface ProfileResult {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
