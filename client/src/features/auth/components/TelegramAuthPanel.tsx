import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import { telegramCompleteSchema, type TelegramCompleteInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useTelegramAuth } from '../hooks/useTelegramAuth';
import { OtpInput } from './OtpInput';
import { TextField } from './TextField';

const formatCountdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** The QR code in the white, bordered box from the design. */
function QrBox({ value }: { value: string }) {
  return (
    <div className="mx-auto w-fit rounded-xl border bg-white p-4">
      <QRCodeSVG value={value} size={176} level="M" title="Telegram QR code" />
    </div>
  );
}

/** Same footprint as the QR box, so the card does not jump while the code is created. */
function QrBoxSkeleton() {
  return <div className="mx-auto size-[210px] animate-pulse rounded-xl border bg-muted" aria-hidden />;
}

function Caption({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function StartOver({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button type="button" className="text-sm font-medium hover:underline" onClick={onClick}>
        Start over
      </button>
    </div>
  );
}

function ProfileForm({
  defaultName,
  pending,
  onSubmit,
}: {
  defaultName: string;
  pending: boolean;
  onSubmit: (input: TelegramCompleteInput) => void;
}) {
  const form = useForm<TelegramCompleteInput>({
    resolver: zodResolver(telegramCompleteSchema),
    mode: 'onTouched',
    defaultValues: { name: defaultName, email: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Caption>Your Telegram account is verified. Choose a username and enter your email to finish.</Caption>
        <TextField control={form.control} name="name" label="Username" autoComplete="nickname" />
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Telegram tab of Sign in and Sign up: the same flow for both. A linked Telegram account is signed in,
 * a new one is asked for a username and an email to finish registration.
 */
export function TelegramAuthPanel() {
  const auth = useTelegramAuth();
  const [code, setCode] = useState('');

  const startOver = () => {
    setCode('');
    auth.restart();
  };

  switch (auth.phase) {
    case 'starting':
      return (
        <div className="space-y-4">
          <QrBoxSkeleton />
          <Caption>Creating your QR code…</Caption>
        </div>
      );

    case 'qr':
      return (
        <div className="space-y-4">
          <QrBox value={auth.deepLink!} />
          <div className="flex justify-center">
            <Button asChild>
              <a href={auth.deepLink} target="_blank" rel="noreferrer">
                Open Telegram
              </a>
            </Button>
          </div>
          <Caption>Scan the QR code or open the link on your phone, then press Start in the bot.</Caption>
          <p className="text-center text-xs text-muted-foreground" role="timer">
            Expires in {formatCountdown(auth.qrSeconds)}
          </p>
          <StartOver onClick={startOver} />
        </div>
      );

    case 'otp': {
      const codeExpired = auth.otpSeconds === 0;
      return (
        <div className="space-y-4">
          <Caption>
            Verify with Telegram and we&apos;ll create your account — or sign you in if it&apos;s already linked.
          </Caption>
          <Caption id="otp-help">Enter the 6-digit code sent to you on Telegram.</Caption>
          <OtpInput
            value={code}
            onChange={(value) => {
              setCode(value);
              if (auth.error) auth.clearError();
            }}
            onComplete={(value) => auth.verify({ code: value }, { onError: () => setCode('') })}
            disabled={auth.isVerifying}
            invalid={!!auth.error}
            describedBy={auth.error ? 'otp-error otp-help' : 'otp-help'}
          />
          {auth.error && (
            <p id="otp-error" role="alert" className="text-center text-sm text-destructive">
              {auth.error}
            </p>
          )}
          {auth.isVerifying ? (
            <p className="text-center text-xs text-muted-foreground" role="status">
              Checking code…
            </p>
          ) : (
            <p className="text-center text-xs text-muted-foreground" role="timer">
              {codeExpired ? 'This code has expired' : `Expires in ${formatCountdown(auth.otpSeconds)}`}
            </p>
          )}
          <div className="flex justify-center">
            {auth.resendExhausted ? (
              <span className="text-sm text-muted-foreground">No more codes can be sent</span>
            ) : auth.resendSeconds > 0 ? (
              <span className="text-sm text-muted-foreground">Resend code ({formatCountdown(auth.resendSeconds)})</span>
            ) : (
              <button
                type="button"
                className="text-sm font-medium hover:underline disabled:opacity-50"
                disabled={auth.isResending}
                onClick={() => {
                  setCode('');
                  auth.resend();
                }}
              >
                {auth.isResending ? 'Sending…' : 'Resend code'}
              </button>
            )}
          </div>
          <StartOver onClick={startOver} />
        </div>
      );
    }

    case 'profile':
      return <ProfileForm defaultName={auth.prefillName} pending={auth.isCompleting} onSubmit={auth.complete} />;

    case 'linkSent':
      return (
        <div className="space-y-4 text-center">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            <strong>{auth.linkedEmail}</strong> already belongs to an account. We sent it a confirmation link; open
            it to connect this Telegram account, then sign in.
          </p>
        </div>
      );

    default:
      return (
        <div className="space-y-4">
          <Caption>
            {auth.phase === 'locked' && 'Too many attempts. Please start over.'}
            {auth.phase === 'expired' && 'This session has expired. Please start over.'}
            {auth.phase === 'error' && 'We could not reach Telegram sign in. Please try again.'}
          </Caption>
          <StartOver onClick={startOver} />
        </div>
      );
  }
}
