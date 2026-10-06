import { isAxiosError } from 'axios';

export interface ApiError {
  code: string;
  message: string;
}

/** Reads the server's `{ error: { code, message } }` shape, with a safe fallback for network errors. */
export const getApiError = (err: unknown): ApiError => {
  if (isAxiosError(err)) {
    const body = err.response?.data?.error;
    if (body?.code && body?.message) return { code: body.code, message: body.message };
  }
  return { code: 'UNKNOWN', message: 'Something went wrong. Please try again.' };
};
