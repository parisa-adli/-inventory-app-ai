import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  PASSWORD_HINT,
  changePasswordSchema,
  setPasswordSchema,
  type AuthUser,
  type ChangePasswordInput,
  type SetPasswordInput,
} from '@inventory/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { TextField } from '@/components/TextField';
import {
  useChangePassword,
  useRemovePassword,
  useSetPassword,
  useUnlinkTelegram,
} from '../hooks/useProfile';
import { ConfirmButton } from './ConfirmButton';
import { LinkTelegramDialog } from './LinkTelegramDialog';

const ONLY_WAY_IN = 'Your only way to sign in — add another before removing it.';

function AddPasswordForm({ onDone }: { onDone: () => void }) {
  const add = useSetPassword();
  const form = useForm<SetPasswordInput>({
    resolver: zodResolver(setPasswordSchema),
    mode: 'onTouched',
    defaultValues: { newPassword: '' },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((input) => add.mutate(input, { onSuccess: onDone }))}
        className="space-y-4"
        noValidate
      >
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={add.isPending}>
            {add.isPending ? 'Adding…' : 'Add password'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const change = useChangePassword();
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((input) => change.mutate(input, { onSuccess: onDone }))}
        className="space-y-4"
        noValidate
      >
        <TextField
          control={form.control}
          name="currentPassword"
          label="Current password"
          type="password"
          autoComplete="current-password"
        />
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={`${PASSWORD_HINT} Other devices will be signed out.`}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={change.isPending}>
            {change.isPending ? 'Changing…' : 'Change password'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Password and Telegram, docs/design/{profile,set-password-to-profile,password-and-telegram-linked}.png. */
export function SignInMethodsCard({ user }: { user: AuthUser }) {
  const [editing, setEditing] = useState<'add' | 'change' | null>(null);
  const [linking, setLinking] = useState(false);
  const removePassword = useRemovePassword();
  const unlinkTelegram = useUnlinkTelegram();

  // An account always keeps one sign-in method; the server enforces it too (LAST_SIGN_IN_METHOD)
  const onlyPassword = user.hasPassword && !user.telegramLinked;
  const onlyTelegram = user.telegramLinked && !user.hasPassword;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in methods</CardTitle>
        <CardDescription>Both reach this same account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label="Password" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Password</p>
              <Badge variant="outline">{user.hasPassword ? 'Set' : 'Not set'}</Badge>
            </div>
            {editing === null && (
              <div className="flex flex-col sm:items-end gap-2 ">
                {user.hasPassword ? (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => setEditing('change')}>
                      Change password
                    </Button>
                    <ConfirmButton
                      title="Remove your password?"
                      description="You will only be able to sign in with Telegram. You can add a password again here, or with a password reset email."
                      confirmLabel="Remove password"
                      onConfirm={() => removePassword.mutate()}
                      disabled={onlyPassword || removePassword.isPending}
                    >
                      Remove password
                    </ConfirmButton>
                  </div>
                ) : (
                  <Button onClick={() => setEditing('add')}>Add password</Button>
                )}
                {onlyPassword && <p className="text-xs text-muted-foreground">{ONLY_WAY_IN}</p>}
              </div>
            )}
          </div>
          {editing === 'add' && <AddPasswordForm onDone={() => setEditing(null)} />}
          {editing === 'change' && <ChangePasswordForm onDone={() => setEditing(null)} />}
        </section>

        <section aria-label="Telegram" className="flex flex-wrap items-start justify-between gap-4 border-t pt-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Telegram</p>
            <Badge variant="outline">
              {!user.telegramLinked
                ? 'Not linked'
                : user.telegramUsername
                  ? `Linked as @${user.telegramUsername}`
                  : 'Linked'}
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-2">
            {user.telegramLinked ? (
              <ConfirmButton
                title="Unlink Telegram?"
                description="You will no longer be able to sign in with this Telegram account."
                confirmLabel="Unlink Telegram"
                onConfirm={() => unlinkTelegram.mutate()}
                disabled={onlyTelegram || unlinkTelegram.isPending}
              >
                Unlink Telegram
              </ConfirmButton>
            ) : (
              <Button variant="outline" onClick={() => setLinking(true)}>
                Link Telegram
              </Button>
            )}
            {onlyTelegram && <p className="text-xs text-muted-foreground">{ONLY_WAY_IN}</p>}
          </div>
        </section>
        <LinkTelegramDialog open={linking} onOpenChange={setLinking} />
      </CardContent>
    </Card>
  );
}
