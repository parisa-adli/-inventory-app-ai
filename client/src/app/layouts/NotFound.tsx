import { Link } from 'react-router';
import { APP_HOME } from '@/app/paths';
import { Button } from '@/components/ui/button';

/** Rendered inside the app shell for a URL that matches no page. The URL stays. */
export default function NotFound() {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold">Page not found</h2>
        <p className="text-sm text-muted-foreground">Check the address.</p>
      </div>
      <Button asChild variant="outline">
        <Link to={APP_HOME}>Go to the dashboard</Link>
      </Button>
    </div>
  );
}
