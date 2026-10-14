import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { APP_HOME } from '@/app/paths';
import { Button } from '@/components/ui/button';

/** Rendered inside the app shell when the signed-in user's role may not open the page. The URL stays. */
export default function NoAccess() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold">You don&apos;t have access to this page</h2>
        <p className="text-sm text-muted-foreground">
          It&apos;s only available to admins. Ask an admin if you think you need it.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to={APP_HOME}>Go to the dashboard</Link>
      </Button>
    </div>
  );
}

/** Error boundary for a permission-guarded route: a 403 from requirePermission shows NoAccess, anything else bubbles on. */
export function NoAccessBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 403) return <NoAccess />;
  throw error;
}
