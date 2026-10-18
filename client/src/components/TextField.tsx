import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/** `TOut` is what the form's resolver outputs, when it differs from the input (e.g. a price typed as text). */
interface TextFieldProps<T extends FieldValues, TOut = T> {
  control: Control<T, unknown, TOut>;
  name: FieldPath<T>;
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel';
  /** A Textarea instead of an Input. */
  multiline?: boolean;
  autoComplete?: string;
  /** Helper text under the input. */
  hint?: string;
  /** Shown on the right of the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
}

export function TextField<T extends FieldValues, TOut = T>({
  control,
  name,
  label,
  type = 'text',
  multiline = false,
  autoComplete,
  hint,
  labelAction,
}: TextFieldProps<T, TOut>) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between">
            <FormLabel>{label}</FormLabel>
            {labelAction}
          </div>
          {isPassword ? (
            <div className="relative">
              <FormControl>
                <Input
                  type={revealed ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  className="pr-10"
                  {...field}
                />
              </FormControl>
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                aria-label={revealed ? 'Hide password' : 'Show password'}
                aria-pressed={revealed}
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          ) : (
            <FormControl>
              {multiline ? (
                <Textarea autoComplete={autoComplete} rows={3} {...field} />
              ) : (
                <Input type={type} autoComplete={autoComplete} {...field} />
              )}
            </FormControl>
          )}
          {hint && <FormDescription>{hint}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
