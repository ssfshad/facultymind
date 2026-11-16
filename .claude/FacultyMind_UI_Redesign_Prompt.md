# FacultyMind — Complete UI Redesign Specification Prompt

You are redesigning the **FacultyMind** Electron.js desktop application from the ground up. The current UI is functional but visually flat, lifeless, and dated. The goal is a **premium, ultra-modern, smooth desktop application** that feels like it belongs alongside Arc Browser, Linear, Notion, or Raycast — not a university admin tool from 2018.

This document is the complete and authoritative specification. Follow every detail exactly. Do not simplify or skip sections.

---

## 1. DESIGN PHILOSOPHY

The redesign is guided by four principles:

1. **Glassmorphism + Depth** — Layered surfaces with subtle transparency, not flat boxes on flat backgrounds. Elements should feel like they float at different Z-levels.
2. **Motion-First** — Every state change, hover, navigation, and data load must have a purposeful micro-animation. Nothing should "snap."
3. **Information Density with Breathing Room** — Show enough data at a glance, but with generous whitespace and clear visual hierarchy. No cramming.
4. **Contextual Color** — Color carries meaning. Green = passing/good. Amber = warning/medium. Red = at-risk/fail. Purple/Indigo = AI/primary actions. Neutral = structure.

---

## 2. DESIGN TOKENS — IMPLEMENT EXACTLY

### 2.1 Color System

Define these as CSS custom properties on `:root` and override on `[data-theme="light"]`:

```css
/* Dark Mode (default) */
:root {
  /* Base Backgrounds */
  --bg-void: #06060a;
  --bg-base: #0d0d14;
  --bg-surface: #13131e;
  --bg-elevated: #1a1a28;
  --bg-overlay: #21212f;
  --bg-float: #282838;

  /* Sidebar */
  --sidebar-bg: rgba(10, 10, 18, 0.92);
  --sidebar-border: rgba(255, 255, 255, 0.06);
  --sidebar-item-hover: rgba(255, 255, 255, 0.05);
  --sidebar-item-active: rgba(99, 91, 255, 0.15);
  --sidebar-item-active-border: #635bff;

  /* Cards */
  --card-bg: rgba(255, 255, 255, 0.04);
  --card-border: rgba(255, 255, 255, 0.08);
  --card-hover-bg: rgba(255, 255, 255, 0.06);
  --card-hover-border: rgba(255, 255, 255, 0.14);

  /* Primary Brand (Indigo/Purple) */
  --accent-primary: #635bff;
  --accent-primary-hover: #7c75ff;
  --accent-primary-subtle: rgba(99, 91, 255, 0.12);
  --accent-primary-glow: rgba(99, 91, 255, 0.25);

  /* Semantic Colors */
  --color-success: #22c55e;
  --color-success-subtle: rgba(34, 197, 94, 0.1);
  --color-warning: #f59e0b;
  --color-warning-subtle: rgba(245, 158, 11, 0.1);
  --color-danger: #ef4444;
  --color-danger-subtle: rgba(239, 68, 68, 0.1);
  --color-info: #3b82f6;
  --color-info-subtle: rgba(59, 130, 246, 0.1);

  /* Text */
  --text-primary: rgba(255, 255, 255, 0.92);
  --text-secondary: rgba(255, 255, 255, 0.55);
  --text-tertiary: rgba(255, 255, 255, 0.30);
  --text-disabled: rgba(255, 255, 255, 0.18);

  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.18);

  /* Input */
  --input-bg: rgba(255, 255, 255, 0.05);
  --input-border: rgba(255, 255, 255, 0.1);
  --input-focus-border: #635bff;
  --input-focus-shadow: 0 0 0 3px rgba(99, 91, 255, 0.2);

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.3);
  --shadow-lg: 0 20px 40px rgba(0,0,0,0.6), 0 8px 16px rgba(0,0,0,0.4);
  --shadow-glow: 0 0 20px rgba(99, 91, 255, 0.15);

  /* Scrollbar */
  --scrollbar-thumb: rgba(255,255,255,0.1);
  --scrollbar-thumb-hover: rgba(255,255,255,0.2);
}

/* Light Mode */
[data-theme="light"] {
  --bg-void: #f0f0f5;
  --bg-base: #f5f5fa;
  --bg-surface: #ffffff;
  --bg-elevated: #ffffff;
  --bg-overlay: #f8f8fc;
  --bg-float: #ffffff;

  --sidebar-bg: rgba(246, 246, 252, 0.95);
  --sidebar-border: rgba(0, 0, 0, 0.07);
  --sidebar-item-hover: rgba(0, 0, 0, 0.04);
  --sidebar-item-active: rgba(99, 91, 255, 0.08);
  --sidebar-item-active-border: #635bff;

  --card-bg: #ffffff;
  --card-border: rgba(0, 0, 0, 0.07);
  --card-hover-bg: #fafafa;
  --card-hover-border: rgba(0, 0, 0, 0.12);

  --accent-primary: #4f46e5;
  --accent-primary-hover: #4338ca;
  --accent-primary-subtle: rgba(79, 70, 229, 0.08);
  --accent-primary-glow: rgba(79, 70, 229, 0.15);

  --color-success: #16a34a;
  --color-success-subtle: rgba(22, 163, 74, 0.08);
  --color-warning: #d97706;
  --color-warning-subtle: rgba(217, 119, 6, 0.08);
  --color-danger: #dc2626;
  --color-danger-subtle: rgba(220, 38, 38, 0.08);
  --color-info: #2563eb;
  --color-info-subtle: rgba(37, 99, 235, 0.08);

  --text-primary: rgba(10, 10, 20, 0.92);
  --text-secondary: rgba(10, 10, 20, 0.55);
  --text-tertiary: rgba(10, 10, 20, 0.35);
  --text-disabled: rgba(10, 10, 20, 0.25);

  --border-subtle: rgba(0, 0, 0, 0.05);
  --border-default: rgba(0, 0, 0, 0.09);
  --border-strong: rgba(0, 0, 0, 0.15);

  --input-bg: rgba(0, 0, 0, 0.03);
  --input-border: rgba(0, 0, 0, 0.1);
  --input-focus-border: #4f46e5;
  --input-focus-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.05);
  --shadow-lg: 0 20px 40px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.07);
  --shadow-glow: 0 0 20px rgba(79, 70, 229, 0.12);

  --scrollbar-thumb: rgba(0,0,0,0.12);
  --scrollbar-thumb-hover: rgba(0,0,0,0.2);
}
```

