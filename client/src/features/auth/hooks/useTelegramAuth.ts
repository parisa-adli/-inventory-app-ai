import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiError } from '@/lib/apiError';
import * as authApi from '../api/authApi';
import { authKeys } from './useAuth';

export type TelegramAuthPhase =
  /** Creating the QR code. */
  | 'starting'
  /** QR code shown, waiting for Start in the bot. */
  | 'qr'
  /** The bot sent a code; the user types it here. */
  | 'otp'
  /** Code verified for a new Telegram account: username + email still needed. */
  | 'profile'
  /** The email already belongs to an account; the owner must confirm by link. */
  | 'linkSent'
  | 'expired'
  | 'locked'
  | 'error';

/** Seconds left until an ISO timestamp, ticking once a second. */
const useSecondsUntil = (iso: string | null | undefined): number => {
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
 * Drives Telegram sign in and sign up (one flow, the server decides which): QR code -> code from the bot ->
 * code on the website -> (new Telegram accounts only) username + email. Polling stops once the bot has sent
 * the code, on expiry and on unmount.
 */
export const useTelegramAuth = () => {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<authApi.TelegramAuthSession | null>(null);
  // Phases after the QR step; while null the phase is derived from the polled status
  const [stage, setStage] = useState<'profile' | 'linkSent' | 'expired' | 'locked' | null>(null);
  const [resent, setResent] = useState<authApi.TelegramResendResult | null>(null);
  const [prefill, setPrefill] = useState('');
  const [linkedEmail, setLinkedEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: authApi.startTelegramAuth,
    onSuccess: setSession,
    onError: (err) => toast.error(getApiError(err).message),
  });

  // StrictMode runs effects twice in dev; a second session would just be an unused QR code
  const started = useRef(false);
  const { mutate: begin } = start;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  const polling = !!session && stage === null;
  const status = useQuery({
    queryKey: ['auth', 'telegram-status', session?.expiresAt],
    queryFn: authApi.getTelegramStatus,
    enabled: polling,
    // Only the QR step polls: once the code was sent the status is final until the user acts
    refetchInterval: (query) => {
      const current = query.state.data?.status;
      return !current || current === 'PENDING' ? POLL_INTERVAL_MS : false;
    },
    retry: false,
    gcTime: 0,
  });

  const handleError = useCallback((err: unknown) => {
    const { code, message } = getApiError(err);
    if (code === 'SESSION_EXPIRED') setStage('expired');
    else if (code === 'TOO_MANY_ATTEMPTS') setStage('locked');
    else setError(message);
    toast.error(message);
  }, []);

  const signedIn = (user: Parameters<typeof queryClient.setQueryData>[1], name: string, message: string) => {
    // The route guards react to this and redirect, exactly like a password login
    queryClient.setQueryData(authKeys.me, user);
    toast.success(`${message}, ${name}`);
  };

  const verify = useMutation({
    mutationFn: authApi.verifyTelegramCode,
    onSuccess: (result) => {
      setError(null);
      if (result.status === 'COMPLETED') {
        signedIn(result.user, result.user.name, 'Welcome back');
        return;
      }
      setPrefill(result.prefillDisplayName ?? '');
      setStage('profile');
    },
    onError: handleError,
  });

  const resend = useMutation({
    mutationFn: authApi.resendTelegramCode,
    onSuccess: (result) => {
      setResent(result);
      setError(null);
      toast.success('A new code was sent to your Telegram.');
    },
    onError: handleError,
  });

  const complete = useMutation({
    mutationFn: authApi.completeTelegramSignup,
    onSuccess: (result, variables) => {
      if (result.outcome === 'created') {
        signedIn(result.user, result.user.name, 'Account created. Welcome');
        return;
      }
      if (result.outcome === 'link-sent') {
        setLinkedEmail(variables.email);
        setStage('linkSent');
        return;
      }
      setStage('expired');
    },
    onError: handleError,
  });

  const polled = status.data;
  const otpStep = stage === null && polled?.status === 'AWAITING_OTP';
  const otpExpiresAt = otpStep ? (resent?.otpExpiresAt ?? polled?.otpExpiresAt) : undefined;
  const resendAt = otpStep ? (resent ? resent.resendAvailableAt : polled?.resendAvailableAt) : undefined;

  const qrSeconds = useSecondsUntil(session?.expiresAt);
  const otpSeconds = useSecondsUntil(otpExpiresAt);
  const resendSeconds = useSecondsUntil(resendAt);

  let phase: TelegramAuthPhase;
  if (start.isError || status.isError) phase = 'error';
  else if (!session) phase = 'starting';
  else if (stage) phase = stage;
  else if (polled?.status === 'AWAITING_OTP') phase = 'otp';
  else if (polled?.status === 'LOCKED') phase = 'locked';
  else if (polled?.status === 'EXPIRED' || qrSeconds === 0) phase = 'expired';
  else phase = 'qr';

  const restart = useCallback(() => {
    setSession(null);
    setStage(null);
    setResent(null);
    setError(null);
    verify.reset();
    complete.reset();
    begin();
  }, [begin, verify, complete]);

  return {
    phase,
    deepLink: session?.deepLink,
    qrSeconds,
    otpSeconds,
    resendSeconds,
    /** True once no more codes may be requested (resendAvailableAt is null). */
    resendExhausted: otpStep && resendAt === null,
    error,
    clearError: () => setError(null),
    prefillName: prefill,
    linkedEmail,
    verify: verify.mutate,
    isVerifying: verify.isPending,
    resend: resend.mutate,
    isResending: resend.isPending,
    complete: complete.mutate,
    isCompleting: complete.isPending,
    restart,
  };
};
