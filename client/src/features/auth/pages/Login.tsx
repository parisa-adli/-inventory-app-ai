import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { TextField } from '../components/TextField';
import { useLogin } from '../hooks/useAuth';

export default function Login() {
  const login = useLogin();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // On success the route guard redirects, so there is nothing to navigate to here
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-center">Log in</h2>
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
            {login.isPending ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
      </Form>
      <div className="flex justify-between text-sm">
        <Link to="/forgot-password" className="text-gray-600 hover:underline">
          Forgot password?
        </Link>
        <Link to="/register" className="text-gray-600 hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
