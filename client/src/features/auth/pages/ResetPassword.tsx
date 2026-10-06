import { Link, useNavigate, useParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@inventory/shared';
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
    defaultValues: { password: '' },
  });

  const submit = ({ password }: ResetPasswordInput) =>
    reset.mutate({ token, password }, { onSuccess: () => navigate('/login', { replace: true }) });

  const linkInvalid = reset.isError && getApiError(reset.error).code === 'INVALID_TOKEN';

  if (linkInvalid) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">Link expired</h2>
        <p className="text-gray-600">This reset link is invalid or has expired.</p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">Choose a new password</h2>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
          <TextField
            control={form.control}
            name="password"
            label="New password"
            type="password"
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending ? 'Saving…' : 'Set new password'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
