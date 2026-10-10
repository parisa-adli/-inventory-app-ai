import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useLogin } from '../hooks/useAuth';
import { TextField } from './TextField';

export function PasswordLoginForm() {
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // On success the route guard redirects, so there is nothing to navigate to here
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => login.mutate(values))} className="space-y-4" noValidate>
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
        <TextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          labelAction={
            <Link to="/forgot-password" className="text-sm hover:underline">
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </Form>
  );
}
