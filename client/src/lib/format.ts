/** "Oct 16, 2026" in the browser's locale. */
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
