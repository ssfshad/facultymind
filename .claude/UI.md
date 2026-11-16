# FacultyMind — UI Design System
# Every screen in FacultyMind must follow these rules.
# Claude Code: read this before building any UI component.
# Consistency across every screen is non-negotiable.

---

## Design Philosophy
FacultyMind must feel like a professional academic tool, not a student project.
Clean. Confident. No clutter. Every element has a purpose.
If you are adding something and you are not sure why it is there — remove it.

---

## Colour Palette

### Primary Colours
Navy (brand):       #1A2F5A  — headings, sidebar, primary actions
Blue (accent):      #2563EB  — buttons, links, active states
Teal (ShadSync):    #0D9488  — ShadSync module, OBE-related elements
Gold (signature):   #B45309  — ShadSync branding, special highlights

### Status Colours
Success / LIVE:     #16A34A  (green)
Warning / MEDIUM:   #D97706  (amber)
Error / HIGH:       #DC2626  (red)
Inactive / ROADMAP: #94A3B8  (gray)
Info / DEMO-READY:  #2563EB  (blue)

### Background Colours
Main background:    #F8FAFC  (off-white — never pure white)
Card background:    #FFFFFF  (white)
Sidebar:            #1A2F5A  (navy)
Sidebar active:     #2563EB  (blue highlight)
Input background:   #F1F5F9  (light gray)

### Text Colours
Primary text:       #1E293B  (dark slate)
Secondary text:     #64748B  (medium gray)
Disabled text:      #94A3B8  (light gray)
Sidebar text:       #E2E8F0  (near white)
Sidebar active:     #FFFFFF  (white)

---

## Typography

### Font Stack
Primary:   'Inter', 'Segoe UI', sans-serif
Monospace: 'JetBrains Mono', 'Consolas', monospace (for code, keys)

### Font Sizes (CSS rem)
Page title:     2rem   (32px)  bold
Section header: 1.5rem (24px)  semibold
Card title:     1.125rem (18px) semibold
Body text:      0.875rem (14px) regular
Small/caption:  0.75rem  (12px) regular
Label:          0.75rem  (12px) medium, uppercase, letter-spacing: 0.05em

### Font Weights
Bold:       700 (titles, important data)
Semibold:   600 (card titles, nav items)
Medium:     500 (labels, buttons)
Regular:    400 (body text)

---

## Spacing System (8px base)
4px   — tight internal padding
8px   — small gap between related elements
16px  — standard padding inside cards
24px  — gap between cards
32px  — section spacing
48px  — major section breaks

---

## Window Layout
```
┌────────────────────────────────────────────────────┐
│  SIDEBAR (220px)   │  MAIN CONTENT AREA            │
│                    │                               │
│  [Logo/Title]      │  [Page Header]                │
│                    │                               │
│  Navigation:       │  [Module Content]             │
│  - Dashboard       │                               │
│  - Chat / AI       │                               │
│  - ShadSync        │                               │
│  - Schedule        │                               │
│  - Bloom's         │                               │
│  - Email           │                               │
│  - Vault           │                               │
│  - Portal          │                               │
│                    │                               │
│  ─────────────     │                               │
│  Settings          │  [WhisperFlow mic button]     │
│  Memory            │  [Chat input bar — bottom]    │
└────────────────────────────────────────────────────┘
```

