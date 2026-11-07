export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
}

export interface CreateAccountInput {
  email: string;
  password: string;
  isAdmin?: boolean;
}
