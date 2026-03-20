# pi-vim: Vim Motions Extension for pi-coding-agent

## Overview

A pi extension that replaces the default input editor with a vim-modal editor supporting Normal, Insert, and Visual modes with comprehensive vim motions, operators, and text objects.

## Architecture

### Extension Point

pi provides `ctx.ui.setEditorComponent(factory)` which accepts a factory returning a `CustomEditor` subclass. The `CustomEditor` (from `@mariozechner/pi-coding-agent`) extends `Editor` (from `@mariozechner/pi-tui`) and handles app-level keybindings (escape to abort agent, ctrl+d to exit, ctrl+p model cycling, etc.).

**Key constraint:** The base `Editor` class has almost entirely `private` internal state (cursor position, lines, undo stack, kill ring, etc.). Our `VimEditor` cannot access or manipulate these directly. We must work through:

1. **`super.handleInput(data)`** — feed escape sequences/characters to the base editor
2. **`this.getText()` / `this.setText(text)`** — read/write full buffer content
3. **`this.getCursor()`** — read cursor `{ line, col }`
4. **`this.insertTextAtCursor(text)`** — insert at cursor
5. **`super.render(width)`** — delegate rendering, then overlay mode indicator
6. **Escape sequences** — simulate arrow keys (`\x1b[A/B/C/D`), home (`\x01`), end (`\x05`), delete (`\x1b[3~`), etc. to drive cursor movement

### Project Structure

```
pi-vim/
├── plan.md
├── package.json
├── src/
│   ├── index.ts              # Extension entry point
│   ├── vim-editor.ts         # VimEditor extends CustomEditor
│   ├── modes/
│   │   ├── normal.ts         # Normal mode handler
│   │   ├── insert.ts         # Insert mode handler
│   │   └── visual.ts         # Visual mode handler (visual, visual-line)
│   ├── motions.ts            # Motion definitions (w, b, e, f, t, gg, G, etc.)
│   ├── operators.ts          # Operator definitions (d, c, y, >, <)
│   ├── text-objects.ts       # Text objects (iw, aw, i", a", i(, a(, etc.)
│   ├── registers.ts          # Yank/paste register system
│   ├── repeat.ts             # Dot-repeat (.) tracking
│   ├── state.ts              # Shared vim state (mode, count, pending operator, etc.)
│   └── keys.ts               # Key parsing utilities
└── README.md
```

## Implementation Plan

### Phase 1: Core Infrastructure & Basic Normal/Insert Modes

**Goal:** Functional modal editor with basic hjkl navigation and i/a mode switching.

#### 1.1 — VimEditor Skeleton (`vim-editor.ts`, `index.ts`)

- Extend `CustomEditor`
- Maintain `VimState`: current mode, pending operator, count prefix, last command for `.`
- Override `handleInput(data)`: route to mode-specific handlers
- Override `render(width)`: call `super.render()`, replace bottom border with mode indicator (`-- NORMAL --`, `-- INSERT --`, etc.)
- Register via `session_start` → `ctx.ui.setEditorComponent`
- Show mode in footer via `ctx.ui.setStatus("vim", mode)`

#### 1.2 — State Machine (`state.ts`)

```typescript
interface VimState {
  mode: "normal" | "insert" | "visual" | "visual-line" | "operator-pending";
  count: number;           // Numeric prefix (0 = none)
  pendingOperator: string | null;  // 'd', 'c', 'y', '>', '<', etc.
  register: string;        // Current register ('"' = default)
  lastChange: RecordedChange | null;  // For dot-repeat
  visualAnchor: { line: number; col: number } | null;
}
```

#### 1.3 — Buffer Abstraction (`buffer.ts` or inline)

Since `Editor` state is private, we need a "shadow state" approach:

- Before each normal-mode key processing: read `getText()` + `getCursor()` to get current state
- Compute desired new cursor position / text mutation
- Apply via `setText()` + cursor positioning (feed arrow keys / home/end sequences to `super.handleInput`)

**Cursor positioning strategy:** After `setText()`, cursor goes to end. We need a helper:
- `setText(newText)` then use escape sequences to navigate to target position
- OR: use `insertTextAtCursor` for insertions and simulate delete sequences for deletions
- Best approach: `setText()` resets cursor to end-of-text, then programmatically emit cursor movement sequences to reach target position. This is reliable but potentially slow for large buffers.

