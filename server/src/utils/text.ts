/** Escapes user input so it matches literally inside a RegExp (search boxes). */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The uniqueness key of a category title or supplier name: trimmed, inner whitespace collapsed,
 * lowercased. '  Snack   Food ' and 'snack food' share one key.
 */
export const normalizeKey = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();
