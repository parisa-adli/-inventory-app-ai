import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { setOnSessionEnded } from '@/lib/axios';
import { authKeys } from '@/features/auth/hooks/useAuth';
import Providers from './providers';
import { queryClient } from './queryClient';
import { router } from './router';

/**
 * The route guards are middleware, so they only run on navigation. When the signed-in user changes
 * without one (sign in, sign out, a gate cleared, the session ending mid-use), re-run them.
 */
function useRevalidateOnAuthChange() {
  useEffect(() => {
    setOnSessionEnded(() => queryClient.setQueryData(authKeys.me, null));

    let lastUser = queryClient.getQueryData(authKeys.me);
    return queryClient.getQueryCache().subscribe(({ type, query }) => {
      if (type !== 'updated' || query.queryHash !== JSON.stringify(authKeys.me)) return;
      const user = query.state.data;
      // Structural sharing keeps the reference when a refetch returns the same user
      if (user === lastUser) return;
      lastUser = user;
      void router.revalidate();
    });
  }, []);
}

export default function App() {
  useRevalidateOnAuthChange();
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
