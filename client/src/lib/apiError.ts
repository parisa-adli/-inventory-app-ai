import { isAxiosError } from 'axios';

export interface ApiError {
  code: string;
  message: string;
  /** Seconds until a RATE_LIMITED call may be retried. */
  retryAfter?: number;
}

/** "45 seconds", "1 minute", "12 minutes". */
export const formatWait = (seconds: number): string => {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

/** Reads the server's `{ error: { code, message, details? } }` shape, with a safe fallback for network errors. */
export const getApiError = (err: unknown): ApiError => {
  if (isAxiosError(err)) {
    const body = err.response?.data?.error;
    if (body?.code && body?.message) {
      const retryAfter = Number(body.details?.retryAfter ?? err.response?.headers?.['retry-after']);
      if (body.code === 'RATE_LIMITED' && retryAfter > 0) {
        return {
          code: body.code,
          message: `Too many requests. Try again in ${formatWait(retryAfter)}.`,
          retryAfter,
        };
      }
      return { code: body.code, message: body.message };
    }
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
};
