# Design System

> Reference: https://ai.fronthooks.ir/app (screenshots in `docs/design/`)
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

| Token                                  | Value            | ≈ Hex   | Tailwind class                          | Usage                                |
| -------------------------------------- | ---------------- | ------- | --------------------------------------- | ------------------------------------ |
| `--background`                         | oklch(1 0 0)     | #ffffff | `bg-background`                         | page background                      |
| `--foreground`                         | oklch(0.145 0 0) | #0a0a0a | `text-foreground`                       | main text                            |
| `--card`                               | oklch(1 0 0)     | #ffffff | `bg-card`                               | cards, tables                        |
| `--primary`                            | oklch(0.205 0 0) | #171717 | `bg-primary`                            | primary buttons only                 |
| `--primary-foreground`                 | oklch(0.985 0 0) | #fafafa | `text-primary-foreground`               | text on primary                      |
| `--secondary` / `--muted` / `--accent` | oklch(0.97 0 0)  | #f5f5f5 | `bg-secondary`, `bg-muted`, `bg-accent` | badges, tab lists, hover, active nav |
| `--muted-foreground`                   | oklch(0.556 0 0) | #737373 | `text-muted-foreground`                 | subtitles, SKU, dates, helper text   |
| `--border` / `--input`                 | oklch(0.922 0 0) | #e5e5e5 | `border`, `border-input`                | all borders                          |
| `--ring`                               | oklch(0.708 0 0) | #a1a1a1 | `ring-ring`                             | focus ring                           |
| `--destructive`                        | shadcn default   | red     | `bg-destructive`, `text-destructive`    | delete, errors                       |

Dark-mode values come from shadcn's neutral `.dark` block in `globals.css`. Do not hand-write them.

### 2.2 Status colors (the only exception to monochrome)

