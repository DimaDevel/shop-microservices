export interface ProfileResult {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  dateOfBirth?: Date | null;
  addressLine?: string | null;
  city?: string | null;
  country?: string | null;
  postalCode?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
