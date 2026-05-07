# Frontend UI Design — VoiceChat EFL

## Overview

Single-page React app with no router. Navigation is handled entirely through state in `App.jsx`. There are three pages plus a landing screen, each rendered by swapping the top-level JSX tree.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Framework | React 18 (Vite) |
| Styling | Plain CSS (`index.css`) — no CSS modules, no Tailwind |
| Icons | Google Material Symbols (variable font, loaded via CDN) |
| Fonts | Inter (body), Manrope (headings) |
| State | `useState` / `useRef` only — no context, no redux |

---

## Design Tokens (`index.css` `:root`)

All colours and radii are CSS variables. Every component references these — never raw hex values except in the feedback and AI-panel accent colours, which are one-off.

| Variable | Value | Used for |
|---|---|---|
| `--primary` | `#0059bb` | Buttons, active states, links |
| `--primary-hover` | `#004493` | Button hover |
| `--primary-light` | `rgba(0,89,187,0.09)` | Active card backgrounds, badges |
| `--danger` | `#ba1a1a` | Destructive buttons, error text |
| `--surface` | `#f4f5f7` | Page background |
| `--surface-card` | `#ffffff` | Cards |
| `--outline` | `#717786` | Muted text, icons |
| `--outline-variant` | `#c1c6d7` | Borders, dividers |
| `--on-surface` | `#1b1b1b` | Primary body text |
| `--on-surface-variant` | `#414754` | Secondary body text |
| `--radius` | `8px` | Inputs, small elements |
| `--radius-md` | `12px` | Buttons, chips, medium cards |
| `--radius-lg` | `16px` | Large cards, modals |
| `--shadow` | `0 2px 12px rgba(0,0,0,0.08)` | Card elevation |

---

## App-Level Navigation (`App.jsx`)

State machine with three variables:

```
mode: null | 'student' | 'teacher'
teacher: null | { id, name }
chatSession: null | { sessionId, agentId, task, studentName, speechSpeed, voiceId }
```

Priority order:
1. If `chatSession` → render `<VoiceChat>`
2. Else if `mode === 'teacher'` → render `<TeacherDashboard>`
3. Else if `mode === 'student'` → render `<StudentHome>`
4. Else → render Landing screen

No `<BrowserRouter>` or URL changes — the URL stays at `/` throughout.

---

## Screens

### 1. Landing

**File:** `App.jsx` (inline JSX)  
**Class:** `.landing`

Centred card on a soft blue-to-grey gradient background. Contains:

- Blue rounded-square logo (`record_voice_over` icon, 64×64px, `border-radius: 20px`)
- App title (Manrope 28px 800 weight)
- Subtitle (muted, 15px)
- Two full-width buttons stacked vertically:
  - **Student** — filled primary blue (`landing-btn student`)
  - **Teacher** — outlined ghost button (`landing-btn teacher`)

Both buttons lift slightly on hover (`transform: translateY(-1px)` on student only).

---

### 2. Student Setup (`StudentHome.jsx`)

**Class:** `.page-center > .student-card`

A white card (max-width 560px) centred on the page. Uses a 4-step wizard driven by `step` state (1–4). Step 4 is a full-page loading spinner.

#### Step 1 — Name entry
- Large input (`.input.lg`, font-size 18px)
- Enter key advances to step 2
- Continue button disabled until name is non-empty

#### Step 2 — Task picker
- Scrollable list of task cards (`.task-option`, max-height 300px)
- Each card shows: task title (bold), topic (muted 12px), teacher name (muted 11px)
- Selected card gets `border-color: var(--primary)` + `background: var(--primary-light)`
- Continue disabled until a task is selected

#### Step 3 — Profile settings

Four sections, each wrapped in `.profile-section`:

**English Level Slider**
- Custom `<input type="range">` (0–4, step 1) styled to look like a segmented track
- Track colour splits at thumb: left side primary blue, right side outline-variant grey
- Thumb: 22px white circle with blue fill and drop-shadow, scales 1.15× on hover
- CEFR tick labels below (`A1 A2 B1 B2 C1+`), active one turns primary blue
- Below the slider: level name (bold 15px) + pill badge showing CEFR code

