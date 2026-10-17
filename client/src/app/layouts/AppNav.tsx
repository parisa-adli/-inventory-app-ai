import { useState, type ComponentType } from 'react'
import { Link, NavLink } from 'react-router'
import {
  ArrowLeftRight,
  Boxes,
  ChevronDown,
  FolderTree,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Package,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { PERMISSIONS, hasPermission, type AuthUser, type Permission } from '@inventory/shared'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuthUser, useLogout } from '@/features/auth/hooks/useAuth'
import { PendingCountBadge } from '@/features/users/components/PendingCountBadge'
import { cn } from '@/lib/utils'
import { APP_HOME, PATHS } from '@/app/paths'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown only to users whose role grants it; omitted = every signed-in user. */
  permission?: Permission
  /** Rendered at the end of the link, e.g. a count; it decides itself whether to show. */
  badge?: ComponentType<{ className?: string }>
}

const NAV_ITEMS: NavItem[] = [
  { to: PATHS.dashboard, label: 'Dashboard', icon: LayoutDashboard, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: PATHS.products, label: 'Products', icon: Package, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: PATHS.categories, label: 'Categories', icon: FolderTree, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: PATHS.suppliers, label: 'Suppliers', icon: Truck, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: PATHS.movements, label: 'Movements', icon: ArrowLeftRight, permission: PERMISSIONS.INVENTORY_VIEW },
  { to: PATHS.users, label: 'Users', icon: Users, permission: PERMISSIONS.USERS_MANAGE, badge: PendingCountBadge },
]

const useNavItems = () => {
  const { data: user } = useAuthUser()
  return NAV_ITEMS.filter((item) => !item.permission || (user && hasPermission(user.role, item.permission)))
}

function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold">
      <Boxes className="size-5" />
      Inventory Manager
    </span>
  )
}

interface SidebarContentProps {
  items: NavItem[]
  /** The drawer closes itself through this; it also fires when the link is the current page. */
  onNavigate?: () => void
}

function SidebarContent({ items, onNavigate }: SidebarContentProps) {
  return (
    <>
      <div className="flex h-14 shrink-0 items-center border-b px-4">
        <Link to={APP_HOME} onClick={onNavigate}>
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex flex-col gap-1 p-2">
        {items.map(({ to, label, icon: Icon, badge: ItemBadge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted',
                isActive && 'bg-muted font-medium text-foreground'
              )
            }
          >
            <Icon className="size-4" />
            {label}
            {ItemBadge && <ItemBadge className="ml-auto" />}
          </NavLink>
        ))}
      </nav>
    </>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

function AccountMenu({ user }: { user: AuthUser | null | undefined }) {
  const logout = useLogout()

  if (!user) {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link to="/login">
          <LogIn className="size-4" />
          Log in
        </Link>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2 data-[state=open]:bg-accent"
          aria-label="Account"
        >
          <Avatar size="sm">
            <AvatarFallback className="text-foreground">{initials(user.name)}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline">{user.name}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={PATHS.profile}>
            <UserRound className="size-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Desktop (md and up) left sidebar; below md the same content opens in the top bar's drawer. */
export function AppSidebar() {
  const items = useNavItems()

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-muted/40 md:flex">
      <SidebarContent items={items} />
    </aside>
  )
}

export function AppTopBar() {
  const { data: user } = useAuthUser()
  const items = useNavItems()
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
            <Menu className="size-4" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent items={items} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <Link to={APP_HOME} className="text-base font-semibold md:hidden">
        Inventory Manager
      </Link>

      <div className="ml-auto">
        <AccountMenu user={user} />
      </div>
    </header>
  )
}
