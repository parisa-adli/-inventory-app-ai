import { ReactNode } from 'react';
import { AppSidebar, AppTopBar } from './AppNav';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar />
        <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </div>
    </div>
  );
}
