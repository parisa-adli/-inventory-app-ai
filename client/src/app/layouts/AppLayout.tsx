import { ReactNode } from 'react'
import { Outlet } from 'react-router'
import { AppSidebar, AppTopBar } from './AppNav'

interface AppLayoutProps {
  children: ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopBar />
        <main className="mx-auto w-full px-4 py-8">{children}</main>
      </div>
    </div>
  )
}

/** AppLayout as a layout route: renders the matched child route. */
export function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  )
}
