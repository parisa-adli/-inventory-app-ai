/** "Oct 16, 2026" in the browser's locale. */
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
/** "Oct 16, 2026, 5:38 PM" in the browser's locale and timezone. */
export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
