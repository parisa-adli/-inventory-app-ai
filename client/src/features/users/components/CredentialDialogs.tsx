import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { AdminUser } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useIssueTemporaryPassword, useUnlinkTelegram } from '../hooks/useUsers';

export type CredentialAction = { kind: 'temp-password' | 'unlink-telegram'; user: AdminUser };

/**
 * The confirmations behind the All tab menu's Credentials items. A temporary password is shown once,
 * in the same dialog, after it is issued; closing the dialog forgets it.
 */
export function CredentialDialogs({ action, onClose }: { action: CredentialAction | null; onClose: () => void }) {
  const issue = useIssueTemporaryPassword();
  const unlink = useUnlinkTelegram();
  const [copied, setCopied] = useState(false);
  const password = action?.kind === 'temp-password' ? issue.data?.temporaryPassword : undefined;
  const user = action?.user;

  const close = () => {
    issue.reset();
    setCopied(false);
    onClose();
  };

  const copy = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      toast.error('Could not copy. Select the password and copy it yourself.');
    }
  };

  return (
    <AlertDialog open={action !== null} onOpenChange={(open: boolean) => !open && close()}>
      <AlertDialogContent>
        {action?.kind === 'temp-password' && password && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Temporary password for {user?.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Share it with them privately. It is shown only once; they must choose a new password when they sign in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
              <code className="flex-1 font-mono text-sm break-all select-all">{password}</code>
              <Button variant="ghost" size="icon" aria-label="Copy password" onClick={copy}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <AlertDialogFooter>
              <Button onClick={close}>Done</Button>
            </AlertDialogFooter>
          </>
        )}

        {action?.kind === 'temp-password' && !password && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Issue a temporary password for {user?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                It replaces their current password and signs them out everywhere. They must choose a new password the
                next time they sign in.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button disabled={issue.isPending} onClick={() => user && issue.mutate(user.id)}>
                {issue.isPending ? 'Issuing…' : 'Issue password'}
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {action?.kind === 'unlink-telegram' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlink Telegram from {user?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They can no longer sign in with Telegram until they link it again from their profile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={unlink.isPending}
                onClick={() => user && unlink.mutate(user.id, { onSettled: close })}
              >
                {unlink.isPending ? 'Unlinking…' : 'Unlink Telegram'}
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
