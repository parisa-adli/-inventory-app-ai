import { useState, type ReactNode } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface TextFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  /** Helper text under the input. */
  hint?: string;
  /** Shown on the right of the label row, e.g. a "Forgot password?" link. */
  labelAction?: ReactNode;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  type = 'text',
  autoComplete,
  hint,
  labelAction,
}: TextFieldProps<T>) {
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
          <FormControl>
            {isPassword ? (
              <div className="relative">
                <Input
                  type={revealed ? 'text' : 'password'}
                  autoComplete={autoComplete}
                  className="pr-10"
                  {...field}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                  aria-label={revealed ? 'Hide password' : 'Show password'}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            ) : (
              <Input type={type} autoComplete={autoComplete} {...field} />
            )}
          </FormControl>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
