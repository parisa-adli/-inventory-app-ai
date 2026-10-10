import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { TextField } from '../components/TextField';
import { useForgotPassword } from '../hooks/useAuth';

export default function ForgotPassword() {
  const forgot = useForgotPassword();
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onTouched',
    defaultValues: { email: '' },
  });

  if (forgot.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-2xl font-bold">Check your email</h2>
        {/* Same message whether or not the account exists */}
        <p className="text-gray-600">If an account exists for that email, a password reset link is on its way.</p>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Back to log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">Forgot your password?</h2>
      <p className="text-center text-sm text-gray-600">Enter your email and we will send you a reset link.</p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => forgot.mutate(values))} className="space-y-4" noValidate>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm">
        <Link to="/login" className="text-gray-600 hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
