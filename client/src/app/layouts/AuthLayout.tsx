import { ReactNode } from 'react';
import { Boxes } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface AuthLayoutProps {
  children: ReactNode;
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
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
