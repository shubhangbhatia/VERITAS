# Veritas — Design System (LOCKED v2)

> Revised once. This version is final — do not revisit during the build.

## Concept

Real ID cards and passports use holographic foil as their anti-counterfeit
signal — a shifting cyan glint that means "this is authentic." Veritas
borrows that idea directly: **cyan is the "verified" signal**, and it is the
only accent color in the system. Risk severity (low/medium/high) is a
completely separate, functional color language — the two never mix, so
"branded" and "risky" are never visually confused.

This replaces the original indigo/violet accent pair, which was a generic
SaaS-dashboard default with no connection to what the product does.

## Color Palette

```css
--color-bg:            #08090b;   /* near-black ink */
--color-surface:       #101114;   /* card background */
--color-surface-raised:#16171b;   /* the ONE elevated hero surface per screen */
--color-border:        #23252b;   /* hairline dividers — structural, not decorative */
--color-border-strong: #34363f;   /* border on the raised/hero surface only */

--color-accent:        #22d3ee;   /* verify cyan — brand + primary actions ONLY */
--color-accent-dim:    #123a42;   /* tinted background for accent badges */

--color-success:       #22c55e;   /* LOW risk — pure green, distinct hue from accent */
--color-warning:       #f59e0b;   /* MEDIUM risk — amber */
--color-danger:        #ef4444;   /* HIGH risk — red */

--color-text:          #edeef2;   /* primary text — soft white, not pure #fff */
--color-text-muted:    #7a7d87;   /* secondary text */
```

Four risk/accent hues (cyan 189°, green 142°, amber 38°, red 4°) are
deliberately spaced apart on the color wheel so accent and risk are never
mistaken for one another, including for colorblind users — labels always
carry the same information as color, never color alone.

## Typography

Two families, clearly distinct roles — not one generic sans doing everything:

- **Nippo** (300/400/500/600/700) — all UI text, headings, body
- **JetBrains Mono** (400) — identity IDs, timestamps, risk scores, anything
  that is literally data, not prose. This is the "case file" register —
  numbers should look retrieved, not designed.

Import:
```
https://api.fontshare.com/v2/css?f[]=nippo@300,400,500,600,700&display=swap
```

Type scale:
| Use | Size | Weight | Family |
|---|---|---|---|
| Risk score display | 56px | 300 | Nippo |
| Page title | 28px | 600 | Nippo |
| Section title | 18px | 600 | Nippo |
| Body | 14px | 400 | Nippo |
| Data / IDs / timestamps | 13px | 400 | JetBrains Mono |
| Meta / secondary | 12px | 400 | Nippo, muted, sentence case |

No ALL-CAPS labels anywhere. No eyebrow labels above headings. No
middle-dot-joined meta strings ("A · B · C"). No "→" appended to
buttons or links — say what the button does, plainly.

## Layout

Break the uniform grid. An analyst's dashboard has one job — surface what
needs attention — so structure reflects priority, not symmetry:

```
┌─────────────────────────────┬───────────┐
│                             │  Scanned   │
│   High-risk queue           │  High-risk │
│   (large, primary panel)    │  Rings     │
│                             ├───────────┤
│                             │  trend     │
│                             │  sparkline │
└─────────────────────────────┴───────────┘
```

- Use hairline `--color-border` dividers to separate sections — they encode
  structure, not decoration.
- Only **one surface per screen** gets `--color-surface-raised` +
  `--color-border-strong` (the hero element). Everything else stays flat
  `--color-surface`. Uniform elevation on every card is the "SaaS card kit"
  tell — hierarchy comes from restraint, not repetition.
- No gradient washes as background decoration.

## Motion

One orchestrated moment per screen, not scattered hover effects everywhere:

- **Dashboard**: KPI numbers count up once on load (Magic UI `NumberTicker`), nothing else animates on load.
- **Identity Detail**: the risk gauge arc draws in once on open — this is the screen's one moment.
- **Fraud Ring**: cluster nodes settle into position once on open.
- Hover states elsewhere: a simple border-color shift to `--color-accent`, not scale/shadow/glow on every card.
- Respect `prefers-reduced-motion` — disable all of the above for users who request it.

## Component Library Usage (revised — more restrained than v1)

**1. Dashboard shell — Tremor**
KPI cards, DonutChart, AreaChart, layout grid. Tremor ships a default blue
theme — override every color prop to the tokens above. Never leave library
defaults unstyled.

**2. Base components — shadcn/ui**
Table, Tabs, Dialog, Badge, Button, Skeleton. shadcn uses CSS variables for
theming — map them to the palette above directly, don't leave the
zinc/slate defaults.

**3. Signature glow effect — Aceternity UI (ONE component, not three)**
`GlowCard` on the risk score gauge in Identity Detail only — this is the
single most important number in the app, so it's the one thing allowed to
be bold. Drop `3DCard` and `Spotlight` from the required list; add them
only if time remains after Hour 9 and they don't compete with the gauge
for attention.

**4. Micro-interactions — Magic UI (used with restraint)**
- `NumberTicker` — KPI stat counters (functional: shows the count is real, not decorative)
- `ShimmerButton` — reserved for the "Inject Fraud Ring" demo trigger only. No other button gets this treatment, which is what makes it read as the one important action.
- `BorderBeam` — apply only to the single highest-magnitude SHAP factor on the Identity Detail screen, not every explanation card. The other cards stay flat and quiet. Visual weight should match actual importance — that's what makes the explanation section legible instead of decorative.

## Risk Label Colors (unchanged, functional)

| Label  | Color   | Hex       |
|--------|---------|-----------|
| LOW    | Green   | `#22c55e` |
| MEDIUM | Amber   | `#f59e0b` |
| HIGH   | Red     | `#ef4444` |

## Quality Floor (non-negotiable, cheap to get right)

- Responsive down to mobile width
- Visible keyboard focus ring, in `--color-accent`
- `prefers-reduced-motion` respected
- Text contrast checked — `--color-text` on `--color-bg` and `--color-surface` both pass WCAG AA
- Risk level is always shown as color + text label together, never color alone