### 2.2 Typography

Use **Inter** (import from Google Fonts). Apply as `font-family: 'Inter', -apple-system, sans-serif` globally.

```
Font Scale:
--font-xs:   11px / line-height 1.4 / weight 400
--font-sm:   12px / line-height 1.5 / weight 400
--font-base: 13px / line-height 1.6 / weight 400
--font-md:   14px / line-height 1.6 / weight 400
--font-lg:   16px / line-height 1.5 / weight 500
--font-xl:   20px / line-height 1.3 / weight 600
--font-2xl:  24px / line-height 1.2 / weight 700
--font-3xl:  32px / line-height 1.1 / weight 700

Page title:    --font-xl, --text-primary
Section title: --font-lg, --text-primary
Label:         --font-sm, --text-secondary, letter-spacing: 0.06em, UPPERCASE
Body:          --font-base, --text-primary
Muted/hint:    --font-sm, --text-tertiary
Metric value:  --font-2xl or --font-3xl, --text-primary, tabular-nums
```

### 2.3 Spacing

Use an 4px base grid:
```
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
```

### 2.4 Border Radius

```
--radius-sm:  6px   (badges, tags, small chips)
--radius-md:  10px  (buttons, inputs, small cards)
--radius-lg:  14px  (cards, panels)
--radius-xl:  20px  (modals, large panels)
--radius-full: 9999px (pills, avatars)
```

### 2.5 Transitions

```css
--transition-fast:   100ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-base:   180ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-slow:   280ms cubic-bezier(0.4, 0, 0.2, 1)
--transition-spring: 320ms cubic-bezier(0.34, 1.56, 0.64, 1)
```

Apply `--transition-base` as default for hover states. Use `--transition-spring` for elements that scale or pop. Use `--transition-slow` for page transitions (opacity/transform on route change).

---

## 3. GLOBAL APP SHELL

### 3.1 Window Chrome (Electron Title Bar)

Remove the default OS title bar. Implement a custom frameless titlebar:
- Height: 40px
- Background: `var(--sidebar-bg)`, `backdrop-filter: blur(20px) saturate(180%)`
- Left side: `FM` logo icon (indigo rounded square, 22px) + "FacultyMind" text in `--font-md`, `--text-primary`
- Drag region covers the full bar (`-webkit-app-region: drag`)
- Right side: macOS-style or Windows-style window controls — use `--text-tertiary` icons, hover state shows colored circles (red/yellow/green on macOS, or standard grey/grey/red on Windows). Icons must NOT be draggable.
- Bottom border: `1px solid var(--sidebar-border)`

### 3.2 App Layout

Three-column layout with the following structure:
```
┌─ Window Chrome (40px) ─────────────────────────────┐
├─ Sidebar (220px fixed) ─┬─ Content Area (flex 1) ──┤
│                         │                           │
│                         │                           │
└─────────────────────────┴───────────────────────────┘
```

The sidebar is FIXED and does not scroll with content.
The content area takes all remaining width and has its own scroll context.

### 3.3 Sidebar

```
Width: 220px
Background: var(--sidebar-bg)
Backdrop-filter: blur(20px) saturate(180%)
Border-right: 1px solid var(--sidebar-border)
Padding: 12px 8px
```

**Logo section (top):**
- 40px tall row with horizontal layout
- Left: `FM` avatar — `36px × 36px`, `border-radius: var(--radius-md)`, indigo-to-purple diagonal gradient `(135deg, #635bff 0%, #8b5cf6 100%)`, white bold "FM" text at 13px center
- Right: "FacultyMind" in `--font-md`, weight 600, `--text-primary`
- Margin-bottom: `var(--space-6)`

**Navigation items:**
Each nav item is a horizontal row:
```
Height: 36px
Padding: 0 10px
Border-radius: var(--radius-md)
Display: flex, align-items: center, gap: 10px
Cursor: pointer
Transition: var(--transition-base)

Default:
  background: transparent
  color: var(--text-secondary)
  
Hover:
  background: var(--sidebar-item-hover)
  color: var(--text-primary)
  transform: translateX(2px)

Active:
  background: var(--sidebar-item-active)
  color: var(--accent-primary)
  font-weight: 500
  border-left: 2px solid var(--sidebar-item-active-border)  [inset, not pushing layout]
  padding-left: 8px  [compensate for the border]
```

Icon: 18px, uses the active/hover color.
Label: `--font-sm`, inherits color.

Nav items in order (use these exact icons from Lucide or Heroicons):
1. DASH AI — `Sparkles` icon (or `Bot`)
2. Schedule — `CalendarDays` icon
3. ShadSync OBE — `BarChart3` icon (or `GraduationCap`)
4. Bloom's Engine — `BookOpen` icon (or `Brain`)
5. Email Intel — `Inbox` icon
6. Local Vault — `ShieldLock` icon (or `Lock`)
7. Quick Portal — `Globe` icon
8. DIU Teachers Portal — `School` icon (or `Building2`)

Bottom section (pinned to sidebar bottom):
- Separator line: `1px solid var(--border-subtle)`
- Theme toggle button: moon/sun icon, `--text-secondary`, hover becomes `--accent-primary`, triggers `data-theme` swap on `<html>` with localStorage persistence
- Settings — `Settings` icon, same style as nav items
- User avatar: 32px circle, indigo background, white "D" initial, bottom-right of sidebar

**Section labels:** None needed for now. If added later, use uppercase 10px letters, `--text-tertiary`, `letter-spacing: 0.08em`, `padding: 16px 10px 6px`.

---

## 4. GLOBAL COMPONENTS

These components are used across all screens. Define them once and use consistently.

### 4.1 Card

```css
.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  transition: var(--transition-base);
}
.card:hover {
  background: var(--card-hover-bg);
  border-color: var(--card-hover-border);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}
```

