import { useState, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import type { useTelegramAuth } from '../hooks/useTelegramAuth';
import { OtpInput } from './OtpInput';

// The steps every Telegram flow shows: sign in / sign up (TelegramAuthPanel) and linking from the
// Profile page (LinkTelegramDialog). QR code -> code from the bot -> code entered here.

type TelegramAuth = ReturnType<typeof useTelegramAuth>;

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

export function Caption({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function StartOver({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-center">
      <button type="button" className="text-sm font-medium hover:underline" onClick={onClick}>
        Start over
      </button>
    </div>
  );
}

/** Same footprint as the QR box, so the card does not jump while the code is created. */
export function TelegramStartingStep() {
  return (
    <div className="space-y-4">
      <div className="mx-auto size-[210px] animate-pulse rounded-xl border bg-muted" aria-hidden />
      <Caption>Creating your QR code…</Caption>
    </div>
  );
}

export function TelegramQrStep({ auth, onStartOver }: { auth: TelegramAuth; onStartOver: () => void }) {
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
      <StartOver onClick={onStartOver} />
    </div>
  );
}

/** The 6-digit code from the bot. `intro` says what the code is for. */
export function TelegramCodeStep({
  auth,
  intro,
  onStartOver,
}: {
  auth: TelegramAuth;
  intro: ReactNode;
  onStartOver: () => void;
}) {
  const [code, setCode] = useState('');
  const codeExpired = auth.otpSeconds === 0;

  return (
    <div className="space-y-4">
      <Caption>{intro}</Caption>
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
      <StartOver onClick={onStartOver} />
    </div>
  );
}

/** Locked, expired or unreachable: say so and offer a fresh start. */
export function TelegramStoppedStep({ auth, onStartOver }: { auth: TelegramAuth; onStartOver: () => void }) {
  return (
    <div className="space-y-4">
      <Caption>
        {auth.phase === 'locked' && 'Too many attempts. Please start over.'}
        {auth.phase === 'expired' && 'This session has expired. Please start over.'}
        {auth.phase === 'error' && 'We could not reach Telegram. Please try again.'}
      </Caption>
      <StartOver onClick={onStartOver} />
    </div>
  );
}
