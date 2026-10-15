import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTelegramAuth } from '@/features/auth/hooks/useTelegramAuth';
import {
  TelegramCodeStep,
  TelegramQrStep,
  TelegramStartingStep,
  TelegramStoppedStep,
} from '@/features/auth/components/TelegramSteps';
import { startTelegramLink } from '../api/profileApi';
import { useTelegramLinked } from '../hooks/useProfile';

/** Mounted only while the dialog is open, so every opening starts a fresh attempt. */
function LinkTelegramFlow({ onLinked }: { onLinked: () => void }) {
  const linked = useTelegramLinked();
  const auth = useTelegramAuth({
    start: startTelegramLink,
    onCompleted: (user) => {
      linked(user);
      onLinked();
    },
  });

  switch (auth.phase) {
    case 'starting':
      return <TelegramStartingStep />;
    case 'qr':
      return <TelegramQrStep auth={auth} onStartOver={auth.restart} />;
    case 'otp':
      return (
        <TelegramCodeStep
          auth={auth}
          intro="Enter the code to link this Telegram account to your profile."
          onStartOver={auth.restart}
        />
      );
    // A link never asks for sign-up details; anything else ends the attempt
    default:
      return <TelegramStoppedStep auth={auth} onStartOver={auth.restart} />;
  }
}

/** "Link Telegram" on the Profile page: the QR -> code steps of Telegram sign in, for the signed-in user. */
export function LinkTelegramDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Link Telegram</DialogTitle>
          <DialogDescription>Then you can also sign in to this account with Telegram.</DialogDescription>
        </DialogHeader>
        {open && <LinkTelegramFlow onLinked={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
