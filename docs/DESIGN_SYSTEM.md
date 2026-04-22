# Constance Conservation — Design System

> Adapted from Wellness Platform design handoff. Tailored for ecological land management dashboards.
>
> Applies to both M04 (Client Dashboard) and M05 (Internal Dashboard).

---

## 1) Design Intent

- Tone: professional, earthy, ecological, trustworthy
- Visual direction: soft neutral surfaces + earthy accent colors (clay, sage, sand)
- UI feel: clean cards, gentle shadows, rounded corners, subtle motion
- Primary interaction color: `clay` (warm brown — connects to earth/land management)
- The design should feel like a well-kept ecological report, not a tech dashboard

### Status Semantics (Constance Conservation)

| Status | Color System | Usage |
|--------|-------------|-------|
| `completed` | sage (green) | Inspection processed, report approved, species confirmed |
| `needs_review` | cooling (amber) | Parsing warnings, data quality flags, pending review |
| `failed` | terracotta (red) | Processing errors, missed inspections, overdue reports |
| `new` / `pending` | steel (blue) | New inspections, draft reports, unprocessed items |

---

## 2) Color System (Exact Tokens)

### Surfaces
- `--color-linen: #FAF8F5;` — page background
- `--color-cream: #F5EFE9;` — sidebar, secondary surfaces
- `--color-white: #FFFFFF;` — cards, modals
- `--color-sand: #F3EDE7;` — borders, dividers

### Text
- `--color-espresso: #2D2A26;` — primary text, headings
- `--color-umber: #5C5549;` — body text, secondary content
- `--color-taupe: #8A8178;` — metadata, labels, placeholders
- `--color-stone: #B8AFA5;` — disabled states, subtle text

### Brand / Accent
- `--color-clay: #B07D4F;` — primary actions, links, active states
- `--color-clay-hover: #9A6B3F;` — hover state for clay
- `--color-amber: #D4A574;` — secondary accent
- `--color-caramel: #C49A6C;` — gradient accent

### Status Colors
- `--color-sage: #7C9A72;` — completed/success (green)
- `--color-sage-bg: #F0F5EE;` — success background
- `--color-cooling: #D4A574;` — needs review/warning (amber)
- `--color-cooling-bg: #FDF6EE;` — warning background
- `--color-terracotta: #C47069;` — failed/error (red)
- `--color-terracotta-bg: #FDF0EE;` — error background
- `--color-steel: #6B8CA3;` — new/pending (blue)
- `--color-steel-bg: #EEF3F6;` — pending background

### Gradient
- `--gradient-hero: linear-gradient(135deg, #2D2A26 0%, #5C5549 50%, #C49A6C 100%);`

---

## 3) Elevation, Radius, Effects

### Shadows (brown-tinted, never cool gray)
- `--shadow-sm: 0 1px 2px rgba(45, 42, 38, 0.04);`
- `--shadow-md: 0 2px 8px rgba(45, 42, 38, 0.06), 0 1px 2px rgba(45, 42, 38, 0.04);`
- `--shadow-lg: 0 4px 16px rgba(45, 42, 38, 0.08), 0 2px 4px rgba(45, 42, 38, 0.04);`
- `--shadow-xl: 0 8px 32px rgba(45, 42, 38, 0.12), 0 2px 8px rgba(45, 42, 38, 0.06);`
- `--shadow-hover: 0 4px 20px rgba(45, 42, 38, 0.10), 0 2px 6px rgba(45, 42, 38, 0.05);`

### Radius
- `--radius-sm: 6px;`
- `--radius-md: 10px;`
- `--radius-lg: 14px;`
- `--radius-xl: 20px;`
- `--radius-full: 9999px;`

### Glass Morphism
- `--glass-bg: rgba(255, 255, 255, 0.08);`
- `--glass-border: rgba(255, 255, 255, 0.15);`
- `--glass-blur: 20px;`

---

## 4) Typography System

### Font Families
- Primary sans: `DM Sans` → `--font-sans`
- Secondary serif accent: `Instrument Serif` (normal + italic) → `--font-serif`

### Type Usage Patterns
| Usage | Size | Weight | Color |
|-------|------|--------|-------|
| Page title | `text-xl` / `text-2xl` | `font-semibold` | `text-espresso` |
| Section title | `text-lg` | `font-semibold` | `text-espresso` |
| Card label / eyebrow | `text-xs` | `font-medium uppercase tracking-wide` | `text-taupe` |
| Body text | `text-sm` | normal | `text-umber` / `text-espresso` |
| Support text / metadata | `text-xs` | normal | `text-taupe` |
| Hero brand text | — | `font-serif italic` | — |
| Numeric KPI values | `text-2xl` | `font-semibold` | `tabular-nums` |

