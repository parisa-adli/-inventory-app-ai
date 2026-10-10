import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { AuthTabs } from '../components/AuthTabs';
import { TextField } from '../components/TextField';
import { useLogin } from '../hooks/useAuth';

export default function Login() {
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // On success the route guard redirects, so there is nothing to navigate to here
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">Sign in to manage your inventory.</p>
      </div>
      <AuthTabs value="login" />
      <Form {...form}>
        <form onSubmit={form.handleSubmit((values) => login.mutate(values))} className="space-y-4" noValidate>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
          <TextField
            control={form.control}
            name="password"
            label="Password"
            type="password"
            autoComplete="current-password"
          />
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Form>
      <p className="text-center text-sm text-muted-foreground">
        <Link to="/forgot-password" className="hover:text-foreground hover:underline">
          Forgot password?
        </Link>
      </p>
    </div>
  );
}
