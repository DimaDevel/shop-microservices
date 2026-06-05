export interface FindAllUsersInput {
  page: number;
  limit: number;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
  phone?: string;
  dateOfBirth?: string;
  addressLine?: string;
  city?: string;
  country?: string;
  postalCode?: string;
}