**Voice Picker**
- 3-column grid (`.voice-grid`) of cards (`.voice-card`)
- Each card: gender icon (Material Symbols `face` or `face_3`), name (bold 13px), accent·age descriptor (muted 10px)
- Active card: primary border + light-blue background
- 7 voices: Rachel, Bella, Lily (female) · Eric, Josh, Adam (American male) · James (Australian male)

**Speaking Speed**
- Three pill chips: Slow / Normal / Fast (`.chip-group > .chip`)
- Active chip: filled primary blue background
- Auto-selects "Slow" when level is Beginner or Elementary

**Interests** (optional)
- Single text input, comma-separated values

**Learning Style**
- 2×2 grid (`.style-grid`) of cards (`.style-card`)
- Each card: icon (top), label (bold 13px), one-line description (muted 11px, line-height 1.4)
- Four options: Visual, Auditory, Reading, Kinesthetic
- Active card: primary border + light-blue background

Start button triggers loading → API call → transition to VoiceChat.

#### Step 4 — Loading
Full-page centred spinner (spinning `sync` icon, 48px primary blue) with "Setting up your conversation…" text.

---

### 3. Voice Chat (`VoiceChat.jsx`)

**Class:** `.voice-chat`

Full-viewport flex column. Three zones:

#### Header (`.vc-header`)
White bar with shadow. Left side: avatar circle (44px, primary blue, filled `face` icon) + persona name + task title. Right side: red "End Chat" button.

#### Transcript area (`.vc-transcript`)
Scrollable flex column. Chat bubbles left/right:

- **Agent** (left-aligned, `.vc-bubble.agent`): white background, 1px outline border, top-left corner is squared (`border-radius: 4px 12px 12px 12px`)
- **User** (right-aligned, `.vc-bubble.user`): primary blue fill, white text, top-right corner squared (`border-radius: 12px 4px 12px 12px`)
- Name label above each bubble: 11px uppercase muted, right-aligned for user
- Waiting prompt shown when transcript is empty and not yet connecting

#### Status bar (`.vc-status-bar`)
White bar with top border. Centre-aligned status indicator with animated pulsing dot:

| State | Dot colour | Pulse speed |
|---|---|---|
| `idle` (listening) | Green `#22c55e` | 2s (slow) |
| `speaking` | Primary blue | 0.8s (medium) |
| `user_speaking` | Amber `#f59e0b` | 0.5s (fast) |
| `connecting` | Grey | none |

#### Feedback loading screen
When "End Chat" is clicked: full-page centred spinner with `auto_awesome` icon (primary blue, 48px) + "Preparing your feedback…".

---

### 4. Post-Session Feedback (`VoiceChat.jsx` — feedback screen)

**Class:** `.feedback-page`

Rendered in place of the voice chat after the transcript is saved. Max-width 640px, centred, vertical stack with 24px gaps.

#### Header
Centred: "Session Feedback" (Manrope 26px 800) + "Great work, [name]!" in muted text below.

#### Overall encouragement (`.feedback-overall`)
Amber-tinted card (`#fffbeb` background, `#fde68a` border). Filled gold star icon left, 2-sentence AI-written encouragement right.

#### Per-utterance feedback (`.feedback-sentences`)
Up to 3 cards (`.feedback-item`), white with outline border. Each contains:

1. **"You said" block** — tiny uppercase label + italicised quote of the student's original utterance
2. **What worked** (`.feedback-row.positive`) — green tinted (`#f0fdf4`), green check-circle icon, positive observation text
3. **What to improve** (`.feedback-row.improve`) — blue tinted (`#eff6ff`), blue lightbulb icon, one specific correction note *(only shown if `needs_improvement` is non-null)*
4. **"Try saying" block** (`.feedback-corrected`) — surface-grey background, primary-blue bold text with the corrected version *(only shown if `corrected` is non-null)*

#### Done button
Centred "Back to Home" button with `home` icon. Calls `onEnd()` which resets `chatSession` to null, returning to Landing.

---

### 5. Teacher Dashboard (`TeacherDashboard.jsx`)

Internal view state: `'login'` → `'tasks'` → `'sessions'` (or `'register'`).

#### Login / Register screens
`.page-center > .auth-card` — white card (max-width 380px), centred. Single input + submit button. Register screen has name + code fields. Toggle between login/register with a link-style button.

