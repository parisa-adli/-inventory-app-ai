# Design System

> Reference: inventory-app-claude.vercel.app (screenshots in `docs/design/`)
> Stack: shadcn/ui (style: new-york, base color: neutral) + Tailwind CSS + lucide-react icons

This file is the single source of truth for UI. Every page and component must follow it.
Tokens live in `app/globals.css` (shadcn CSS variables). **Use the semantic Tailwind classes below, never raw hex values.**

---

## 1. Design language

- **Vibe:** monochrome, minimal, neutral grays, generous whitespace.
- **Theme:** light by default, with dark mode support (theme toggle in the top bar). Every UI must work in both modes. This works automatically if you use only semantic tokens.
- **Depth:** almost flat. Use borders to separate surfaces. Use shadows only at shadcn's defaults: `shadow-xs` on inputs and outline buttons, `shadow-sm` on the active tab and on popovers.
- **Color:** the only strong color is the near-black primary. Everything else is gray. The one exception is status colors (see §2.2).

## 2. Color

### 2.1 Tokens (shadcn neutral, light mode)

| Token | Value | ≈ Hex | Tailwind class | Usage |
|---|---|---|---|---|
| `--background` | oklch(1 0 0) | #ffffff | `bg-background` | page background |
| `--foreground` | oklch(0.145 0 0) | #0a0a0a | `text-foreground` | main text |
| `--card` | oklch(1 0 0) | #ffffff | `bg-card` | cards, tables |
| `--primary` | oklch(0.205 0 0) | #171717 | `bg-primary` | primary buttons only |
| `--primary-foreground` | oklch(0.985 0 0) | #fafafa | `text-primary-foreground` | text on primary |
| `--secondary` / `--muted` / `--accent` | oklch(0.97 0 0) | #f5f5f5 | `bg-secondary`, `bg-muted`, `bg-accent` | badges, tab lists, hover, active nav |
| `--muted-foreground` | oklch(0.556 0 0) | #737373 | `text-muted-foreground` | subtitles, SKU, dates, helper text |
| `--border` / `--input` | oklch(0.922 0 0) | #e5e5e5 | `border`, `border-input` | all borders |
| `--ring` | oklch(0.708 0 0) | #a1a1a1 | `ring-ring` | focus ring |
| `--destructive` | shadcn default | red | `bg-destructive`, `text-destructive` | delete, errors |

Dark-mode values come from shadcn's neutral `.dark` block in `globals.css`. Do not hand-write them.

### 2.2 Status colors (the only exception to monochrome)

- **Low stock:** a soft amber badge, e.g. `bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400`.
- **Out of stock:** an `outline` badge with `text-muted-foreground`, not red.
- **Error / destructive:** the `destructive` token.
- If you need a new status color, define it once as a Badge variant. Do not scatter it across pages.

## 3. Typography

- **Font:** Geist Sans (`next/font`), with Geist Mono for code and credentials.
- **Page title (H1):** `text-2xl font-semibold tracking-tight` (24px / 600).
- **Card or section title:** `text-lg font-semibold` (18px), or the shadcn `CardTitle` default.
- **Body / UI text:** `text-sm` (14px / 400, line-height 20px). This is the default size of the whole app.
- **Small / meta text:** `text-xs` (12px) for badges, SKU and footnotes.
- **Weights:** use only 400, 500 (labels, buttons, table headers) and 600 (titles). Never use 700.

## 4. Spacing, radius, layout

- **Spacing:** the Tailwind 4px scale. Common values are `gap-2` (8), `gap-3` (12), `gap-4` (16), `p-6` (24) and `py-8` (32). Do not use arbitrary values like `p-[13px]`.
- **Radius:** `--radius: 0.625rem` (10px). Use only shadcn's derived classes:
  - `rounded-md` for buttons, inputs and selects.
  - `rounded-xl` for cards and the table wrapper.
  - `rounded-full` for badges and chips.
  - Never use arbitrary radius values.
- **App shell:** a left sidebar plus a top bar (see `docs/design/dashboard.png`; built in `client/src/app/layouts/AppNav.tsx`).
  - Sidebar: `w-64`, `border-r bg-muted/40`, full height and sticky. On top, a 56px logo row (`h-14 border-b`): the lucide `Boxes` icon + "Inventory Manager", `text-lg font-semibold`, linking home.
  - Nav links stack vertically below it, each with a `size-4` lucide icon: `gap-3 rounded-md px-3 py-2 text-sm text-foreground`, hover `bg-muted`. Inactive links use the same text color as the active one; the active link is set apart by `bg-muted font-medium`.
  - Top bar: `h-14 border-b`. On the right is one account control (see `docs/design/avatar.png`): a ghost button with an initials `Avatar`, the name and a `ChevronDown`, which gets `bg-accent` while open. It opens a `DropdownMenu` with the email (muted), a separator, then Profile (`UserRound`) and Sign out (`LogOut`). Signed out, it shows a ghost "Log in" link with a `LogIn` icon. The theme toggle is not built yet.
  - Below `md`: the sidebar is hidden. The top bar shows a ghost `Menu` icon button, the "Inventory Manager" text (`text-base font-semibold`, no icon, links home) and the account control (avatar only). The same sidebar content opens in a left `Sheet` (`w-72`), which closes on navigation, backdrop click and Escape.
- **Content container:** `mx-auto max-w-5xl px-4 py-8`.
- **Page header:** H1 plus a muted subtitle (`text-sm text-muted-foreground`) on the left, and the primary action on the right (`flex items-start justify-between`).
- **Auth pages:** a single centered `Card` (`max-w-sm w-full`).
  - The logo sits in the top-left of the card. The title and description are centered.
  - `Tabs` switch between Sign in and Sign up.
  - A full-width primary button sits at the bottom.

