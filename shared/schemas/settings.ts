import { z } from 'zod';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../constants/stock-status';

export const LOW_STOCK_THRESHOLD_MIN = 1;
export const LOW_STOCK_THRESHOLD_MAX = 10_000;

/** What `GET /api/settings` answers before anyone has edited the settings (C25). */
export const DEFAULT_SETTINGS = { lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD, currency: 'USD' } as const;

const lowStockThreshold = z
  .number({ error: 'Threshold must be a number' })
  .int('Threshold must be a whole number')
  .min(LOW_STOCK_THRESHOLD_MIN, `Threshold must be at least ${LOW_STOCK_THRESHOLD_MIN}`)
  .max(LOW_STOCK_THRESHOLD_MAX, `Threshold must be at most ${LOW_STOCK_THRESHOLD_MAX.toLocaleString('en-US')}`);

/** Any 3-letter code in capitals (C25); the client only offers `Intl.supportedValuesOf('currency')`. */
const currency = z
  .string({ error: 'Currency is required' })
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code in capitals, e.g. EUR');

/** Body of PATCH /api/settings: absent = unchanged; unknown keys are refused. */
export const updateSettingsSchema = z
  .strictObject({
    lowStockThreshold: lowStockThreshold.optional(),
    currency: currency.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Send at least one field to change',
  });

/** The Settings page. The threshold is typed as text: plain digits, then the same rules as the API. */
export const settingsFormSchema = z.object({
  lowStockThreshold: z
    .string()
    .trim()
    .min(1, { error: 'Threshold is required', abort: true })
    .regex(/^\d+$/, 'Threshold must be a whole number')
    .transform(Number)
    .pipe(lowStockThreshold),
  currency,
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.infer<typeof settingsFormSchema>;