### Number Alignment Rule
Any metrics, counts, hours, or timestamps must use `.tabular-nums`.

---

## 5) Spacing & Layout Rhythm

### Page Containers
- Dashboard wrapper: `p-4 md:p-6 lg:p-8`
- Max widths: `max-w-7xl` (dashboards), `max-w-5xl` (table pages), `max-w-4xl` (forms)

### Common Spacing
- Section stack: `space-y-6` (primary), `space-y-4` (secondary)
- Card internals: `p-5`
- Header rows: `px-5 py-4` with `border-b border-sand`
- Buttons: `px-4 py-2` to `py-2.5` (standard), `px-3 py-1.5` (chip)

### Grid Patterns
- KPI row: `grid-cols-2 lg:grid-cols-5` or `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`
- Two-column: `grid-cols-1 lg:grid-cols-2` or `md:grid-cols-2`

---

## 6) Status Mapping — Constance Conservation

### Pipeline Status → UI Status

| `processing_status` | UI Status | Color System |
|---------------------|-----------|-------------|
| `completed` | Completed | sage |
| `needs_review` | Needs Review | cooling |
| `failed` | Failed | terracotta |
| `pending` / `processing` | Processing | steel |

### Report Status → UI Status

| `report_status` | UI Status | Color System |
|-----------------|-----------|-------------|
| `approved` / `sent` | Approved | sage |
| `review` | In Review | cooling |
| `draft` | Draft | steel |

### Color usage by status:
- sage: `bg-sage`, `bg-sage-bg`, `text-sage`
- cooling: `bg-cooling`, `bg-cooling-bg`, `text-cooling`
- terracotta: `bg-terracotta`, `bg-terracotta-bg`, `text-terracotta`
- steel: `bg-steel`, `bg-steel-bg`, `text-steel`

---

## 7) Component Recipes

### Primary Card
`bg-white rounded-[var(--radius-lg)] p-5 shadow-sm`

### Interactive Metric Card
`bg-white rounded-[var(--radius-lg)] p-5 shadow-sm card-hover`

### Alert Card (Needs Attention)
`bg-cooling-bg border-l-3 border-cooling rounded-[var(--radius-lg)] p-5`

### Error Card
`bg-terracotta-bg border-l-3 border-terracotta rounded-[var(--radius-lg)] p-5`

### Modal Container
`bg-white rounded-[var(--radius-xl)] shadow-xl p-6`

### Section Shell
`bg-white rounded-xl border border-sand p-5`

### Pill / Badge
`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium`

### Sidebar
- Container: `bg-cream border-r border-sand`
- Active item: `bg-white text-espresso font-medium shadow-sm`
- Inactive item: `text-umber hover:bg-sand/60 hover:text-espresso`

### Bottom Mobile Nav
`fixed bottom-0 left-0 right-0 bg-white border-t border-sand`

---

## 8) Buttons, Inputs, States

### Primary Button
- `bg-clay text-white hover:bg-clay-hover rounded-[var(--radius-md)] text-sm font-medium`
- Disabled: `disabled:opacity-50`

### Secondary Button
- `border border-sand text-umber hover:bg-cream rounded-[var(--radius-md)] text-sm font-medium`

### Input / Textarea
- `border border-sand bg-linen text-espresso rounded-[var(--radius-md)] px-3 py-2.5 text-sm`
- Focus: `focus:border-clay focus:ring-1 focus:ring-clay focus:outline-none`
- Placeholder: `placeholder-taupe`

### Chip Toggle
- Selected: `bg-clay text-white`
- Unselected: `bg-linen text-umber border border-sand hover:bg-cream`

---

## 9) Motion & Interaction

- Transitions: `transition-colors` (general), `0.2s ease` timing
- Card hover: `.card-hover` class — `translateY(-1px)` + `shadow-hover`
- Content loading: gentle opacity fade-in, no aggressive animation

---

## 10) Tailwind v4 Global CSS (Copy/Paste)

