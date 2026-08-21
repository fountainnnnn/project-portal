# SP DSAC — Glow-Card Design System

The visual language shared by the Data Science and Analytics Centre's apps.

It was built for **dsac-photo-booth** (an event kiosk) and extended here for
**project-portal** (a desktop web portal). Both read as the same centre because
they share this system rather than a stylesheet copied twice — when the two
disagree, this document says which one is right.

Read this before building a third DSAC app, before adding a component to
either existing one, and before deciding that a screen needs "something a bit
different".

---

## 1. The idea in one paragraph

A near-white page, one red accent, and cards that leak a soft coloured bloom
from one corner. The bloom rotates through three hues so a grid looks varied
without any card being coloured — colour here is atmosphere, never information.
Type is the workhorse: a gradient eyebrow, a light display title ending in a
full stop, one calm line of support. Motion is a single rise-in on entry and
nothing that loops. The result should feel institutional but not municipal —
an SP centre that takes design seriously, not a government form.

---

## 2. Tokens

Every value lives as a CSS custom property in `src/globals.css`. Never hardcode
a hex in a component; if a colour is missing, add a token.

### Surfaces

| Token | Value | Use |
| --- | --- | --- |
| `--shell-bg` | `#eff0f2` | The canvas *behind* white panels — the app shell |
| `--background` | `#f7f6f8` | Page canvas, faintly warm neutral |
| `--surface` | `#ffffff` | Panels, inputs, solid text beds |
| `--card` | `#f8f7fa` | Glow-card base, tinted a hair toward the brand |
| `--stage` | `#0b0a0c` | Deep brand tone for dark bands and photo backdrops |

### Ink

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#17161a` | Display and primary text |
| `--ink-2` | `#53515b` | Secondary copy, body, button labels at rest |
| `--ink-3` | `#a3a1ab` | Hints, meta, timestamps, placeholder |
| `--border` | `#e6e4e9` | Hairlines. One weight only |

### Accent

| Token | Value | Use |
| --- | --- | --- |
| `--accent` | `#e1262f` | SP DSAC red. The single accent |
| `--accent-hover` | `#c11f27` | Hover only |
| `--accent-ink` | `#8f1219` | Red dark enough to *read as text* on light surfaces |

The accent is spent almost entirely on the primary button and the active nav
item. If a screen has two red things competing, one of them is wrong.

### Glow hues

| Token | Value |
| --- | --- |
| `--glow-rose` | `#ff6b73` |
| `--glow-amber` | `#ffa94d` |
| `--glow-iris` | `#7c86f5` |

Pale washes only, at 14% opacity behind a 46px blur. **Never fills.** These are
the only three; adding a fourth breaks the rotation's rhythm.

### Status

Added by the portal, which unlike the booth has states to report.

| Token | Value | Use |
| --- | --- | --- |
| `--ok` | `#1f8a4c` | "You can act on this" text |
| `--ok-wash` | `#e8f5ed` | Its pill background |
| `--muted-wash` | `#f0eff2` | Neutral pill background |

Status uses green and grey, never the accent — the accent already means
"the main action", and a red status pill reads as an error.

### Type

```
--font-dsac-sans: Aptos, "Segoe UI", Arial, Helvetica, sans-serif;
--font-dsac-mono: "Cascadia Mono", "Segoe UI Mono", Consolas, monospace;
```

Aptos is the SP house face. No webfont is loaded — the stack degrades to Segoe
on Windows and Helvetica elsewhere, which is close enough and costs nothing.

---

## 3. Typography

The system has one heading grammar, used on **every** screen. Repeating it
verbatim is what makes separate pages read as siblings rather than as separate
builds.

```
EYEBROW           gradient, uppercase, 11–12px, 600, 1px tracking
Display title.    weight 500, tracking -0.02em, ends in a full stop
Support line      --ink-2, max 46ch, 1.5 line-height
```

Rules:

- **The title ends in a full stop.** "Projects looking for staff." not
  "Projects looking for staff". It is a statement, not a label.
- **Weight 500, never 700.** The size carries the emphasis.
- **The eyebrow names the section, not the product.** Once the logo is on
  screen, an eyebrow reading "DSAC PROJECT PORTAL" is saying what the user can
  already see. "PROJECT CENTRE" earns its line.
- **Two or three gradient elements per screen, maximum.** The gradient is a
  seasoning.

Sizes come from `SectionHeader`'s `size` prop: `lg` for a landing hero, `md`
for a page header, `sm` for a narrow panel.

---

## 4. The glow card

The signature surface.

**Anatomy** — a `--card`-filled panel, 1rem radius, one hairline border, with
an oval pseudo-element bleeding off the top-right corner: 60% × 130%, blurred
46px, at 14% opacity. It sits *behind* the content, so it never tints text.

**Hue rotation** — the bloom colour comes from a `--card-glow` custom property.
Cards in a list rotate `rose → amber → iris` by index. Use the `GlowCard`
component and pass `index`; never set `--card-glow` by hand at a call site,
which is exactly how a system drifts.

```tsx
{projects.map((p, i) => <GlowCard key={p.id} index={i} interactive>…</GlowCard>)}
```

**The hue never means anything.** A card is not amber because it is closed. The
moment hue carries information, the rotation becomes a lie and the whole grid
has to be re-read. Status is a `StatusBadge` and nothing else.

