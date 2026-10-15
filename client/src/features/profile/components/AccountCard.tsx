import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema, type AuthUser, type UpdateProfileInput } from '@inventory/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useUpdateProfile } from '../hooks/useProfile';

/** Display name (editable) and email (read-only), docs/design/profile.png. */
export function AccountCard({ user }: { user: AuthUser }) {
  const update = useUpdateProfile();
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    values: { name: user.name },
  });

  const onSubmit = (input: UpdateProfileInput) =>
    update.mutate(input, { onSuccess: (saved) => form.reset({ name: saved.name }) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input autoComplete="name" {...field} />
                    </FormControl>
                    <Button type="submit" disabled={!form.formState.isDirty || update.isPending}>
                      {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <div className="space-y-2">
          <p className="text-sm font-medium">Email</p>
          <div className="flex items-center gap-2 text-sm">
            <span>{user.email}</span>
            <Badge variant="secondary">{user.emailVerified ? 'Verified' : 'Not verified'}</Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
