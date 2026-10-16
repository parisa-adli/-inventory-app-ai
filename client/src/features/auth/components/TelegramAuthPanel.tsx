import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { telegramCompleteSchema, type TelegramCompleteInput } from '@inventory/shared';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useTelegramAuth } from '../hooks/useTelegramAuth';
import { Caption, TelegramCodeStep, TelegramQrStep, TelegramStartingStep, TelegramStoppedStep } from './TelegramSteps';
import { TextField } from '@/components/TextField';

function ProfileForm({
  defaultName,
  pending,
  onSubmit,
}: {
  defaultName: string;
  pending: boolean;
  onSubmit: (input: TelegramCompleteInput) => void;
}) {
  const form = useForm<TelegramCompleteInput>({
    resolver: zodResolver(telegramCompleteSchema),
    mode: 'onTouched',
    defaultValues: { name: defaultName, email: '' },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Caption>Your Telegram account is verified. Choose a username and enter your email to finish.</Caption>
        <TextField control={form.control} name="name" label="Username" autoComplete="nickname" />
        <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </Form>
  );
}

/**
 * Telegram tab of Sign in and Sign up: the same flow for both. A linked Telegram account is signed in,
 * a new one is asked for a username and an email to finish registration.
 */
export function TelegramAuthPanel() {
  const auth = useTelegramAuth();

  switch (auth.phase) {
    case 'starting':
      return <TelegramStartingStep />;

    case 'qr':
      return <TelegramQrStep auth={auth} onStartOver={auth.restart} />;

    case 'otp':
      return (
        <TelegramCodeStep
          auth={auth}
          intro="Verify with Telegram and we'll create your account — or sign you in if it's already linked."
          onStartOver={auth.restart}
        />
      );

    case 'profile':
      return <ProfileForm defaultName={auth.prefillName} pending={auth.isCompleting} onSubmit={auth.complete} />;

    case 'linkSent':
      return (
        <div className="space-y-4 text-center">
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            <strong>{auth.linkedEmail}</strong> already belongs to an account. We sent it a confirmation link; open
            it to connect this Telegram account, then sign in.
          </p>
        </div>
      );

    default:
      return <TelegramStoppedStep auth={auth} onStartOver={auth.restart} />;
  }
}
