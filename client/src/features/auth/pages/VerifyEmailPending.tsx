import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changeEmailSchema, type ChangeEmailInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { formatWait, getApiError } from '@/lib/apiError';
import { TextField } from '@/components/TextField';
import { useAuthUser, useChangeEmail, useLogout, useResendVerification } from '../hooks/useAuth';
import { useCooldown } from '../hooks/useCooldown';

/**
 * The gate for a signed-in user whose email is not verified yet: resend the link, fix a typo in the
 * address, or check again after clicking the link on another device.
 */
export default function VerifyEmailPending() {
  const { data: user, refetch, isFetching } = useAuthUser();
  const logout = useLogout();
  const cooldown = useCooldown();
  const resend = useResendVerification(cooldown.start);
  const changeEmail = useChangeEmail();
  const [editing, setEditing] = useState(false);

  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  if (!user) return null;

  const submitEmail = ({ email }: ChangeEmailInput) =>
    changeEmail.mutate(
      { email },
      {
        onSuccess: () => {
          setEditing(false);
          form.reset();
        },
        onError: (err) => {
          const { code, message, retryAfter } = getApiError(err);
          if (retryAfter) cooldown.start(retryAfter);
          if (code === 'DUPLICATE_EMAIL') form.setError('email', { message });
        },
      }
    );

  const waiting = cooldown.secondsLeft > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Verify your email</h1>
      <p className="text-sm text-muted-foreground">
        We sent a verification link to <strong className="text-foreground">{user.email}</strong>. Open it to
        continue; an administrator can only approve accounts with a verified email.
      </p>

      {editing ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submitEmail)} className="space-y-4" noValidate>
            <TextField control={form.control} name="email" label="New email" type="email" autoComplete="email" />
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={changeEmail.isPending || waiting}>
                {changeEmail.isPending ? 'Saving…' : 'Save and resend'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      ) : (
        <div className="space-y-2">
          <Button className="w-full" disabled={isFetching} onClick={() => void refetch()}>
            I&apos;ve verified my email
          </Button>
          <Button
            variant="outline"
            className="w-full"
            disabled={resend.isPending || waiting}
            onClick={() => resend.mutate()}
          >
            {resend.isPending
              ? 'Sending…'
              : waiting
                ? `Try again in ${formatWait(cooldown.secondsLeft)}`
                : 'Resend verification email'}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
            Change my email
          </Button>
        </div>
      )}

      {waiting && (
        <p className="text-xs text-muted-foreground" role="status">
          Too many emails requested. You can send another in {formatWait(cooldown.secondsLeft)}.
        </p>
      )}

      <Button variant="ghost" className="w-full" disabled={logout.isPending} onClick={() => logout.mutate()}>
        Log out
      </Button>
    </div>
  );
}