## 5. Components (use shadcn, add with `npx shadcn@latest add <name>`)

| Need | Component & variant |
|---|---|
| Main action ("Add product", "Sign in") | `Button` default, with an optional leading lucide icon (`Plus`) |
| Secondary action, pagination, steppers | `Button variant="outline"`; use `size="icon"` for icon-only buttons |
| Row actions (edit, history, move), header icons | `Button variant="ghost" size="icon"` |
| Text fields | `Input` + `Label` (label above, `gap-2`) |
| Search | `Input` with a leading `Search` icon (absolute, `pl-8`) |
| Filters | `Select` (all on one row with the search; the search uses `flex-1`) |
| Mode switch (Sign in / Sign up) | `Tabs` + `TabsList` (full width) |
| Category | `Badge variant="secondary"` |
| Role | `Badge variant="outline"` |
| Lists of records | `Table` wrapped in `rounded-xl border` (see below) |
| Dialogs and forms in a popup | `Dialog`; use `AlertDialog` for destructive confirmation |
| Notifications | `sonner` toast |
| Empty and loading states | `Skeleton`; for empty, use muted text centered inside the table or card |

### Table pattern

- The wrapper is `rounded-xl border overflow-hidden`, with row dividers via the default `TableRow` border.
- The header row uses `text-sm font-medium`. Sortable headers include a lucide `ChevronsUpDown`, `ArrowUp` or `ArrowDown` icon.
- Primary cells hold the name (`font-medium`), with a second line for the SKU and description (`text-xs` / `text-sm text-muted-foreground`).
- Numbers (price, quantity) are right-aligned or centered and use `tabular-nums`. Dates are `text-muted-foreground`.
- Quantity editing uses an outline icon button `−`, then the value, then an outline icon button `+`. The `−` button is disabled at 0.
- The Actions column is right-aligned and holds ghost icon buttons (`ArrowLeftRight`, `History`, `Pencil`).
- Pagination sits below the table:
  - On the left: "Showing 1–10 of 98" (muted).
  - On the right: outline Previous/Next buttons with chevrons, and "Page 1 of 10" between them.

### Card grid pattern (Categories, Suppliers; `client/src/features/catalog`)

- Page header (H1 + muted subtitle, primary "Add …" on the right for staff and admins), then one row with the search `Input` (`flex-1`, leading `Search` icon) and a "Sort by" `Select` (`sm:w-48`).
- Grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, 12 cards a page, the table's pagination row below it.
- Card: `CardTitle` with ghost icon buttons in `CardAction` (no menu): `Pencil` Edit for staff and admins, `Trash2` Delete (`text-destructive`) for admins only. Each has an `aria-label` with the record name ("Edit Electronics"). Body `text-sm`; long text `line-clamp-3 text-muted-foreground`; supplier details as lines with a muted `size-4` lucide icon. Footer `text-xs text-muted-foreground`: "Created Oct 16, 2026" on the left, "N products" on the right.
- Loading: six `Skeleton h-40 rounded-xl` in the grid. Empty and error: muted text centered in a `rounded-xl border p-8` box.
- Delete confirms in an `AlertDialog`; when the server refuses (in use), the same dialog switches to "Used by products" with the reason and a link, and only a "Close" button.

### Profile page pattern (`docs/design/profile.png`, `set-password-to-profile.png`, `password-and-telegram-linked.png`)

- `/app/profile`, built in `client/src/features/profile`. H1 "Profile", then three `Card`s stacked with `space-y-6` in a `max-w-2xl` column: Account, Sign-in methods, Active sessions.
- **Account:** the display-name `Input` with a primary "Save" on the same row, disabled until the value changes. Below, "Email" as a label, the address and a `secondary` "Verified" badge (read-only).
- **Sign-in methods:** `CardDescription` "Both reach this same account." One block per method, separated by `border-t`: a label (`text-sm font-medium`) over an `outline` status badge ("Set" / "Not set", "Linked as @handle" / "Not linked") on the left, actions on the right.
  - Password not set: a primary "Add password" that opens an inline form (new password + hint, primary submit, ghost "Cancel").
  - Password set: a ghost "Change password" (inline form: current + new) and an outline "Remove password".
  - Telegram: an outline "Link Telegram" (opens a `Dialog` running the Telegram QR -> code steps) or "Unlink Telegram".
  - The only remaining method's remove button is disabled, with `text-xs text-muted-foreground` under it: "Your only way to sign in — add another before removing it."
- **Active sessions:** one row per session: the device (`text-sm font-medium`) with a default `Badge` "This device" for the current one, and a `text-xs text-muted-foreground` line "IP · Active … · Signed in …". Below the list, a `destructive` "Sign out everywhere".
- Remove password, Unlink Telegram and Sign out everywhere confirm with `AlertDialog` (destructive action button, outline Cancel).

## 6. Rules

**DO**
- Check `components/ui` first; if a component is missing, add it with `npx shadcn@latest add <name>`. Never hand-write a component shadcn provides.
- Build with shadcn components first. Compose them; don't restyle them.
- Use semantic token classes (`bg-primary`, `text-muted-foreground`, `border`), so dark mode works for free.
- Keep one primary button per view. Everything else is outline or ghost.
- Use lucide-react icons only, at `size-4` inside buttons.
- When a new pattern is needed, match the closest screenshot in `docs/design/`, then document the pattern here.

**DON'T**
- Hardcode colors (`#000`, `bg-black`, `text-gray-500`). The status colors in §2.2 are the only exception.
- Introduce new colors, fonts, shadows or radius values.
- Edit `components/ui/*` for one-off styling. Pass a `className` or add a variant instead.
- Use heavy shadows, gradients, or colored backgrounds for surfaces.