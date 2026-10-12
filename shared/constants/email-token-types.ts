/** The kinds of single-use emailed link; also the "which mail failed" marker on a user. */
export const EMAIL_TOKEN_TYPES = ['verify-email', 'reset-password', 'link-telegram'] as const;

export type EmailTokenType = typeof EMAIL_TOKEN_TYPES[number];
