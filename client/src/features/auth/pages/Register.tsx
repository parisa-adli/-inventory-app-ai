import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { AuthTabs } from '../components/AuthTabs';
import { TextField } from '../components/TextField';
import { useRegister } from '../hooks/useAuth';

export default function Register() {
  const register = useRegister();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  if (register.isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-lg font-semibold">Check your email</h1>
        <p className="text-muted-foreground">
          We sent a verification link to <strong>{form.getValues('email')}</strong>. Verify your address, then log in.
          An administrator will review your account after that.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Go to log in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-lg font-semibold">Create an account</h1>
        <p className="text-sm text-muted-foreground">Sign up to start managing inventory.</p>
      </div>
      <AuthTabs value="register" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => register.mutate(values))} className="space-y-4" noValidate>
          <TextField control={form.control} name="name" label="Name" autoComplete="name" />
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
          <TextField
            control={form.control}
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
          />
          <Button type="submit" className="w-full" disabled={register.isPending}>
            {register.isPending ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="text-foreground hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
