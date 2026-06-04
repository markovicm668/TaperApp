import { useAuth } from './useAuth';

export function useAdmin(): { isAdmin: boolean } {
  const { user } = useAuth();
  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  return {
    isAdmin: Boolean(user?.email) && user?.email === adminEmail,
  };
}