**Optimization:** Track cursor offset, use minimal movement sequences (relative moves when close, absolute via home + right-arrows when needed).

#### 1.4 — Insert Mode (`modes/insert.ts`)

- Pass all keys through to `super.handleInput(data)` (base editor handles text insertion, backspace, etc.)
- Intercept `Escape` → switch to Normal mode
- Track inserted text range for dot-repeat
- Support `Ctrl+[` as Escape alias
- `Ctrl+c` → Normal mode (without triggering pi's clear)
- `Ctrl+o` → execute one Normal mode command, return to Insert

#### 1.5 — Basic Normal Mode (`modes/normal.ts`)

Initial key mappings:
- `h/j/k/l` — directional movement (via escape sequences to `super.handleInput`)
- `0` / `$` — line start/end (via `\x01` / `\x05`)
- `i` — insert mode (at cursor)
- `a` — insert after cursor (move right, then insert mode)
- `I` — insert at line start
- `A` — insert at line end
- `o` — open line below
- `O` — open line above
- `Escape` — pass to super (aborts agent if streaming)
- Numeric prefix accumulation (`1-9` start count, `0` after digits continues count)

### Phase 2: Motions & Word Movement

**Goal:** Full motion vocabulary for use standalone and with operators.

#### 2.1 — Motion System (`motions.ts`)

Each motion returns `{ line: number, col: number }` (target position) given current state:

```typescript
interface Motion {
  (text: string[], cursor: {line: number, col: number}, count: number): {line: number, col: number};
  linewise?: boolean;  // Does this motion select whole lines?
  inclusive?: boolean;  // Is end position included?
}
```

Motions to implement:

| Motion | Description | Priority |
|--------|-------------|----------|
| `w` | Next word start | P1 |
| `b` | Previous word start | P1 |
| `e` | Next word end | P1 |
| `W/B/E` | WORD variants (whitespace-delimited) | P1 |
| `f{char}` / `F{char}` | Find char forward/backward | P1 |
| `t{char}` / `T{char}` | Till char forward/backward | P1 |
| `;` / `,` | Repeat/reverse last f/F/t/T | P2 |
| `gg` / `G` | Go to first/last line | P1 |
| `{count}G` | Go to line number | P2 |
| `^` | First non-whitespace | P1 |
| `%` | Matching bracket | P2 |
| `{` / `}` | Paragraph motion (blank-line delimited) | P2 |
| `H/M/L` | Screen top/middle/bottom | P3 (depends on visible area) |

#### 2.2 — Cursor Positioning Helper

Implement a reliable `moveCursorTo(line, col)` method:

```typescript
// Strategy: use setText to set content, then position cursor
// Alternative: compute minimal sequence of arrow key presses
private moveCursorTo(targetLine: number, targetCol: number): void {
  const current = this.getCursor();
  // Move to target using minimal escape sequences
  // Vertical: up/down arrows
  // Horizontal: home then right arrows, or direct if close
}
```

### Phase 3: Operators & Text Objects

**Goal:** `d`, `c`, `y` work with motions and text objects.

#### 3.1 — Operator System (`operators.ts`)

Operators are "pending" — they wait for a motion or text object:

```typescript
// User types: d2w
// 1. 'd' sets pendingOperator = 'd'
// 2. '2' sets count = 2
// 3. 'w' resolves motion → compute range → delete range
```

Operators:
- `d` — delete (cut to register)
- `c` — change (delete + enter insert mode)
- `y` — yank (copy to register)
- `D` — delete to end of line (special case)
- `C` — change to end of line (delete to end + insert mode)
- `Y` — yank whole line (special case)
- `>` / `<` — indent / dedent
- `dd` / `cc` / `yy` — linewise (operator doubled = whole line)

#### 3.2 — Text Objects (`text-objects.ts`)

Text objects return a range `{ start: {line, col}, end: {line, col} }`:

| Object | Description | Priority |
|--------|-------------|----------|
| `iw` / `aw` | Inner/around word | P1 |
| `iW` / `aW` | Inner/around WORD | P2 |
| `i"` / `a"` | Inner/around double-quotes | P1 |
| `i'` / `a'` | Inner/around single-quotes | P1 |
| `` i` `` / `` a` `` | Inner/around backtick | P1 |
| `i(` / `a(` | Inner/around parentheses | P1 |
| `i{` / `a{` | Inner/around braces | P1 |
| `i[` / `a[` | Inner/around brackets | P1 |
| `ip` / `ap` | Inner/around paragraph | P3 |

#### 3.3 — Range Application

Given operator + range:
1. Extract text from range via `getText()`
2. Store in register (for `d`/`c`/`y`)
3. Construct new text (remove range for `d`/`c`, indent for `>`/`<`)
4. Apply via `setText(newText)` + reposition cursor

### Phase 4: Visual Mode

**Goal:** Character-wise and line-wise visual selection with operator application.

#### 4.1 — Visual Mode (`modes/visual.ts`)

- `v` — enter character-wise visual from Normal
- `V` — enter line-wise visual
- Track `visualAnchor` (where selection started) vs current cursor
- All motions work in visual (extend selection)
- Operators (`d`, `c`, `y`, `>`, `<`) apply to selection
- `Escape` / `Ctrl+[` — return to Normal
- `o` — swap cursor and anchor

#### 4.2 — Visual Rendering

The base `Editor.render()` only highlights the cursor position. For visual selection:
- After calling `super.render(width)`, post-process output lines to apply reverse-video to the selected range
- Parse ANSI sequences carefully to insert `\x1b[7m` / `\x1b[27m` at correct visible positions

### Phase 5: Registers, Yank/Paste, Dot-Repeat

#### 5.1 — Registers (`registers.ts`)

- `"` — default register (unnamed)
- `0` — yank register
- `1-9` — delete history (shift on each delete)
- `a-z` — named registers
- `+` / `*` — system clipboard (if accessible, otherwise alias default)
- `"xd` — delete into register x

#### 5.2 — Put Commands

- `p` — paste after cursor / below line (for linewise content)
- `P` — paste before cursor / above line
- `"xp` — paste from register x

#### 5.3 — Dot-Repeat (`repeat.ts`)

Record each "change" (insert session, delete, replace, etc.) as a replayable sequence:
- Track: operator + motion/textobj + inserted text
- `.` replays last change with optional new count

### Phase 6: Search

#### 6.1 — Inline Search

- `/` — forward search (render search input at bottom of editor area)
- `?` — backward search
- `n` / `N` — next/previous match
- `*` / `#` — search for word under cursor

### Phase 7: Additional Features

#### 7.1 — Extra Normal Mode Commands

- `x` — delete char under cursor
- `X` — delete char before cursor (backspace)
- `r{char}` — replace single character
- `R` — replace mode (overtype)
- `~` — toggle case
- `J` — join lines
- `u` — undo (delegate to base editor's ctrl+- or undo mechanism)
- `Ctrl+r` — redo (if available)
- `>>` / `<<` — indent/dedent current line

#### 7.2 — Marks (Stretch)

- `m{a-z}` — set mark
- `'{a-z}` / `` `{a-z} `` — jump to mark (line / exact position)

#### 7.3 — Macros (Stretch)

- `q{a-z}` — record macro
- `@{a-z}` — play macro
- `@@` — replay last macro

## Key Technical Challenges

### 1. Private Editor State

The biggest challenge. The base `Editor` has private `state: { lines, cursorLine, cursorCol }`. We can only read via `getText()` + `getCursor()` and write via `setText()` + escape sequences.

**Mitigation:** Maintain a shadow buffer in VimEditor. On every `handleInput`:
1. Sync shadow state from `getText()` / `getCursor()`
2. Compute vim operation on shadow state
3. Apply result back via `setText()` + cursor positioning

**Risk:** `setText()` resets cursor to end of text. We need to reliably reposition after every edit.

**Alternative approach (preferred for cursor positioning):** Instead of `setText()` for edits, use sequences of delete + insert operations via `super.handleInput()`:
- Select range using shift+arrow (not supported by base editor)
- Or: position cursor → delete forward/backward → insert text
- This keeps the base editor's internal state consistent

**Best practical approach:** For text mutations, do the following:
1. Read current text via `getText()`
2. Compute new text
3. Call `setText(newText)` (cursor goes to end)
4. Emit `\x01` (home) to go to line start, then arrow-down/right to reach target position
5. Since `setText` puts cursor at end of last line, we can compute relative movements from there

### 2. Cursor Positioning After setText()

Looking at the source, `setText()` calls `setTextInternal()` which sets cursor to the last line, last column. From there we can:
- Use `\x01` (Ctrl+A / Home) to go to start of line
- Use `\x1b[A` (up arrow) to go up lines
- Use `\x1b[C` (right arrow) to move right

Helper function:
```typescript
private repositionCursor(targetLine: number, targetCol: number): void {
  const lines = this.getText().split('\n');
  const lastLine = lines.length - 1;

  // From end-of-last-line, go to start of last line
  super.handleInput('\x01'); // Home

  // Go up to target line
  for (let i = lastLine; i > targetLine; i--) {
    super.handleInput('\x1b[A'); // Up
  }

  // Go right to target column
  for (let i = 0; i < targetCol; i++) {
    super.handleInput('\x1b[C'); // Right
  }
}
```

**Performance concern:** For large buffers this could be slow. For typical pi input (10-50 lines of a prompt), this is fine.

### 3. Visual Selection Rendering

The base editor renders cursor with reverse video on one character. For visual mode we need multi-character highlighting. Options:

a) **Post-process render output** — parse super.render() output, find character ranges, inject ANSI reverse-video codes. Complex due to word-wrap and existing ANSI in output.

b) **Custom render override** — fully override render() for visual mode, reimplementing layout. Very complex, duplicates Editor internals.

c) **Pragmatic approach** — Use a simplified visual indicator: show the anchor position with a different marker in the status line, and rely on the mode indicator + status showing the selected range (e.g., "VISUAL 3 lines selected"). Not ideal but functional.

**Recommended:** Option (a) for character-wise visual, with fallback to (c) if too complex. Post-processing `super.render()` is feasible since we know the cursor line and can compute visual positions from the known text content.

### 4. Interaction with pi Keybindings

`CustomEditor` intercepts certain keys before passing to us:
- `app.interrupt` (Escape) when autocomplete is not showing → calls `onEscape`
- `app.exit` (Ctrl+D) when editor empty → calls `onCtrlD`
- `app.clipboard.pasteImage` (Ctrl+V)
- Extension shortcuts
- All registered `actionHandlers` (model cycling, tool expand, etc.)

**Our override of `handleInput` runs first** (since we override it). We need to:
- In Insert mode: pass most keys to `super.handleInput()` which handles app keybindings
- In Normal mode: handle vim keys ourselves, pass unrecognized control sequences to `super.handleInput()` for app keybindings
- Special case: `Escape` in Insert mode → Normal mode (don't pass to super). `Escape` in Normal mode → pass to super (abort agent).

### 5. Autocomplete Compatibility

The base Editor has autocomplete support (slash commands, @ file references). In Insert mode, this should work naturally since we pass keys through to `super.handleInput()`. In Normal mode, autocomplete shouldn't trigger.

## Phased Delivery

| Phase | Deliverable | Effort |
|-------|------------|--------|
| 1 | Basic Normal/Insert, hjkl, i/a/o, mode indicator | 1-2 days |
| 2 | Full motion set (w/b/e/W/B/E, f/t, gg/G, ^/$) | 1 day |
| 3 | Operators (d/c/y) + text objects (iw/aw, quotes, brackets) | 2 days |
| 4 | Visual mode (v/V) with selection + operators | 1-2 days |
| 5 | Registers, proper yank/paste, dot-repeat | 1 day |
| 6 | Search (/,?,n,N,*,#) | 1-2 days |
| 7 | Polish: remaining commands, marks, macros | 1-2 days |

**Total estimate:** ~8-12 days for a comprehensive vim implementation.

## Installation

```bash
# Global
cp -r pi-vim ~/.pi/agent/extensions/pi-vim

# Or project-local
cp -r pi-vim .pi/extensions/pi-vim

# Or test directly
pi -e ./pi-vim/src/index.ts
```

## Configuration (Future)

Could support a `.pi/agent/settings.json` entry or dedicated config:

```json
{
  "vim": {
    "startInInsertMode": true,
    "clipboard": "system",
    "relativenumber": false
  }
}
```
