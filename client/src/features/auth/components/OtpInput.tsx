import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once with the full code, as soon as the last digit is typed or pasted. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  /** Id of the element that describes the field (instructions / error). */
  describedBy?: string;
}

/**
 * Six digit boxes in one bordered row (docs/design/enter-input-otp.webp). The box that receives the next
 * digit gets a ring and a blinking caret; a wrong code leaves the boxes empty (docs/design/wrong-otp-error.webp,
 * the error text sits below). One real input sits on top of the boxes, so typing, pasting, autofill
 * (`one-time-code`) and screen readers behave like a normal field.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  describedBy,
}: OtpInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  // The field is disabled while a code is being checked; give focus back so the user can retype at once
  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  const active = Math.min(value.length, length - 1);

  return (
    <div
      className="relative mx-auto grid w-full max-w-72 overflow-hidden rounded-lg border bg-background"
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }, (_, index) => {
        const isActive = focused && !disabled && index === active;
        return (
          <div
            key={index}
            aria-hidden
            className={cn(
              'relative flex h-12 items-center justify-center text-lg font-medium',
              index > 0 && 'border-l',
              isActive && 'z-10 rounded-md ring-[3px] ring-inset ring-muted-foreground/40'
            )}
          >
            {value[index] ?? (isActive && <span className="h-6 w-px animate-pulse bg-foreground" />)}
          </div>
        );
      })}
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Keep the caret at the end so the highlighted box always follows what was typed
        onSelect={(event) => {
          const end = event.currentTarget.value.length;
          event.currentTarget.setSelectionRange(end, end);
        }}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        disabled={disabled}
        aria-label={`${length}-digit verification code`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 size-full cursor-text bg-transparent text-transparent caret-transparent outline-none disabled:cursor-not-allowed"
      />
    </div>
  );
}