**Interactive cards** get `interactive`, which adds a 2px hover lift, warms the
border toward the card's own glow, and raises the bloom to 22%. Only for cards
that are actually clickable.

---

## 5. Components

Everything in `components/ui/`. These are the whole vocabulary — reach for one
before writing a bespoke div.

| Component | Notes |
| --- | --- |
| `Button` | Four variants, three sizes |
| `SectionHeader` | The eyebrow/title/subtitle grammar above |
| `GlowCard` | The card surface and its hue rotation |
| `StatusBadge` | The only way a status is ever drawn |
| `Tag` | A skill chip, optionally removable |
| `TagInput` | Free-text tag editor, case-insensitively deduped |
| `Field` | Label + control + hint + error, one layout for all forms |
| `Select` | Native select with a drawn Phosphor caret |
| `Modal` / `ConfirmDialog` | Scrim + panel; destructive actions live here |
| `EmptyState` | Icon, line, and usually an action |
| `ErrorNote` | Inline failure that the user can carry on from |
| `Spinner` | The only looping animation in the system |
| `AmbientOrb` | Drifting background bloom, for full-bleed screens |
| `PortalShell` | The app frame: brand rail, nav, account footer |

### Button hierarchy

| Variant | When |
| --- | --- |
| `primary` | The **one** main action of a view. Accent fill, layered glow |
| `secondary` | Neutral peers — Cancel, Edit. White with a hairline |
| `ghost` | Tertiary and inline actions |
| `danger` | Quiet at rest, accent on hover |

`danger` is deliberately not red until hovered. A destructive action always
opens a `ConfirmDialog`, so the button that *opens* one needs no alarm — a
red-filled Delete sitting in a list reads as the page's main action, which it
never is.

Heights are **32 / 40 / 44** (`sm`/`md`/`lg`).

### Forms

Every text control carries `.dsac-input`: 0.75rem radius, hairline border,
accent focus ring at 14% opacity. `Field` owns the label, hint and error, so no
form re-invents that stack. Hints do real work here — "Leave blank to publish
it as Undisclosed" prevents a support question.

---

## 6. Motion

| Name | Duration | Use |
| --- | --- | --- |
| `dsac-rise` | 600ms | Content entering a view. Stagger 60ms, cap at 8 |
| `dsac-pop-up` | 170ms | A popover growing from the control that opened it |
| `dsac-fade-in` | 160ms | Modal scrim |
| `dsac-drift` / `dsac-orb-drift` | slow loop | Background aurora only |
| `dsac-sheen` | slow loop | A band of light crossing an aurora |

Rules:

- **Transform and opacity only.** Nothing animates layout.
- **Easing is `cubic-bezier(0.22, 1, 0.36, 1)`** for entrances.
- **Stagger caps at 8.** A 30-card grid where the last card waits 1.8s is not
  elegant, it is slow.
- **`prefers-reduced-motion` collapses everything to 0.001ms.** Already handled
  globally in `globals.css`; do not re-implement per component.

---

## 7. Icons

**Phosphor only** (`@phosphor-icons/react`). Never hand-roll an inline SVG icon
and never mix in a second icon set — weights and optical sizes will not agree.

Default `regular`; `fill` to mark an active state.

---

## 8. Do not

- **No pulsing or animated status dots.** A blinking light claims a live signal.
  A project being "available" is a fact about a database row. The word in a
  pill is faster to read and does not lie. The `Spinner`'s rotation is the only
  permitted loop in the system.
- **No hue as information.** See §4.
- **No second accent colour.** If something needs to stand out and red is
  taken, it probably should not stand out.
- **No hardcoded hex values** in components.
- **No gradient text beyond two or three elements per screen.**
- **No kiosk-scale controls in a desktop app.** See §9.
- **No bespoke card.** Use `GlowCard`.

---

## 9. Where the two apps diverge

Both departures are the portal's, and both are deliberate.

**Hit areas.** The booth uses 44/52/60px controls because every tap happens on
a touchscreen with a queue behind it. The portal uses 32/40/44 — it is read at
desk distance with a mouse, and kiosk-sized buttons look like shouting.

**The live-pulse keyframe.** The booth has `dsac-live-pulse` for a recording
indicator, where something genuinely *is* live. The portal does not ship it at
all. See §8.

Everything else — tokens, type grammar, glow card, motion curves, icon set —
is identical, and should stay that way.

---

## 10. The brand mark

`public/sp-dsac-logo.png`, shared byte-for-byte between both apps. A wide
lockup, roughly 3.8:1, cropped to its ink — so height controls it and the width
follows.

- **Expanded rails and login screens** get the full lockup.
- **Below about 150px of width**, it would shrink to an illegible smudge or
  crop mid-word. Use the red **SP** monogram square instead; it says the same
  thing in the space available.
- Never recolour it, never stretch it, never put it on the accent.

---

## 11. Adding to the system

1. Check §5 first — the component probably exists.
2. If it does not, build it in `components/ui/` against these tokens, and give
   it a header comment saying *why* it exists and what decision it encodes.
   Match the comment density of the existing primitives.
3. If you need a value that has no token, add the token. Do not inline the hex
   "just this once".
4. Update this document in the same change. A design system that lags its code
   is worse than none, because people trust it.
