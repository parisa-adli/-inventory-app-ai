import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface AuthMethodTabsProps {
  email: ReactNode;
  telegram: ReactNode;
}

/**
 * Email | Telegram switch shared by Sign in and Sign up. Inactive tabs are unmounted, so the
 * Telegram panel only creates its QR code once the tab is opened.
 */
export function AuthMethodTabs({ email, telegram }: AuthMethodTabsProps) {
  return (
    <Tabs defaultValue="email">
      <TabsList className="w-full">
        <TabsTrigger value="email">Email</TabsTrigger>
        <TabsTrigger value="telegram">Telegram</TabsTrigger>
      </TabsList>
      <TabsContent value="email" className="pt-2">
        {email}
      </TabsContent>
      <TabsContent value="telegram" className="pt-2">
        {telegram}
      </TabsContent>
    </Tabs>
  );
}