For non-interactive cards (data display only), remove the hover transform and keep only border-color transition.

### 4.2 Metric Card (stat display)

```
Background: var(--card-bg)
Border: 1px solid var(--card-border)
Border-radius: var(--radius-lg)
Padding: 20px 24px

Layout (vertical):
  [Label row]  —  small uppercase label left, optional icon right (same color as label)
  [Value row]  —  large number (--font-2xl or --font-3xl), --text-primary, tabular-nums
  [Sub-row]    —  muted description, --font-sm, --text-tertiary
  
Optional left border accent:
  border-left: 3px solid <semantic color>
  border-radius: 0 var(--radius-lg) var(--radius-lg) 0
  (remove the full border in this variant, only keep left accent + subtle bottom shadow)
```

Use semantic colors for left border:
- Success/passing: `var(--color-success)`
- Warning/medium: `var(--color-warning)`
- Danger/at-risk: `var(--color-danger)`
- Info/general: `var(--color-info)`
- Primary/AI: `var(--accent-primary)`

### 4.3 Button

**Primary:**
```css
background: var(--accent-primary);
color: white;
border: none;
border-radius: var(--radius-md);
padding: 8px 16px;
font-size: 13px;
font-weight: 500;
cursor: pointer;
transition: var(--transition-base);
box-shadow: 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1);

:hover { background: var(--accent-primary-hover); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
:active { transform: translateY(0); box-shadow: none; }
```

**Secondary:**
```css
background: transparent;
color: var(--text-primary);
border: 1px solid var(--border-default);
border-radius: var(--radius-md);
padding: 7px 15px;
font-size: 13px;
font-weight: 400;

:hover { background: var(--bg-elevated); border-color: var(--border-strong); }
:active { transform: scale(0.98); }
```

**Ghost/Icon button:**
```css
background: transparent;
border: none;
padding: 6px;
border-radius: var(--radius-sm);
color: var(--text-secondary);
cursor: pointer;
transition: var(--transition-base);

:hover { background: var(--card-bg); color: var(--text-primary); }
```

**Destructive:**
Same as secondary but `color: var(--color-danger)`, `border-color: var(--color-danger)` at 30% opacity.
On hover: `background: var(--color-danger-subtle)`, `border-color: var(--color-danger)`.

### 4.4 Input / Text Field

```css
background: var(--input-bg);
border: 1px solid var(--input-border);
border-radius: var(--radius-md);
padding: 8px 12px;
font-size: 13px;
color: var(--text-primary);
width: 100%;
transition: var(--transition-base);
outline: none;

::placeholder { color: var(--text-tertiary); }
:hover { border-color: var(--border-strong); }
:focus { 
  border-color: var(--input-focus-border); 
  box-shadow: var(--input-focus-shadow);
}
```

### 4.5 Badge / Tag

```css
display: inline-flex;
align-items: center;
gap: 4px;
padding: 2px 8px;
border-radius: var(--radius-sm);
font-size: 11px;
font-weight: 500;
letter-spacing: 0.02em;
```

Variants by color:
- Default: `background: var(--bg-elevated); color: var(--text-secondary); border: 1px solid var(--border-subtle);`
- Success: `background: var(--color-success-subtle); color: var(--color-success);`
- Warning: `background: var(--color-warning-subtle); color: var(--color-warning);`
- Danger: `background: var(--color-danger-subtle); color: var(--color-danger);`
- Info: `background: var(--color-info-subtle); color: var(--color-info);`
- Primary: `background: var(--accent-primary-subtle); color: var(--accent-primary);`

### 4.6 Page Header

Every screen starts with a consistent header:
```
Padding: 28px 32px 0 32px
Layout: flex, justify-content: space-between, align-items: flex-start

Left:
  <h1> — page title, --font-xl, --text-primary
  <p>  — optional subtitle, --font-sm, --text-secondary, margin-top: 4px

Right:
  Action buttons (primary + secondary grouped with 8px gap)
```

### 4.7 Divider

```css
height: 1px;
background: var(--border-subtle);
margin: var(--space-6) 0;
```

### 4.8 Empty State

Centered vertical layout:
- Icon: 48px, `--text-tertiary`, a relevant outline icon
- Title: `--font-md`, weight 500, `--text-secondary`, margin-top 12px
- Description: `--font-sm`, `--text-tertiary`, text-align center, max-width 280px
- Optional CTA button below with margin-top 16px

