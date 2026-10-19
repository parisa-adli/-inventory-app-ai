/** GET and PATCH /api/settings (C25): the one app-wide settings document. */
export interface Settings {
  /** Low stock = 1 to this many units; out = 0. */
  lowStockThreshold: number;
  /** ISO 4217 code every money value is shown in. Changing it relabels; nothing is converted. */
  currency: string;
  updatedAt: string;
  /** Who saved the settings last; `null` means the defaults were never edited. */
  updatedBy: { id: string; name: string } | null;
}
