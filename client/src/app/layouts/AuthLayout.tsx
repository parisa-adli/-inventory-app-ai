import { ReactNode } from 'react';
import { Outlet } from 'react-router';
import { Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ThemeToggle } from '@/components/ThemeToggle';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 font-semibold">
            <Boxes className="size-5" />
            Inventory
          </div>
          {children}
        </CardContent>
      </Card>
    </div>
  );
}

/** AuthLayout as a layout route: renders the matched child route. */
export function AuthShell() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
