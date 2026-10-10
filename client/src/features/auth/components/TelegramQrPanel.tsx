import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { useTelegramQrLogin } from '../hooks/useTelegramQrLogin';

// The bot handle is public; the sign-up QR code is just a link to the bot
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

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

function OpenTelegramButton({ href }: { href: string }) {
  return (
    <div className="flex justify-center">
      <Button asChild>
        <a href={href} target="_blank" rel="noreferrer">
          Open Telegram
        </a>
      </Button>
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <p className="text-center text-sm text-muted-foreground">{children}</p>;
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

/** Sign in tab: a fresh single-use QR code that signs this browser in once Start is pressed in the bot. */
export function TelegramLoginPanel() {
  const { phase, deepLink, secondsLeft, restart } = useTelegramQrLogin();

  if (phase === 'starting') {
    return (
      <div className="space-y-4">
        <QrBoxSkeleton />
        <Caption>Creating your QR code…</Caption>
      </div>
    );
  }

  if (phase === 'waiting' && deepLink) {
    return (
      <div className="space-y-4">
        <QrBox value={deepLink} />
        <OpenTelegramButton href={deepLink} />
        <Caption>Scan the QR code or open the link on your phone, then press Start in the bot.</Caption>
        <p className="text-center text-xs text-muted-foreground" role="timer">
          Expires in {formatCountdown(secondsLeft)}
        </p>
        <StartOver onClick={restart} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {phase === 'unlinked' && (
        <Caption>
          This Telegram account is not linked to an account yet.{' '}
          <Link to="/register" className="text-foreground hover:underline">
            Sign up with Telegram
          </Link>{' '}
          or sign in with your email first.
        </Caption>
      )}
      {phase === 'expired' && <Caption>This QR code has expired.</Caption>}
      {phase === 'error' && <Caption>We could not start Telegram sign in. Please try again.</Caption>}
      <StartOver onClick={restart} />
    </div>
  );
}

/** Sign up tab: a static QR code to the bot, which then asks for a name and an email. */
export function TelegramSignupPanel() {
  const deepLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=signup` : null;

  if (!deepLink) {
    return <Caption>Search for our bot in Telegram and send /start to sign up.</Caption>;
  }

  return (
    <div className="space-y-4">
      <QrBox value={deepLink} />
      <OpenTelegramButton href={deepLink} />
      <Caption>
        Scan the QR code or open the link on your phone, press Start in the bot, then send your name and email.
      </Caption>
    </div>
  );
}
