import { useAuth } from './useAuth';

export function useAdmin(): { isAdmin: boolean } {
  const { user } = useAuth();
  return {
    isAdmin: user?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL,
  };
}
