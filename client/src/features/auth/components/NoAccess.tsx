import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { ShieldX } from 'lucide-react';
import { APP_HOME } from '@/app/paths';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Rendered inside the app shell when the signed-in user's role may not open the page. The URL stays. */
export default function NoAccess() {
  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldX className="size-5" />
          You don&apos;t have access to this page
        </CardTitle>
        <CardDescription>Ask an admin if you think you should.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link to={APP_HOME}>Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Error boundary for a role-guarded route: a 403 from requireRole shows NoAccess, anything else bubbles on. */
export function NoAccessBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 403) return <NoAccess />;
  throw error;
}
