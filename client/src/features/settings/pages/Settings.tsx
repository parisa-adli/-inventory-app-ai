import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  settingsFormSchema,
  type Settings as AppSettings,
  type SettingsFormInput,
  type SettingsFormValues,
} from '@inventory/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/lib/format';
import { useSettings } from '@/lib/settings';
import { CurrencyCombobox } from '../components/CurrencyCombobox';
import { currencyLabel } from '../currency';
import { useUpdateSettings } from '../hooks/useUpdateSettings';

const toFormValues = ({ lowStockThreshold, currency }: AppSettings): SettingsFormInput => ({
  lowStockThreshold: String(lowStockThreshold),
  currency,
});

/** "Low = 1–25 units" for what is typed, while it is a whole number. */
const thresholdHint = (typed: string) => (/^\d+$/.test(typed.trim()) && Number(typed) >= 1 ? `Low = 1–${Number(typed)} units` : 'Low = 1–n units');

function LastUpdated({ settings }: { settings: AppSettings }) {
  if (!settings.updatedBy) return <>Using the defaults; nobody has edited these settings yet.</>;
  return (
    <>
      Last updated {formatDateTime(settings.updatedAt)} by {settings.updatedBy.name}
    </>
  );
}

/** Admin only (SETTINGS_EDIT, C25): the app-wide low-stock threshold and currency. */
export default function Settings() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const form = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    values: toFormValues(settings),
  });
  const typedThreshold = useWatch({ control: form.control, name: 'lowStockThreshold' });
  // The values waiting for the currency confirmation
  const [pending, setPending] = useState<SettingsFormValues | null>(null);

  const save = (values: SettingsFormValues) =>
    update.mutate(values, { onSuccess: (saved) => form.reset(toFormValues(saved)) });

  const onSubmit = (values: SettingsFormValues) => {
    if (values.currency !== settings.currency) setPending(values);
    else save(values);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">These apply to everyone using the app.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inventory</CardTitle>
          <CardDescription>
            <LastUpdated settings={settings} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
              <FormField
                control={form.control}
                name="lowStockThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Low-stock threshold</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" className="h-10 rounded-lg sm:w-40" {...field} />
                    </FormControl>
                    <FormDescription>{thresholdHint(typedThreshold)}. Out of stock is always 0.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl>
                      <CurrencyCombobox value={field.value} onChange={field.onChange} />
                    </FormControl>
                    <FormDescription>
                      Changing the currency only relabels amounts. Existing prices and stock history are not converted.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={!form.formState.isDirty || update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(open: boolean) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change the currency?</AlertDialogTitle>
            <AlertDialogDescription>
              Every amount will show in {pending && currencyLabel(pending.currency)} instead of {currencyLabel(settings.currency)}.
              Nothing is converted: a price of 10 stays 10.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) save(pending);
                setPending(null);
              }}
            >
              Change currency
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
