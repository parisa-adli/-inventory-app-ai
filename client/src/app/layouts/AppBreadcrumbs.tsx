import { Fragment } from 'react'
import { Link, useMatches } from 'react-router'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { PATHS } from '@/app/paths'

/** A route's `handle`: pages under /app name their breadcrumb here. */
export interface CrumbHandle {
  crumb: string
}

const hasCrumb = (handle: unknown): handle is CrumbHandle =>
  typeof handle === 'object' && handle !== null && typeof (handle as CrumbHandle).crumb === 'string'

/** "Dashboard › <page>" above every page that names a crumb; just "Dashboard" on the dashboard itself. */
export function AppBreadcrumbs() {
  // The deepest route that names a crumb
  const match = useMatches()
    .filter((m) => hasCrumb(m.handle))
    .at(-1)
  if (!match || !hasCrumb(match.handle)) return null

  const trail =
    match.pathname === PATHS.dashboard
      ? [{ label: match.handle.crumb }]
      : [{ label: 'Dashboard', to: PATHS.dashboard }, { label: match.handle.crumb }]

  return (
    <Breadcrumb className="mb-4">
      <BreadcrumbList>
        {trail.map(({ label, to }, i) => (
          <Fragment key={label}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {to ? (
                <BreadcrumbLink asChild>
                  <Link to={to}>{label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