```css
@import "tailwindcss";

:root {
  --color-linen: #faf8f5;
  --color-cream: #f5efe9;
  --color-white: #ffffff;
  --color-sand: #f3ede7;

  --color-espresso: #2d2a26;
  --color-umber: #5c5549;
  --color-taupe: #8a8178;
  --color-stone: #b8afa5;

  --color-clay: #b07d4f;
  --color-clay-hover: #9a6b3f;
  --color-amber: #d4a574;
  --color-caramel: #c49a6c;

  --color-sage: #7c9a72;
  --color-sage-bg: #f0f5ee;
  --color-cooling: #d4a574;
  --color-cooling-bg: #fdf6ee;
  --color-terracotta: #c47069;
  --color-terracotta-bg: #fdf0ee;
  --color-steel: #6b8ca3;
  --color-steel-bg: #eef3f6;

  --shadow-sm: 0 1px 2px rgba(45, 42, 38, 0.04);
  --shadow-md: 0 2px 8px rgba(45, 42, 38, 0.06), 0 1px 2px rgba(45, 42, 38, 0.04);
  --shadow-lg: 0 4px 16px rgba(45, 42, 38, 0.08), 0 2px 4px rgba(45, 42, 38, 0.04);
  --shadow-xl: 0 8px 32px rgba(45, 42, 38, 0.12), 0 2px 8px rgba(45, 42, 38, 0.06);
  --shadow-hover: 0 4px 20px rgba(45, 42, 38, 0.1), 0 2px 6px rgba(45, 42, 38, 0.05);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  --glass-bg: rgba(255, 255, 255, 0.08);
  --glass-border: rgba(255, 255, 255, 0.15);
  --glass-blur: 20px;

  --gradient-hero: linear-gradient(135deg, #2d2a26 0%, #5c5549 50%, #c49a6c 100%);
}

@theme inline {
  --color-linen: var(--color-linen);
  --color-cream: var(--color-cream);
  --color-sand: var(--color-sand);
  --color-espresso: var(--color-espresso);
  --color-umber: var(--color-umber);
  --color-taupe: var(--color-taupe);
  --color-stone: var(--color-stone);
  --color-clay: var(--color-clay);
  --color-clay-hover: var(--color-clay-hover);
  --color-amber: var(--color-amber);
  --color-caramel: var(--color-caramel);
  --color-sage: var(--color-sage);
  --color-sage-bg: var(--color-sage-bg);
  --color-cooling: var(--color-cooling);
  --color-cooling-bg: var(--color-cooling-bg);
  --color-terracotta: var(--color-terracotta);
  --color-terracotta-bg: var(--color-terracotta-bg);
  --color-steel: var(--color-steel);
  --color-steel-bg: var(--color-steel-bg);
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-hover: var(--shadow-hover);
  --radius-sm: var(--radius-sm);
  --radius-md: var(--radius-md);
  --radius-lg: var(--radius-lg);
  --radius-xl: var(--radius-xl);
  --radius-full: var(--radius-full);
}

body {
  background: var(--color-linen);
  color: var(--color-espresso);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

.glass {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.card-hover {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card-hover:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-hover);
}
```

---

## 11) Font Setup (Next.js)

```tsx
import { DM_Sans, Instrument_Serif } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
});

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-serif',
});

// Apply to body:
// className={`${dmSans.variable} ${instrumentSerif.variable} font-sans antialiased`}
```

---

## 12) Dependencies

- `tailwindcss` (v4)
- `@tailwindcss/postcss`
- `clsx` + `tailwind-merge` → `cn()` helper
- `framer-motion` (animation)
- `recharts` (charts for dashboards)

### cn() helper

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

## 13) Dashboard-Specific Component Mapping

### Internal Dashboard (M05) — Key Views

| View | Primary Components | Data Source |
|------|-------------------|-------------|
| Inspection Feed | Table with status pills, row click → detail | `inspections` + child tables |
| Pipeline Health | KPI cards (processed/review/failed), line chart | `inspections.processing_status` |
| Site Overview | Card grid per site, hours/species summary | `inspections` grouped by `site_id` |
| Staff Hours | Table with staff × hours, sparklines | `inspection_personnel` |
| Sync Status | Single card with last sync time, total count | `sync_state` |

### Client Dashboard (M04) — Key Views

| View | Primary Components | Data Source |
|------|-------------------|-------------|
| Report Archive | Card list of generated reports with status | `client_reports` |
| Site Progress | Density trend chart, hours vs contract | `report_weed_works` + `client_contracts` |
| Photo Gallery | Grid of inspection photos | `inspection_media` |
| Contact Info | Static card | `clients` + `client_stakeholders` |
