import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiError } from '@/lib/apiError';
import * as authApi from '../api/authApi';
import { authKeys } from './useAuth';

export type TelegramQrPhase =
  /** Creating the QR code. */
  | 'starting'
  /** QR code shown, waiting for Start in the bot. */
  | 'waiting'
  /** The chat that pressed Start has no linked account. */
  | 'unlinked'
  | 'expired'
  | 'error';

/** Seconds left until an ISO timestamp, ticking once a second. */
const useSecondsUntil = (iso: string | undefined): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!iso) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [iso]);

  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;
};

const POLL_INTERVAL_MS = 2000;

/**
 * Drives the "scan the QR code, press Start in the bot" login: creates an attempt on mount,
 * polls until the bot approved it, then puts the user into the auth cache so the route guards
 * redirect exactly like a password login.
 */
export const useTelegramQrLogin = () => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<authApi.TelegramLoginSession | null>(null);

  const start = useMutation({
    mutationFn: authApi.startTelegramLogin,
    onSuccess: setSession,
    onError: (err) => toast.error(getApiError(err).message),
  });

  // StrictMode runs effects twice in dev; a second attempt would just be an unused QR code
  const started = useRef(false);
  const { mutate: begin } = start;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  const poll = useQuery({
    queryKey: ['auth', 'telegram-login', session?.pollToken],
    queryFn: () => authApi.pollTelegramLogin(session!.pollToken),
    enabled: !!session,
    // Stop on any terminal answer; pending keeps polling
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return !status || status === 'pending' ? POLL_INTERVAL_MS : false;
    },
    retry: false,
    gcTime: 0,
  });

  const secondsLeft = useSecondsUntil(session?.expiresAt);

  const approvedUser = poll.data?.status === 'approved' ? poll.data.user : null;
  useEffect(() => {
    if (!approvedUser) return;
    queryClient.setQueryData(authKeys.me, approvedUser);
    toast.success(`Welcome back, ${approvedUser.name}`);
  }, [approvedUser, queryClient]);

  const failure = poll.isError ? poll.error : null;
  useEffect(() => {
    if (failure) toast.error(getApiError(failure).message);
  }, [failure]);

  const restart = useCallback(() => {
    setSession(null);
    begin();
  }, [begin]);

  let phase: TelegramQrPhase;
  if (start.isError || poll.isError) phase = 'error';
  else if (!session) phase = 'starting';
  else if (poll.data?.status === 'unlinked') phase = 'unlinked';
  else if (poll.data?.status === 'expired' || secondsLeft === 0) phase = 'expired';
  else phase = 'waiting';

  return { phase, deepLink: session?.deepLink, secondsLeft, restart };
};
