import { useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Last-resort error page, e.g. the session check failing because the API cannot be reached. */
export default function RouteError() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>The app could not load this page. Check your connection and try again.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    </div>
  );
}
