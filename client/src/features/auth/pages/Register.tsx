import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerFormSchema, PASSWORD_MIN_LENGTH, type RegisterFormInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { AuthMethodTabs } from '../components/AuthMethodTabs';
import { TelegramSignupPanel } from '../components/TelegramQrPanel';
import { TextField } from '../components/TextField';
import { useRegister } from '../hooks/useAuth';

function EmailSignupForm() {
  const register = useRegister();
  const form = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    mode: 'onTouched',
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });

  if (register.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a verification link to <strong>{form.getValues('email')}</strong>. Verify your address, then
          sign in. An administrator will review your account after that.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(({ name, email, password }) => register.mutate({ name, email, password }))}
        className="space-y-4"
        noValidate
      >
        <TextField control={form.control} name="name" label="Name" autoComplete="name" />
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
        <TextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <TextField
          control={form.control}
          name="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={register.isPending}>
          {register.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </Form>
  );
}

export default function Register() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Create an account</h1>
      <AuthMethodTabs email={<EmailSignupForm />} telegram={<TelegramSignupPanel />} />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-foreground hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