### 4.9 Scrollbar (global)

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { 
  background: var(--scrollbar-thumb);
  border-radius: 99px;
}
::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-hover); }
```

### 4.10 Tooltip

On hover over icon-only buttons, show a floating tooltip:
```css
background: var(--bg-float);
border: 1px solid var(--border-default);
border-radius: var(--radius-sm);
padding: 5px 10px;
font-size: 12px;
color: var(--text-primary);
box-shadow: var(--shadow-md);
pointer-events: none;
z-index: 1000;
animation: fadeIn 120ms ease;
```

---

## 5. SCREEN-BY-SCREEN SPECIFICATIONS

### 5.1 PIN Lock Screen (Screen 1)

**Background:** Full-screen radial gradient, centered:
- Dark: `radial-gradient(ellipse at 50% 40%, #1a1040 0%, #06060a 60%)`
- Light: `radial-gradient(ellipse at 50% 40%, #eeeffe 0%, #f0f0f5 60%)`

Optionally add 2–3 very subtle floating blurred orbs (CSS only, no canvas):
- Orb 1: `position: absolute; width: 300px; height: 300px; border-radius: 50%; background: rgba(99,91,255,0.08); filter: blur(80px); top: 20%; left: 30%;`
- Orb 2: `position: absolute; width: 200px; height: 200px; border-radius: 50%; background: rgba(139,92,246,0.06); filter: blur(60px); bottom: 30%; right: 25%;`
These are purely decorative and do not move.

**Center content** (vertically and horizontally centered):
1. FM Logo mark: `56px × 56px`, `border-radius: 16px`, gradient background `(135deg, #635bff 0%, #8b5cf6 100%)`, white "FM" at 18px weight 700. Add `box-shadow: 0 8px 32px rgba(99,91,255,0.35)`.
2. "FacultyMind" text: `--font-lg`, weight 600, `--text-primary`, margin-top 16px
3. "Enter PIN to unlock": `--font-sm`, `--text-tertiary`, margin-top 6px
4. PIN input boxes: 6 square boxes in a row with `gap: 10px`, margin-top 32px

**PIN boxes:**
```
Size: 52px × 58px
Background: var(--card-bg)
Border: 1px solid var(--border-default)
Border-radius: var(--radius-md)
Font-size: 20px, color: var(--text-primary), text-align center

Focused box:
  border-color: var(--accent-primary)
  box-shadow: var(--input-focus-shadow)
  background: var(--accent-primary-subtle)
  
Filled box (has a digit entered — shown as •):
  border-color: var(--border-strong)
  
Error state (wrong PIN — animate all boxes):
  animation: shake 400ms ease  [horizontal shaking]
  border-color: var(--color-danger)
  background: var(--color-danger-subtle)
  transition back to normal after 1.5s
```

On success, animate the boxes scaling up and fading out (`transform: scale(1.05); opacity: 0`) over 250ms, then slide the content panel in from below.

### 5.2 DASH AI Screen (Screen 2)

This is the home screen. It should feel alive and intelligent.

**Content area layout:**
```
Padding: 0
Display: flex, flex-direction: column, height: 100%
```

**Top bar inside content area:**
```
Height: 52px
Padding: 0 20px 0 28px
Display: flex, align-items: center, justify-content: space-between
Border-bottom: 1px solid var(--border-subtle)

Left:
  "DASH AI" — --font-lg, weight 600, --text-primary
  
Right:
  Model selector chip — pill-shaped button:
    Current model name (e.g. "Ollama · deepseek-r1:8b")
    Background: var(--accent-primary-subtle)
    Color: var(--accent-primary)
    Border: 1px solid var(--accent-primary) at 30% opacity
    Border-radius: var(--radius-full)
    Padding: 4px 12px
    Font-size: 12px, font-weight: 500
    A small dot icon (●) before the name, green if Ollama is live, yellow if connecting, grey if not
    Clicking opens a dropdown model picker
```

**Chat area (main body):**
```
Flex: 1, overflow-y: auto
Padding: 24px 28px
Display: flex, flex-direction: column, gap: 16px
```

**AI message bubble (DASH introduction):**
```
Max-width: 75%
Align: left (flex-start)
Layout:
  Row: [AI avatar] [bubble]
  
Avatar:
  32px circle
  Gradient background: 135deg, #635bff 0%, #8b5cf6 100%
  White "D" text, 13px, weight 600
  Align-self: flex-end (pinned to bottom of avatar column)

Bubble:
  Background: var(--bg-elevated)
  Border: 1px solid var(--border-default)
  Border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px (sharp bottom-left corner)
  Padding: 14px 18px
  Font-size: --font-base
  Color: --text-primary
  Line-height: 1.65
  Box-shadow: var(--shadow-sm)
```

Bullet items inside the bubble should be rendered as styled `<span>` chips, not plain `•` characters:
- Each feature (Schedule, ShadSync OBE, etc.) is an inline chip: `background: var(--accent-primary-subtle); color: var(--accent-primary); border-radius: 4px; padding: 1px 6px; font-weight: 500; font-size: 12px;` displayed inline-block within the sentence.

**User message bubble:**
```
Align: right (flex-end)
Background: var(--accent-primary)
Color: white
Border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg) (sharp bottom-right)
Padding: 12px 16px
Max-width: 65%
Font-size: --font-base
```

**Quick action chips (below the intro message):**
Show 4 horizontal chips as suggested prompts:
```
Layout: flex-wrap, gap: 8px, margin-top: 4px (inside or below bubble)
Each chip:
  Background: var(--card-bg)
  Border: 1px solid var(--border-default)
  Border-radius: var(--radius-full)
  Padding: 6px 14px
  Font-size: 12px
  Color: var(--text-secondary)
  Cursor: pointer
  Transition: var(--transition-base)
  :hover { background: var(--accent-primary-subtle); border-color: var(--accent-primary); color: var(--accent-primary); }
```

Chips: "Check today's schedule", "Show CLO attainment for ICE301", "Draft student email", "Generate lesson plan"

**Input Bar (bottom):**
```
Height: 64px
Padding: 10px 16px
Border-top: 1px solid var(--border-subtle)
Background: var(--bg-surface) [NOT transparent — it should feel like a separate zone]
Display: flex, align-items: center, gap: 10px

Left: Microphone button (ghost icon button, 36px × 36px, mic icon)
  Active recording: icon turns red, button has red subtle background
  
Center: Input field
  Flex: 1
  Background: var(--input-bg)
  Border: 1px solid var(--input-border)
  Border-radius: var(--radius-full)  [fully rounded pill input]
  Padding: 9px 16px
  Font-size: 13px
  Placeholder: "Ask anything — schedule, marks, CLO attainment, draft an email…"
  No focus border-radius change (stays pill)
  
Right: Send button (icon button, 36px × 36px, rounded square not circle)
  Background: var(--accent-primary)
  Color: white
  Border-radius: var(--radius-md)
  Arrow-right icon, 18px
  :hover { background: var(--accent-primary-hover); transform: scale(1.05); }
  :active { transform: scale(0.95); }
```

**Typing indicator** (when AI is generating):
Three animated dots in an AI bubble: each dot is `8px × 8px`, `border-radius: 50%`, `background: --text-tertiary`. Animate with `@keyframes bounce`: sequentially bounce up with `100ms` staggered delay. This replaces the empty bubble while streaming.

### 5.3 Smart Schedule Manager (Screen 3)

**Page header:** Standard header ("Smart Schedule Manager" + "+ Add Class" primary button)

**Week grid:**
```
Layout: 7 columns (Sun through Sat)
Margin-top: 24px
Padding: 0 28px

Column headers:
  Height: 40px
  Font-size: 11px, uppercase, letter-spacing 0.06em, --text-tertiary
  Today's column header: 
    Color: --accent-primary
    After the day name, add a filled circle dot (●) at 6px
    
Each day column:
  Min-height: 200px
  Padding: 8px 6px
  Border-right: 1px solid var(--border-subtle)
  Last column has no border-right
  
Empty day: Show "—" in --text-disabled, centered
```

**Class cards (within columns):**
```
Background: var(--accent-primary-subtle)
Border: 1px solid var(--accent-primary) at 20% opacity
Border-left: 3px solid var(--accent-primary)  [accent left edge]
Border-radius: var(--radius-md)
Padding: 10px 12px
Margin-bottom: 6px
Cursor: pointer
Transition: var(--transition-base)

Layout (vertical):
  Course code: --font-sm, font-weight: 600, --accent-primary
  Time range: --font-xs, --text-secondary, margin-top: 3px
  Room number: --font-xs, --text-tertiary, margin-top: 2px

:hover {
  background: rgba(99,91,255,0.18);
  border-left-color: var(--accent-primary-hover);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

Different courses should have different left-border colors (cycle through: `--accent-primary`, `--color-info`, `--color-success`, `--color-warning`) so they're visually distinct at a glance.

**Office hours / other events:**
```
Background: var(--color-info-subtle)
Border-left: 3px solid var(--color-info)
Same structure as class cards
```

**Lesson Log section:**
```
Margin-top: 32px
Padding: 0 28px 28px 28px

Header: "Lesson Log" as --font-lg + "+ Log Lesson" secondary button (right)
Divider below header

Each log entry:
  Card (using .card class)
  Padding: 16px 20px
  Margin-bottom: 10px
  Display: flex, flex-direction: column, gap: 6px
  
  Header row: flex, justify-content: space-between
    Left: 
      Course code — --font-sm, font-weight: 600, --accent-primary
      Date — --font-xs, --text-tertiary, margin-left: 8px
    Right:
      Ghost icon button for edit and delete
      
  "Covered:" label + content: --font-sm, --text-secondary
  "Next:" label + content: --font-sm, --text-tertiary (slightly more muted)
  
  "Covered" label itself: --font-xs, uppercase, --text-tertiary, letter-spacing: 0.05em
  "Next" label: same styling
```

### 5.4 ShadSync OBE Engine (Screen 4)

This is a data-heavy screen. Clarity and semantic color are critical.

**Page header:** "ShadSync OBE Engine" + right side controls:
- Course selector dropdown: styled Select component (see dropdown spec below), shows "ICE301" with caret. Width: 140px.
- "Refresh Data" primary button
- "Manage Data" secondary button  
- "Export BAETE Report" secondary button (with export/download icon prefix)

**Dropdown (course selector) style:**
```
Background: var(--bg-elevated)
Border: 1px solid var(--border-default)
Border-radius: var(--radius-md)
Padding: 7px 12px
Font-size: 13px
Color: var(--text-primary)
Appearance: none (custom arrow icon right side)
Min-width: 140px
:focus { border-color: var(--accent-primary); box-shadow: var(--input-focus-shadow); }
```

**Main grid (2 columns, gap: 16px):**

Left card — CLO Attainment:
```
Card styling
Header: "CLO Attainment" — --font-lg, --text-primary, margin-bottom: 20px

Each CLO row:
  Display: flex, justify-content: space-between, align-items: center
  Padding: 12px 0
  Border-bottom: 1px solid var(--border-subtle)
  Last row: no border

  Left: CLO label — --font-base, --text-primary
  
  Right side:
    Progress bar + percentage number
    
    Progress bar:
      Width: 120px
      Height: 6px
      Background: var(--border-subtle)
      Border-radius: 99px
      Overflow: hidden
      
      Fill:
        Height: 100%
        Border-radius: 99px
        Transition: width 600ms cubic-bezier(0.4,0,0.2,1)
        
        Color rules based on value:
        ≥ 70%: var(--color-success)
        60–69%: var(--color-warning)
        < 60%: var(--color-danger)
    
    Percentage number: 
      --font-sm, font-weight: 600, tabular-nums, min-width: 44px, text-align: right
      Color: same semantic rule as bar fill
      
    Margin-left: 12px (space between bar and number)
```

Right card — CO & PO Attainment:
```
Card styling
Header: "CO & PO Attainment" — --font-lg, --text-primary, margin-bottom: 20px

Two columns inside:
  Left: Course Outcomes (CO)
  Right: Program Outcomes (PO)
  
  Column header: --font-xs, uppercase, letter-spacing: 0.06em, --text-tertiary, margin-bottom: 12px
  
  Each row (same structure as CLO — label left, % right with color):
    No progress bar here — just label and colored % value
    Row padding: 8px 0, border-bottom: 1px solid var(--border-subtle)
```

**At-Risk Students section (below the 2-col grid):**
Full-width card, margin-top: 16px.
```
Header: "At-Risk Students" with a warning icon (⚠) prefix
         --font-lg, color: var(--color-warning)

When no at-risk students:
  Empty state: green check icon (32px), 
  Text: "No CLOs broadly failing standard thresholds." — --font-sm, --color-success
  
When there ARE at-risk students:
  Table or card list of students, each row shows:
  Student ID | Name | Failing CLO(s) | Current Average
  At-risk badge on each row
```

**Animate the progress bars** on mount: start all bars at 0 width, then animate to their real values with 600ms staggered 80ms per row. This creates a "loading up" feel.

### 5.5 Bloom's Engine (Screen 5)

**Tab bar (top of content, sticky):**
```
Background: var(--bg-surface)
Padding: 0 28px
Border-bottom: 1px solid var(--border-subtle)
Height: 48px
Display: flex, align-items: flex-end, gap: 4px

Tab item:
  Padding: 10px 16px
  Font-size: 13px
  Color: var(--text-secondary)
  Border-bottom: 2px solid transparent
  Cursor: pointer
  Transition: var(--transition-base)
  
  :hover { color: var(--text-primary); }
  
  Active tab:
    Color: var(--accent-primary)
    Border-bottom: 2px solid var(--accent-primary)
    Font-weight: 500
    
Tabs: [📄 Lesson Plan] [🎯 CLO Mapper] [📚 Knowledge Base] [📋 Syllabus]
(Use small icon prefix for each tab — use appropriate lucide/heroicon outline icons instead of emoji)
```

**Stats bar (below tabs):**
```
Background: var(--color-success-subtle)
Border-bottom: 1px solid var(--color-success) at 20% opacity
Padding: 8px 28px
Font-size: 12px, --text-secondary
Flex row: "975 records · 975 verified · 1 course"
Dot separators as --text-tertiary
```

**Import section:**
```
Card, padding: 20px 24px

Header: "Import Exam Questions" — --font-md, --text-primary

Course code input: full width, standard input

Drop zone:
  Background: var(--input-bg)
  Border: 1.5px dashed var(--border-default)
  Border-radius: var(--radius-lg)
  Padding: 32px 20px
  Text-align: center
  Margin-top: 12px
  Transition: var(--transition-base)
  
  Icon: upload icon, 32px, --text-tertiary
  Text: "Drop exam question images here (PNG, JPG) or click to select"
          --font-sm, --text-secondary, margin-top: 8px
  
  :hover / drag-over:
    Background: var(--accent-primary-subtle)
    Border-color: var(--accent-primary)
    Border-style: solid
    
Button row (below drop zone): flex, gap: 12px
  "Parse & Import Selected" — full-width primary button (flex: 2)
  "Scan Folder" — secondary button (flex: 1), folder icon prefix
  
Hint text: --font-xs, --text-tertiary, icon prefix (lightbulb), margin-top: 10px
```

**Knowledge Base section:**
```
Header row: 
  "Knowledge Base" — --font-lg, --text-primary (left)
  Right: "Verify All" primary button + "Clear All" destructive button + course filter dropdown
  
Each question entry card:
  Card styling (but more compact — padding: 14px 18px)
  Margin-bottom: 8px
  Transition: var(--transition-base)
  
  Row 1: Question text — --font-base, --text-primary
  Row 2: Tag chips in flex row — exam type, CLO tag, Bloom's level chip, verb list chip
  
  Right side (absolute positioned or flex-end):
    "Unverify" ghost button (small)
    "Delete" destructive ghost button (small)
    
  Bloom's level chips use distinct colors:
    C1 Remember: var(--color-info-subtle) / var(--color-info)
    C2 Understand: purple subtle
    C3 Apply: teal subtle
    C4 Analyze: amber subtle
    C5 Evaluate: orange subtle
    C6 Create: pink/coral subtle
    
  Verified badge: green ✓ Verified chip (success color)
  UNKNOWN badge: default grey chip
  
  :hover {
    box-shadow: var(--shadow-sm);
    transform: translateY(-1px);
    border-color: var(--border-strong);
  }
```

### 5.6 Email Intel (Screen 6)

**Gmail connection card:**
```
Full-width card, padding: 24px
Border-left: 3px solid var(--color-warning)  [indicates needs attention]

Layout:
  Left: Avatar circle (? icon, muted) — 48px
  Center: 
    "Not connected" — --font-lg, --text-primary
    "Connect Gmail to see your account" — --font-sm, --text-secondary
  Right: Status pills
    "Checking Gmail..." — warning badge (animated pulsing dot prefix)
    "Local DB Connected" — success badge
    
Below: Hint text about Gmail authorization
Below: "Connect Gmail Account" — primary button with mail icon prefix, centered or left-aligned
```

**Smart Inbox:**
```
Header: "📬 Smart Inbox" (mail icon, not emoji) flex row with "Refresh" ghost icon button right

When empty:
  Use empty state component (bell-slash icon, "No emails yet", description text)
  
When populated (future state — implement the UI shell):
  Email list — each item:
    Card (compact, padding: 12px 16px)
    Hover: subtle lift
    
    Layout: flex row
      Left: Sender avatar initials (32px circle)
      Center (flex: 1):
        Row 1: Sender name (--font-sm, weight 500) + subject (--font-sm, --text-secondary)
        Row 2: Preview snippet — --font-xs, --text-tertiary, truncated
      Right:
        Timestamp (--font-xs, --text-tertiary)
        Category badge below time
        
    Category badge colors:
      Student: info
      Admin: warning  
      Urgent: danger
      Routine: default
```

### 5.7 Local Vault (Screen 7)

**Three-panel layout within content area:**
- Left panel (200px): categories sidebar
- Right panel (flex 1): item grid/list

**Left panel:**
```
Background: var(--bg-surface) (slightly different from main -- subtle)
Border-right: 1px solid var(--border-subtle)
Padding: 16px 12px

"All Items" row: active by default
"Favorites" row: star icon

"CATEGORIES" label: section label style (uppercase, xs, tertiary)

Category rows:
  "Passwords" + colored dot (blue) + count badge
  "Notes" + colored dot (green) + count badge
  "Links" + colored dot (amber) + count badge
  
Same hover/active states as main sidebar but smaller (32px height rows)

Bottom: 
  "Lock" button (lock icon, destructive secondary style, full width)
  "Export" ghost button below it
```

**Right panel header:**
```
Padding: 16px 20px
Flex row: title ("All Items" / "Passwords" / etc.) + item count badge + search input + "Add Item" primary button

Search input: 
  Width: 220px
  Has search icon prefix inside the input (left padding offset)
  Keyboard shortcut hint: "Ctrl+K" shown as a tiny grey pill inside input right side
```

**Stats row:**
```
4 metric cards in a row (compact version):
  Total Items / Passwords / Favorites / Storage
  Use card-bg, padding: 12px 16px
  Dividers between them OR as separate small cards
```

**Item grid (2 or 3 columns, auto-fit):**
```
Each vault item card:
  Background: var(--card-bg)
  Border: 1px solid var(--card-border)
  Border-radius: var(--radius-lg)
  Padding: 16px 18px
  
  Header: item name (--font-sm, weight 600) + star/favorite icon (right, ghost)
  
  Content area:
    Notes: shows note text preview, --font-xs, --text-secondary
    Passwords: shows •••••••••••• with eye toggle icon + copy icon
    Links: shows URL in accent color, truncated
    
  Footer: type badge (Note/Password/Link)
  
  :hover { box-shadow: var(--shadow-md); transform: translateY(-2px); border-color: var(--border-strong); }
```

### 5.8 Quick Portal (Screen 8)

**Tab bar at top:**
- "DIU Teacher Portal" tab + "BLC Portal" tab
- Use the same tab bar style as Bloom's Engine
- Active tab has accent underline

**WebView frame:**
```
The embedded website takes up all remaining height
Border-radius: var(--radius-lg) on the iframe container
Border: 1px solid var(--border-subtle)
Overflow: hidden (to respect border-radius)
Margin: 0 28px 28px 28px

Navigation bar above the iframe (custom, slim — 36px):
  Background: var(--bg-elevated)
  Border: 1px solid var(--border-subtle)
  Border-radius: var(--radius-md) var(--radius-md) 0 0  (top rounded only)
  Padding: 0 12px
  Flex row: back arrow icon | forward arrow icon | reload icon | URL display (read-only, truncated) | external-link icon (opens in browser)
  All controls are ghost icon buttons
```

### 5.9 DIU Teachers Portal (Screen 9)

Three-panel layout: FacultyMind sidebar | DIU sub-sidebar | DIU content panel

**DIU sub-sidebar (200px):**
```
Background: rgba(25, 35, 60, 0.95) in dark — a distinct navy tint to signal "this is inside the portal"
Light mode: rgba(245, 248, 255, 0.98) — a soft blue tint
Border-right: 1px solid var(--border-subtle)
Padding: 20px 0

Header:
  DIU logo circle (white "DIU" on navy background, 40px)
  "Daffodil International University" text, --font-xs, --text-secondary, multi-line
  Padding: 0 16px 16px 16px
  Border-bottom: 1px solid var(--border-subtle)

Nav items (same as main sidebar style but adapted for the navy tone):
  Dashboard, Student Attendance, Result, Accounts Clearance, 
  Mentor Clearance, Marks Entry, Course Registration, Gradesheet Approval
  
Bottom: Logout — with LogOut icon, danger color
```

**DIU content panel:**
```
Background: white (#fff) in BOTH themes — this is the portal's own design system
Do NOT apply FacultyMind dark theme inside this panel
Text uses portal's own colors (dark text on white)

Dashboard header:
  "Dashboard" title (portal's own style)
  Course selector dropdown right side
  
Stats cards (portal style — white background, colored left borders or top borders):
  TOTAL STUDENTS (neutral blue)
  PASSING (green)
  AT RISK (red)
  CLASS AVG (orange)
  AVG ATTENDANCE (blue)
  
  Each card: white background, 1px solid #e5e7eb border, padding: 16px 20px
  Label: 11px, uppercase, #6b7280
  Value: 32px, font-weight: 700, #111827
  Sub: 12px, #9ca3af
  
Course Information table:
  White background, standard table styling
  Header row: navy (#1e3a5f) background, white text
  Alternating row subtle grey (#f9fafb)
```

### 5.10 Settings Screen (Screens 10–13)

**Settings uses a two-panel layout inside the content area:**

Left sub-nav (160px, optional — or use anchored sections on a single page):
- AI Model
- API Keys
- Google OAuth
- OpenRouter
- Database
- Portable Mode
- Security
- Memory & Intelligence
- About

**Settings sections (scrollable single page with anchors):**

```
Padding: 28px 32px

Section heading: --font-lg, weight 600, --text-primary
Section description: --font-sm, --text-secondary, margin-top: 4px
Section card: card styling, margin-bottom: 20px
```

**AI Model section:**
```
Model selector tabs: pill-tab style
  Row of 5 pills: Claude | GPT-4o | Gemini | OpenRouter | Local AI
  
  Default (inactive):
    Background: var(--card-bg)
    Border: 1px solid var(--border-default)
    Color: var(--text-secondary)
    
  Active:
    Background: var(--accent-primary)
    Border-color: var(--accent-primary)
    Color: white
    
  Hover:
    Background: var(--accent-primary-subtle)
    Color: var(--accent-primary)
    
  Border-radius: var(--radius-full)
  Padding: 7px 18px
  Font-size: 13px
  Transition: var(--transition-base)

Local AI panel (shows when "Local AI" is active):
  Status indicator row:
    Dot (12px circle): green pulse animation if running
    "Ollama is running" — --font-sm, --color-success, font-weight: 500
    "Local AI is available — Bloom's tasks will use it automatically." — --font-xs, --text-secondary
    
  "LOCAL MODEL" label
  Input (full width) + "Apply" button on the right side
  
  Recommended models hint: --font-xs, --text-tertiary, below input
```

**API Keys section:**
```
Each API key row:
  Flex row, justify-content: space-between, padding: 12px 0, border-bottom
  
  Left: service name (--font-sm, weight 500) + parenthetical description (--text-tertiary)
  Right: status indicator:
    Set: green ✓ chip
    Not set: red × chip
    
"Update API Keys" button: full-width secondary button
```

**Security — Change PIN:**
```
Two side-by-side input rows:
  Current PIN
  New PIN (6 boxes, same design as lock screen but smaller at 40px × 44px)
"Change PIN" primary button
```

**Memory & Intelligence section:**
```
Description text with the J.A.R.V.I.S. analogy

Proactive AI toggle:
  Label (--font-sm, weight 500) + sub-description (--font-xs, --text-secondary)
  Toggle switch on the right:
    60px × 32px pill shape
    Thumb: 24px circle, white, with spring animation on toggle
    Active: background var(--accent-primary)
    Inactive: background var(--border-strong)
    Transition: var(--transition-spring)
```

**Rules section:**
```
Input + "Add Rule" button in a row
Empty state: muted text "No rules set yet. Add one above."

Rule chips (when added):
  Each rule as a chip/tag with × remove button
  Background: var(--card-bg), border, border-radius: var(--radius-sm)
  Font-size: 12px, --text-primary
  × icon: --text-tertiary, :hover → --color-danger
```

**AI Thought Journal:**
```
Read-only log entries
Header: "AI Thought Journal" + description text + "Refresh" ghost button

Each journal entry card:
  Card styling but left-border accent by type:
    RULE_SUGGESTION: accent-primary
    OPEN_LOOP: warning
    PATTERN: info
    
  Date badge: --font-xs, --text-tertiary (right side)
  Content: --font-sm, --text-primary
  Type label: uppercase, xs, letter-spacing 0.06em, matching border color
```

**About section:**
```
Card, centered or left layout
"FacultyMind v1.0.0" — --font-lg, --text-primary
"OBE engine by ShadSync" — --font-sm, --text-secondary
"Built by Shad, Daffodil International University" — --font-xs, --text-tertiary
Optional: version info, build date
```

---

## 6. ANIMATIONS & MICRO-INTERACTIONS

### 6.1 Page/Route Transitions
When navigating between sidebar items:
```css
/* Outgoing page */
@keyframes pageOut {
  from { opacity: 1; transform: translateX(0); }
  to   { opacity: 0; transform: translateX(-8px); }
}

/* Incoming page */
@keyframes pageIn {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
```
Duration: 180ms each. New page waits for outgoing to finish (or run simultaneously, your call).

### 6.2 Card Entrance (on page load)
Cards should appear with a staggered fade-up animation:
```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
```
Stagger: 60ms per card. Duration: 240ms. Easing: `cubic-bezier(0.4, 0, 0.2, 1)`.

### 6.3 Number Count-Up
For metric values (CLO percentages, student counts): animate from 0 to the real value over 800ms using `requestAnimationFrame`. Use `easeOutExpo` easing. This runs once on first render.

### 6.4 Progress Bar Fill
Already specified per-screen. Global rule: all progress bars animate width from 0 to value on mount, 600ms, easeOut.

### 6.5 Toggle Switch Spring
Already specified. The thumb slides with a spring (slight overshoot). Background color crossfades simultaneously.

### 6.6 Button Feedback
All clickable elements must respond within 1 frame (<16ms) to give immediate haptic-like feedback before the action processes.

### 6.7 Sidebar Active State
When clicking a new nav item, the active indicator (left border + background) should animate — use `clip-path` or a sliding underline technique for a slick feel. Minimum: background fade-in over 120ms.

---

## 7. LIGHT / DARK MODE

### 7.1 Implementation
- Store theme in `localStorage` as `"theme": "light" | "dark"`
- Apply as `data-theme="light"` or `data-theme="dark"` attribute on `<html>`
- All colors must use CSS variables — no hardcoded hex except within the variable definitions
- Theme toggle button in sidebar bottom (moon → sun icon, animates rotation on switch)
- On app boot, read `localStorage` before first render to avoid flash

### 7.2 Theme Transition
```css
*, *::before, *::after {
  transition: background-color 220ms ease, border-color 220ms ease, color 180ms ease;
}
```
Except for elements that have their own transitions (buttons, cards, etc.) — those should NOT be affected by this global rule. Use a class `.theme-transitioning` on `<html>` during the transition only.

---

## 8. ICONS

Use **Lucide React** (or Lucide standalone SVG). All icons must be outline/stroke style, stroke-width 1.75. Size: 18px inline (nav), 16px compact (badges), 20–24px headings.

Do NOT use filled icons except:
- Star icon when "favorited" → filled amber
- Heart icon if used → filled red

---

## 9. LOADING STATES

### 9.1 Skeleton Loaders
When data is loading, show skeleton placeholders:
```css
.skeleton {
  background: linear-gradient(90deg, 
    var(--bg-elevated) 25%, 
    var(--bg-float) 50%, 
    var(--bg-elevated) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-sm);
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
```
Skeletons mimic the shape of real content (text lines, card shapes, circular avatars).

### 9.2 Spinner
For inline loading (Refresh button etc.):
```css
Circular spinner, 16px, stroke: var(--accent-primary), stroke-width: 2px
animation: spin 700ms linear infinite
```

---

## 10. ACCESSIBILITY BASELINE

- All interactive elements must have visible focus styles (use `box-shadow: 0 0 0 2px var(--accent-primary)` on `:focus-visible`)
- Color is never the only indicator of state — always pair with icon or text label
- Font sizes never below 11px
- All icon-only buttons have `aria-label` attributes
- Keyboard navigation must work for all primary flows

---

## 11. PERFORMANCE

- Use `will-change: transform` sparingly and only on actively animating elements, not permanently
- Prefer `transform` and `opacity` for animations (GPU composited) over `top/left/width/height`
- Sidebar uses `backdrop-filter` — ensure it doesn't degrade on older hardware (fallback: solid color)
- Progress bars use CSS transitions, not JS animation loops
- Virtual scrolling is NOT required for MVP (lists are short enough)

---

## 12. IMPLEMENTATION NOTES

- The window background (behind all content) should be `var(--bg-void)` — the very darkest/lightest base color
- The sidebar floats on top via `backdrop-filter` — set `z-index: 10` on sidebar
- Content area background: `var(--bg-base)`
- Cards float above content area: `var(--bg-surface)` or `var(--card-bg)` with transparent/semi-transparent background
- The "starry night" background image visible in current screenshots can be kept as the `--bg-void` background of the Electron window's HTML background (behind the app shell) for atmosphere in dark mode — use a very subtle, low-opacity cosmic image or replace with the CSS gradient + orbs approach described in the PIN screen
- In light mode, `--bg-void` is a soft neutral lavender-grey, no image

---

## 13. WHAT TO KEEP FROM CURRENT UI

- The color scheme accent (indigo/purple — `#635bff` is a great choice, close to the current purple)
- The overall navigation structure (sidebar + content area)
- The FM logo concept
- The general information architecture (which items are on which screen)
- The "D" user avatar concept in the bottom right (but style it properly per spec)

## 14. WHAT TO COMPLETELY REPLACE

- All flat monochrome card backgrounds → use subtle glassmorphic layered surfaces
- The plain black (#000 or near-#000) uniform background → use the layered void/base/surface system
- All unstyled flat buttons → use the full button spec
- The tab pill bar in Bloom's Engine → use the styled tab bar
- All plain text lesson log entries → use proper cards
- PIN screen empty black background → use the gradient + orbs approach
- Progress bars (currently absent on OBE screen) → add animated bars per spec
- Typography (currently looks like default system font) → Inter throughout
- All icons (currently emoji + inconsistent) → Lucide outline icons throughout

---

*End of FacultyMind UI Redesign Specification — v1.0*
*Prepared for handoff to AI developer agent*
