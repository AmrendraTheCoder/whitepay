# @whitepay/ui

Design tokens and accessible React components shared by **wondrpay.vercel.app** (theme `ink`) and the
**Chai & Co. demo store** (theme `chai`). One spacing, radius and type scale everywhere. No inline styles,
no emoji icons, no one-off colours.

## Architecture

```
packages/ui/src
├── tokens.css      primitives (space, radius, type, motion) + semantic colour tokens per theme
├── styles.css      every component's CSS; reads ONLY semantic tokens
├── Icon.tsx        24px stroke icon set (replaces emoji)
├── Layout.tsx      Container, Section, SectionHeader, Grid, Cluster           server
├── Display.tsx     Badge, Card, Stat/Stats, CheckList, CodeBlock               server
├── ButtonLink.tsx  <a> styled as a button                                      server
├── Feedback.tsx    Spinner, Skeleton, VisuallyHidden                           server
├── Accordion.tsx   native <details>, works without JS                          server
├── Button.tsx      Button, IconButton (loading, aria-disabled)                 client
├── Overlay.tsx     Drawer, Dialog on native <dialog>                           client
├── Tabs.tsx        WAI-ARIA tabs with roving tabindex                          client
├── Toast.tsx       ToastProvider + useToast, top-layer live region             client
└── Stepper.tsx     QuantityStepper                                             client
```

**Rules**

1. **Tokens, not values.** Components use `--space-*`, `--radius-*` (only 4), `--text-*` (9 steps) and semantic
   colours (`--c-bg`, `--c-surface`, `--c-text-muted`, `--c-accent`, `--c-highlight`…). A theme is just a block of
   semantic overrides under `[data-theme="…"]`.
2. **Server first.** Anything without state renders on the server and ships no JavaScript. Only `Button`, `Drawer`,
   `Dialog`, `Tabs`, `Toast` and `QuantityStepper` are client components.
3. **Variants are data attributes** (`data-variant`, `data-size`, `data-tone`), so CSS stays flat and the DOM is
   easy to inspect and test.
4. **Use the platform.** `<dialog>` gives focus trapping, Escape, an inert background and focus return. `<details>` gives
   a keyboard-accessible accordion that find-in-page can open. The Popover API keeps toasts above open dialogs.

## Setup

```tsx
// app/layout.tsx
import "@whitepay/ui/styles.css"
export default function Layout({ children }) {
  return <body data-theme="ink">{children}</body>   // or "chai"
}
```

Add `"@whitepay/ui"` to `transpilePackages` in `next.config.ts`.

## Components

### Button / ButtonLink / IconButton

| Prop | Type | Default | Notes |
|---|---|---|---|
| `variant` | `"primary" \| "highlight" \| "secondary" \| "ghost"` | `primary` | `highlight` = the one main CTA per view |
| `size` | `"sm" \| "md" \| "lg"` | `md` | 36 / 44 / 52 px tall (44 px meets touch-target guidance) |
| `iconLeft`, `iconRight` | `IconName` | – | |
| `fullWidth` | `boolean` | `false` | |
| `loading` (Button) | `boolean` | `false` | spinner, keeps width, `aria-busy`, blocks clicks |
| `disabled` (Button) | `boolean` | `false` | uses `aria-disabled` so the button stays focusable and announced |
| `href` (ButtonLink) | `string` | – | stays a real link: middle-click and new tab work |
| `external` (ButtonLink) | `boolean` | auto for `http(s)` | adds `target=_blank`, `rel=noopener noreferrer`, an arrow icon and "(opens in a new tab)" for screen readers |
| `label` (IconButton) | `string` | **required** | there's no visible text, so the label is the accessible name |

```tsx
<Button loading={saving} onClick={save}>Save changes</Button>
<ButtonLink href="/business" variant="secondary" iconRight="arrowRight">Accept payments</ButtonLink>
<IconButton icon="close" label="Close bag" onClick={close} />
```

### Icon
`name: IconName`, `size = 20`, `label?`. Without `label` the icon is decorative (`aria-hidden`); with it, `role="img"`.

### Layout: Section, SectionHeader, Grid, Cluster, Container

```tsx
<Section tone="muted" aria-labelledby="faq">
  <SectionHeader id="faq" eyebrow="FAQ" title="Questions, answered." description="…" actions={<ButtonLink …/>} />
  <Grid cols={3}>{cards}</Grid>
</Section>
```
`SectionHeader`: `level` 1 | 2 (page head vs section), `align` start | center, `split` (description beside the title).
`Grid`: `cols` 2 | 3 | 4, collapsing to 2 and then 1 column; `as="ol"` for ordered steps.

### Card, Badge, Stat, CheckList, CodeBlock

```tsx
<Card icon="shield" title="Verified shops" level={3}><p>…</p></Card>
<Badge tone="success" dot>Operational</Badge>
<Stats label="Live network"><Stat value={block} label="Latest block" live /><Stat value={null} label="Receipts" /></Stats>
<CheckList items={[<><b>Counter QR</b> with a live screen</>, "Refunds and CSV export"]} />
<CodeBlock code={snippet} label="Checkout example" />
```
`Stat`: `loading` shows a skeleton. `value={null}` (for example an RPC timeout) shows "—" with "unavailable" for screen readers.

### Accordion
`items: { id, title, content }[]`, `defaultOpen?: string[]`, `exclusive?` (one open at a time).

### Drawer / Dialog

| Prop | Type | Notes |
|---|---|---|
| `open`, `onClose` | `boolean`, `() => void` | controlled. Escape, the close button and a backdrop click all call `onClose` |
| `title` | `ReactNode` | rendered as `h2` and wired to `aria-labelledby` |
| `description` | `ReactNode` | wired to `aria-describedby` |
| `footer` | `ReactNode` | sticky action area (for example the cart total and the pay button) |
| `side` (Drawer) | `"left" \| "right"` | |
| `dismissible` | `boolean = true` | set to `false` for flows that must not be lost on an accidental click |
| `theme` | `"ink" \| "chai"` | render with a different theme than the page |

The slide-in animation ends with no `transform`, so `position: fixed` children (for example the checkout SDK's QR
modal) still position against the viewport.

```tsx
<Drawer open={bagOpen} onClose={() => setBagOpen(false)} title="Your bag" footer={<Total …/>}>{lines}</Drawer>
```

### Tabs
`items: { id, label, badge?, content }[]`, `label` (required accessible name), `defaultTab?`, `onChange?`.
Arrow keys, Home and End move between tabs, and only the active tab is in the tab order.

### Toast

```tsx
<ToastProvider>{app}</ToastProvider>
const toast = useToast()
toast.show({ message: "Added to your bag", tone: "success", action: { label: "View bag", onClick: openBag } })
```
A polite live region, at most 3 at a time, auto-dismissed after 3.5 s (`duration: 0` makes it sticky). The API
object is stable, so it is safe in effect dependencies.

### QuantityStepper
`value`, `onChange`, `min = 0`, `max = 10`, `label` (required: "Decrease Masala Chai Kit quantity"), `size`.
The value is clamped, the edge buttons are disabled, and changes are announced through `<output aria-live>`.

## Accessibility checklist (every component)
- Visible `:focus-visible` ring from `--focus-ring`; no `outline: none` without a replacement.
- Icons are decorative unless labelled; icon-only buttons require `label`.
- Dialogs and drawers trap focus, close on Escape and restore focus (native `<dialog>`).
- Live regions: toasts (`status`), the stepper value (`output`), the developer log (`log`), status checks.
- `prefers-reduced-motion` turns off every animation and transition.
- Contrast: text on `--c-surface` stays at or above 4.5:1 in both themes.