- **Stock status** (`features/products/components/StockStatusBadge.tsx`, every product gets one): a soft tint with a `size-1.5` dot in the text color, `rounded-md font-medium`. **In stock** is `success` (`bg-emerald-50 text-emerald-700`), **Low stock** is `warning` (`bg-amber-50 text-amber-700`), **Out of stock** is `destructive`. Each has a dark pair (`dark:bg-*-950 dark:text-*-400`), defined once in `components/ui/badge.tsx`.
- **Movement type** (`features/movements/components/MovementTypeBadge.tsx`): `rounded-md font-medium` with an icon. Receive is `success` with `ArrowDownToLine`, Ship is `info` (`bg-sky-50 text-sky-700`) with `ArrowUpFromLine`, and Adjustment is a muted `secondary` with `SlidersHorizontal`.
- **Error / destructive:** the `destructive` token. The `destructive` Button and Badge variants are a soft tint (`bg-destructive/10 text-destructive`, as in shadcn's Base UI registry), never solid red with white text.
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

| Need                                            | Component & variant                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------- |
| Main action ("Add product", "Sign in")          | `Button` default, with an optional leading lucide icon (`Plus`)         |
| Secondary action, pagination, steppers          | `Button variant="outline"`; use `size="icon"` for icon-only buttons     |
| Row actions (edit, history, move), header icons | `Button variant="ghost" size="icon"`                                    |
| Text fields                                     | `Input` + `Label` (label above, `gap-2`)                                |
| Search                                          | `Input` with a leading `Search` icon (absolute, `pl-8`)                 |
| Filters                                         | `Select` (all on one row with the search; the search uses `flex-1`)     |
| Mode switch (Sign in / Sign up)                 | `Tabs` + `TabsList` (full width)                                        |
| Category                                        | `Badge variant="secondary"`                                             |
| Role                                            | `Badge variant="outline"`                                               |
| Lists of records                                | `Table` wrapped in `rounded-xl border` (see below)                      |
| Dialogs and forms in a popup                    | `Dialog`; use `AlertDialog` for destructive confirmation                |
| Notifications                                   | `sonner` toast                                                          |
| Empty and loading states                        | `Skeleton`; for empty, use muted text centered inside the table or card |

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

### Products table (`client/src/features/products`, `docs/design/products.png`)

- Above the table: Active / Archived `Tabs`, then one toolbar row (stacks full width below `lg`): the search `Input` (`flex-1`, "Search title or SKU…"), Category, Supplier ("All suppliers" and "Unassigned" above a separator) and Stock status (`All stock` / In / Low / Out of stock) selects (`lg:w-44`, `h-9`), and a ghost "Clear filters" (`X`) while any filter is set. Tab, filters, sort and page live in the URL.
- A TanStack Table v9 (`useTable` + `tableFeatures`, features and columns at module scope) rendered into the shadcn `Table`, wrapper `rounded-xl border bg-card overflow-x-auto`. Title, Cost, Sale, Quantity and Created (muted date) sort on the server: the header is a button with the sort icon (§ Table pattern) and `aria-sort`; numbers and dates sort highest/newest first on the first click.
- The first cell is a `size-10 rounded-md border` thumbnail (the image, or a `bg-muted` box with a muted `ImageIcon` placeholder) beside the title (`font-medium`) with the SKU under it (`text-xs text-muted-foreground`), as on the Movements page; there is no SKU column. Empty and error states use the shared `components/ListMessage` box.
- A checkbox column comes first: a select-all for the page in the header (indeterminate when some rows are checked) and one per row; a selected row gets `bg-muted`. Above the table, on the left, a muted "N of M selected" line (only while something is selected); on the right, an `outline` `sm` "Columns" button (`Settings2` + `ChevronDown`) opens a `DropdownMenu` of `DropdownMenuCheckboxItem`s, one per column that can be hidden (all but select, Title and Actions). It stays open while you toggle, and the choice is kept in the viewer's `localStorage`. A new page, filter, sort or tab clears the selection.
- Category as a `secondary` badge; a product without a supplier shows an `outline` muted "Unassigned" badge. Prices and quantity right-aligned, `tabular-nums`. The quantity shows its unit (`4 pcs`, the unit muted) between the inline −/+ buttons. A separate Stock column holds the stock-status badge (§2.2). There is no Status column: the Active / Archived tabs say which is which.
- Actions column: ghost icon buttons, right-aligned; Edit (`Pencil`, for `PRODUCTS_WRITE`, archived rows included) opens the product dialog in edit mode; Adjust stock (`ArrowLeftRight`) opens the Adjust Stock dialog (`sm:max-w-lg`): "T-Shirt · 0 pcs on hand" as the description. Then a "Movement" row of three equal-width buttons, Receive / Ship / Adjustment (`default` for the chosen one, `outline` for the others, `aria-pressed`), with a muted one-line description of the chosen movement under it. Adjustment adds a "Direction" row, Increase / Decrease, and a muted bullet list of when to use the chosen direction. Every movement then has "Quantity (<unit>)", a positive whole number (the direction gives an adjustment its sign), and a single-line note input with a placeholder ("Reason", required, on Adjustment; "Note (optional)" otherwise). Below them is "On hand after: **N** <unit>", previewed live, and a footer with Cancel and a submit button named for the action. An amount that would take stock below 0 shows an amber note (the `warning` badge colors) under the input; it warns, the server refuses.
- Archive (`Archive`) on active rows / Unarchive (`ArchiveRestore`) on archived ones, behind `PRODUCTS_ARCHIVE`, and Delete (`Trash2`), behind `PRODUCTS_DELETE`, come last and confirm in an `AlertDialog`: archiving names the on-hand units that will leave the stock value (`font-medium`, foreground); a refused delete switches the same dialog to "This product has stock history" with the movement count, a "Close" button and "Archive instead". If the product is archived while Adjust Stock is open, the dialog stays open with the reason (destructive-bordered `role="alert"`) above the Movement buttons and every submit disabled.
- Stock history (`History`, on every row, archived ones included) opens the Stock History dialog (`sm:max-w-3xl`, scrolls when tall): the product and its on-hand count in the description, then a bordered table of Date (date and time, muted), Type (the movement type badge, §2.2), Change (signed `+5` / `−3`, right-aligned, `font-medium`), After (right-aligned), Note (muted, `—` when empty) and By, newest first, with the pagination row below. Loading is skeleton rows; empty and error use the `ListMessage` box.
- The create dialog (`sm:max-w-lg`, scrolls when tall): Title, SKU (hint: saved in capitals), then a two-column grid of Category / Supplier (optional, a "No supplier" item) selects, Cost / Sale price and the Unit select, then the optional Image URL. There is no quantity field. Edit mode is the same form, prefilled, titled "Edit product" with a "Save" button. On the Category and Supplier label rows a small `link` button "+ New category" / "+ New supplier" (behind `CATEGORIES_WRITE` / `SUPPLIERS_WRITE`) opens the Phase 2 form dialog over it; what it saves is selected.

### Stock movements page (`client/src/features/movements`)

- `/app/movements`: H1 "Stock movements" + muted subtitle, no primary action (read-only). A toolbar row (stacks full width below `lg`): the product picker (`flex-1`), the type `Select` (`lg:w-44`, `h-9` to match the buttons), the date-range button (`lg:w-64`), and a ghost "Clear filters" (`X`) while any filter is set.
- **Product picker:** an outline button with `role="combobox"` ("All products" muted, or the picked title; `ChevronsUpDown`) opening a `Popover` as wide as the button, holding a `Command` with a search input ("Search title or SKU…"). The server searches (`shouldFilter={false}`); items show the title with the SKU muted on the right and a `Check` on the picked one; "All products" heads the list while the search is empty.
- **Date range:** an outline button with a `CalendarIcon` ("Any date" muted, or "Oct 1 – 5, 2026") opening a `Popover` (`p-0`) with a two-month `Calendar` in range mode; future days are disabled. One picked day means that one day.
- The table is the Stock History table across products, plus a Product column (title `font-medium`, the SKU `text-xs text-muted-foreground` under it, a `secondary` "Archived" badge beside archived ones). Pagination below; skeleton rows while loading; the `ListMessage` box for empty ("No stock movements yet." / "No movements match these filters.") and error.

### Card grid pattern (Categories, Suppliers; `client/src/features/catalog`)

- Page header (H1 + muted subtitle, primary "Add …" on the right for staff and admins), then one row with the search `Input` (`flex-1`, leading `Search` icon) and a "Sort by" `Select` (`sm:w-48`).
- Grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`, 12 cards a page, the table's pagination row below it.
- Card: `CardTitle` with ghost icon buttons in `CardAction` (no menu): `Pencil` Edit for staff and admins, `Trash2` Delete (`text-destructive`) for admins only. Each has an `aria-label` with the record name ("Edit Electronics"). Body `text-sm`; long text `line-clamp-3 text-muted-foreground`; supplier details as lines with a muted `size-4` lucide icon. Footer `text-xs text-muted-foreground`: "Created Oct 16, 2026" on the left, "N products" on the right.
- Loading: six `Skeleton h-40 rounded-xl` in the grid. Empty and error: muted text centered in a `rounded-xl border p-8` box.
- Delete confirms in an `AlertDialog`; when the server refuses (in use), the same dialog switches to "Used by products" with the reason and a link, and only a "Close" button.

### Table with phone cards (Users; `client/src/features/users`)

- From `sm` up, the table pattern (wrapper `hidden sm:block`). Below `sm`, the same rows as a `space-y-3` list of `Card`s (`sm:hidden`), one per record, each an `article` named by its title.
- Card: `CardTitle` name, muted email (`break-all`) below it; the status and role badges in a wrapping row; the dates as a two-column `dl` (muted labels). The row's action buttons go in the `CardFooter` as `grid auto-cols-fr grid-flow-col gap-2`, so they share the full width equally; the footer is hidden when there are no actions. When Activate / Reactivate is disabled because the email is unverified, a muted `text-xs` line in the card body says why (a tooltip never opens on a tap).
- One actions component renders the buttons, confirmations and tooltips for both the row and the card. Toolbar controls stack full width below `lg`.

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
