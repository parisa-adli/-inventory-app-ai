/** "Oct 16, 2026" in the browser's locale. */
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

export const productCountLabel = (count: number) => (count === 1 ? '1 product' : `${count} products`);
