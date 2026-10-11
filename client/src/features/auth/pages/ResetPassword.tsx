import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { PASSWORD_HINT, resetPasswordSchema, type ResetPasswordInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { getApiError } from '@/lib/apiError';
import { TextField } from '../components/TextField';
import { useResetPassword } from '../hooks/useAuth';

export default function ResetPassword() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const reset = useResetPassword();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });

  const submit = ({ password }: ResetPasswordInput) =>
    reset.mutate(
      { token, password },
      {
        // No session is issued: the user signs in with the new password
        onSuccess: () =>
          navigate('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } }),
      }
    );

  const errorCode = reset.isError ? getApiError(reset.error).code : null;

  if (errorCode === 'INVALID_TOKEN' || errorCode === 'TOKEN_EXPIRED') {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{errorCode === 'TOKEN_EXPIRED' ? 'Link expired' : 'Link not valid'}</h1>
        <p className="text-sm text-muted-foreground">
          {errorCode === 'TOKEN_EXPIRED'
            ? 'This reset link has expired.'
            : 'This reset link is invalid or has already been used.'}
        </p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Choose a new password</h1>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <TextField
            control={form.control}
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            hint={PASSWORD_HINT}
          />
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