Sidebar: navy (#1A2F5A), fixed 220px width, not collapsible for MVP
Main content: scrollable, 24px padding all sides
Chat input: fixed at bottom of main content area when chat is active

---

## Component Rules

### Buttons
Primary:    Blue background (#2563EB), white text, 8px border-radius, 12px 20px padding
Secondary:  White background, blue border, blue text
Danger:     Red background (#DC2626), white text
Disabled:   Gray background (#E2E8F0), gray text, cursor: not-allowed
Hover:      10% darker than base colour
Active:     15% darker + slight scale(0.98)
Loading:    Show spinner inside button, disable click during loading

### NEVER:
- Flat text links pretending to be buttons (use actual button elements)
- Buttons without hover states
- Buttons that do nothing when clicked (even if feature is incomplete — show toast)

### Cards
Background: white
Border: 1px solid #E2E8F0
Border-radius: 12px
Padding: 20px
Shadow: 0 1px 3px rgba(0,0,0,0.08)
Hover (if clickable): shadow increases slightly

### Input Fields
Background: #F1F5F9
Border: 1px solid #CBD5E1
Border-radius: 8px
Padding: 10px 14px
Focus: border colour changes to #2563EB, no outline (use border instead)
Error: border colour changes to #DC2626, red helper text below
Placeholder text: #94A3B8

### Dropdown Menus
Must open downward (or upward if near bottom of screen — auto-detect)
Max height: 300px, scrollable if more items
Selected item: blue background, white text
Hover: light blue background (#DBEAFE)
Close on: click outside, Escape key, item selection
Never: dropdowns that open and immediately close, or open off-screen

### Navigation (Sidebar)
Active module: blue left border (4px) + blue text + light blue background
Inactive: no border, gray-white text
Hover: very subtle background lightening
Icons: 20px, consistent icon set (use Lucide icons)

### Notifications / Toasts
Position: top-right corner
Duration: 4 seconds auto-dismiss (error: stays until dismissed)
Types: success (green), error (red), info (blue), warning (amber)
Max visible at once: 3 (older ones dismiss automatically)

---

## Loading States
EVERY async operation must show a loading state. No exceptions.

Types to use:
- Skeleton loader: for lists and cards (animated gray placeholder shapes)
- Spinner: for buttons during action
- Progress bar: for PDF processing (long operation)
- "Thinking..." text: for AI responses before streaming starts

Rules:
- Never show a blank screen while data loads
- Never freeze the UI during any operation
- If an operation takes more than 500ms → show loading state
- If an operation takes more than 10 seconds → show progress with cancel option

---

## Error States
EVERY possible failure must show a clear, friendly error. No raw error objects ever.

Good error: "Could not connect to Gmail. Check your internet connection and try again."
Bad error: "Error: ECONNREFUSED 0.0.0.0:443" ← never show this to professor

Rules:
- All API errors caught and translated to human-readable messages
- All empty states explained: "No classes scheduled yet. Add your first course."
- Network errors suggest checking connection
- AI API errors suggest checking API key in settings
- Database errors (rare): suggest restarting app, never data loss

---

## ShadSync Specific UI Rules
ShadSync is the most complex module. Follow these additional rules:

- Attainment numbers always shown with % symbol and one decimal: "74.2%"
- Below threshold: always shown in red (#DC2626) with warning icon
- Above threshold: shown in green (#16A34A)
- Near threshold (60-65%): shown in amber (#D97706) as early warning
- CLO labels: always bold, always include description on hover (tooltip)
- Charts: use clean bar or radar charts. No pie charts (hard to read precise values)
- Table rows alternate background for readability (#F8FAFC on even rows)
- "Powered by ShadSync" credit in footer of every OBE report (small, tasteful)

---

## Chat Interface Rules
- User messages: right-aligned, blue bubble
- AI messages: left-aligned, white card with subtle border
- AI model badge: small pill showing "Claude" / "GPT-4o" / "Gemini" on each AI message
- WhisperFlow button: prominent mic icon, bottom-right of chat input
- Transcription preview: shown in input field before submit (editable)
- Streaming: AI response streams word by word (do not wait for full response)
- Copy button: appears on hover for every AI message

---

## Window Size Requirements
Minimum supported: 1280 × 720 px
Optimal: 1440 × 900 px
Must not break at: 1920 × 1080 px

Test all screens at 125% Windows display scaling (common on laptops).
If anything overflows or misaligns at 125% — fix it.

---

## Things That Are BANNED From The UI
- Horizontal scrollbars (layout must fit at minimum width)
- Text that overflows its container without ellipsis or wrapping
- Buttons that are too small to click accurately (minimum 36px height)
- Modal dialogs with more than 3 action buttons
- More than 2 levels of navigation depth
- Any "lorem ipsum" or "placeholder" text at any time
- "undefined", "null", or "[object Object]" visible to user
- Empty dropdown menus (if no options — show "No items yet" message)
- Alert() or confirm() browser dialogs (use custom modal components)
- Form submission without validation feedback
- Success action with no confirmation to the user