#### Tasks view
`.page > .tasks-grid` — responsive CSS grid (`repeat(auto-fill, minmax(280px, 1fr))`). Each task is a `.task-card` (white, 1px border, 20px padding) showing:
- Title + red delete icon button (appears on hover with red background flash)
- Topic (muted)
- First 2 learning objectives as a bulleted list, "+ N more" if there are extras
- "View Sessions" outline button with `manage_search` icon

"+ New Task" button in the page header opens the inline task creation form.

#### New Task form (`.new-task-form`)
Inline form (not a modal) that appears above the task grid. Has a primary-blue border to distinguish it from the grid.

- **Header row**: "New Task" title + "Generate from text" button (purple `#7c3aed` outline)
- **AI panel** (`.ai-panel`, purple-tinted `#f5f3ff`): collapsible textarea + "Analyse" button. Shows a spinning icon while loading. On success, fills the form fields and hides the panel.
- **Form row**: Title (required) + Topic — side by side in a 2-column grid
- **Learning Objectives** — textarea, one per line
- **Vocabulary** — textarea, comma or newline separated
- **Language Forms** — textarea, example sentences one per line
- **Actions row**: Cancel + Save Task (disabled until title has a value)

#### Sessions view
`.page > .sessions-list` — vertical list of `.session-card` items. Each card shows a header (student name, level badge, timestamp) and a scrollable transcript (max-height 320px). Role labels are primary blue for student, muted grey for AI.

---

## Shared Components / Patterns

### Buttons

| Class | Style | Use |
|---|---|---|
| `.btn.primary` | Filled primary blue | Main actions |
| `.btn.outline` | Ghost with border | Secondary actions |
| `.btn.danger` | Filled red | Destructive (end chat, delete task) |
| `.btn.sm` | Smaller padding | Inline actions (headers, cards) |
| `.back-btn` | Borderless muted text | Navigation backwards |
| `.link-btn` | Underlined primary text | Inline text links |
| `.icon-btn.danger` | Ghost icon, red on hover | Delete icon buttons |

All `.btn` elements: `inline-flex` with 8px icon gap, 14px Inter 600, 12px radius, 0.15s transition.

### Inputs

All use class `.input`:
- 1.5px border in `--outline-variant`
- Focus state: border turns `--primary`
- Block display, 100% width
- `.input.lg` variant: 18px font, more padding (used for name entry on step 1)
- `<textarea>` uses same class with `resize: vertical`

### Icons

Material Symbols variable font loaded from Google CDN. Two variants:
- Default (outline): `font-variation-settings: 'FILL' 0`
- `.fill`: `font-variation-settings: 'FILL' 1`
- `.sm` modifier: 16px size (default 20px)

Spinning animation: `.spin` class applies `animation: spin 1s linear infinite`.

### Loading state

`.loading-state`: centred column flex, 16px gap. Used in two places:
- Student setup step 4 (session starting)
- Feedback loading (after end chat)

Both use a spinning Material Symbol icon at 48px primary blue.

---

## Layout Patterns

| Pattern | Class | Description |
|---|---|---|
| Full-page centred | `.page-center` | `min-height: 100vh`, flexbox centred both axes |
| Constrained page | `.page` | max-width 900px, 24px padding |
| Page with header | `.page-header` | flex row with auto-flex h2, wraps on small screens |
| Full-viewport chat | `.voice-chat` | `height: 100vh` flex column, transcript flex-grows |

---

## Responsive Behaviour

No explicit media queries are used. Responsiveness comes from:

- CSS grid with `auto-fill` / `minmax` (tasks grid, voice picker, style grid)
- `flex-wrap: wrap` on page headers and session headers
- `max-width` constraints on cards with `width: 100%`
- The voice picker grid is hardcoded `repeat(3, 1fr)` — on very narrow screens it compresses but doesn't break to 1 column

The app is designed primarily for desktop/tablet. Mobile is usable but not optimised (no touch-specific adjustments).

---

## Animation Summary

| Animation | Trigger | CSS |
|---|---|---|
| Status dot pulse | Always-on during voice states | `@keyframes pulse`: opacity + scale |
| Loading spinner | Loading states | `@keyframes spin`: rotate 360° |
| Voice slider thumb | Hover | `transform: scale(1.15)`, 0.1s |
| Buttons | Hover | `background`, `border-color`, `color` all 0.15s |
| Landing student btn | Hover | `transform: translateY(-1px)` |
