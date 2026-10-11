import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface OtpInputProps {
  value: string
  onChange: (value: string) => void
  /** Called once with the full code, as soon as the last digit is typed or pasted. */
  onComplete?: (value: string) => void
  length?: number
  /** Read-only while a code is being checked (the field keeps focus, so the ring does not flicker). */
  disabled?: boolean
  /**
   * Wrong code: the field is blurred so no ring is shown, and `aria-invalid` is set for assistive tech.
   * The boxes themselves are never colored for errors.
   */
  invalid?: boolean
  /** Id of the element that describes the field (instructions / error). */
  describedBy?: string
}

/**
 * Six digit boxes in one bordered row (docs/design/enter-input-otp.webp, wrong-otp-error.webp).
 * - Only the slot that receives the next digit shows focus: a 3px `--ring` ring above its neighbors'
 *   dividers, rounded on the outer corners of the first/last slot and square in the middle, plus a caret.
 *   The ring stays on the last slot once the code is complete.
 * - Not focused (or blurred after a wrong code): no ring anywhere. Clicking the field brings it back on
 *   the first empty slot.
 * One real input sits on top of the boxes, so typing, pasting, autofill (`one-time-code`) and screen
 * readers behave like a normal field.
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
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  // A wrong code leaves the slots empty and the field blurred (no ring); the user clicks to retype
  useEffect(() => {
    if (invalid) inputRef.current?.blur()
  }, [invalid])

  const handleChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, length)
    onChange(next)
    if (next.length === length) onComplete?.(next)
  }

  const active = Math.min(value.length, length - 1)

  return (
    <div
      className="relative mx-auto grid w-full max-w-72 rounded-lg border bg-background"
      style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
    >
      {Array.from({ length }, (_, index) => {
        const isActive = focused && index === active
        return (
          <div
            key={index}
            aria-hidden
            className={cn(
              'relative flex h-12 items-center justify-center text-lg font-medium',
              index > 0 && 'border-l',
              index === 0 && 'rounded-l-lg',
              index === length - 1 && 'rounded-r-lg',
              isActive && 'z-10 ring-[3px] border border-gray-400 ring-ring/40'
            )}
          >
            {value[index] ??
              (isActive && <span className="h-6 w-px animate-pulse bg-foreground" />)}
          </div>
        )
      })}
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Keep the caret at the end so the highlighted slot always follows what was typed
        onSelect={(event) => {
          const end = event.currentTarget.value.length
          event.currentTarget.setSelectionRange(end, end)
        }}
        type="text"
        inputMode="numeric"
        pattern="\d*"
        autoComplete="one-time-code"
        maxLength={length}
        autoFocus
        readOnly={disabled}
        aria-busy={disabled || undefined}
        aria-label={`${length}-digit verification code`}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        // `@tailwindcss/forms` gives every text input a 1px border and a blue focus border/ring; this input covers the
        // whole group, so those would draw a blue rectangle around it. Only the active slot may show focus.
        className="absolute inset-0 size-full cursor-text appearance-none border-0 bg-transparent p-0 text-transparent caret-transparent shadow-none outline-none ring-0 [-webkit-tap-highlight-color:transparent] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"
      />
    </div>
  )
}
