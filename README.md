# pi-vim

Vim motions extension for [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Replaces the default input editor with a vim-modal editor supporting normal, insert, visual, and replace modes.

## Install

```bash
pi install npm:@burneikis/pi-vim
```

### With Fuzzy File Picker

Install [pi-fzfp](https://github.com/burneikis/pi-fzfp) as a separate pi package alongside pi-vim:

```bash
pi install npm:@burneikis/pi-fzfp
```

That's it. When both are installed, pi-vim detects pi-fzfp at startup and integrates its fuzzy autocomplete automatically. pi-fzfp will not install its own editor — pi-vim handles the editor and wraps its autocomplete provider with fzfp's fuzzy matching.

> **Requires** [`fd`](https://github.com/sharkdp/fd) and [`fzf`](https://github.com/junegunn/fzf) on your `PATH`.

## Features

### Vim Motions
- Normal, Insert, Visual, and Replace modes
- Motions (`h`, `j`, `k`, `l`, `w`, `b`, `e`, `0`, `$`, `gg`, `G`, etc.)
- Operators (`d`, `c`, `y`, `p`, etc.)
- Text objects (`iw`, `aw`, `i"`, `a(`, etc.)
- Search (`/`, `?`, `n`, `N`)
- Registers and yank/paste
- Dot repeat

### Fuzzy File Picker (optional, via pi-fzfp)
- Replaces `@file` autocomplete with weighted dual-key fuzzy matching
- Basename matches scored 2× higher than path matches
- Suffix alignment bonus for extension-aware matching (`@acts` → `abct.ts` over `abct.scss`)
- Path prefix pre-filtering when query contains `/`
- Test file penalty as a tiebreaker

## Integration Protocol

pi-vim and pi-fzfp coordinate via `pi.events` so they work regardless of which extension loads first. Other custom editors can use the same protocol to integrate pi-fzfp.

### As an editor extension that wants pi-fzfp integration

Register listeners during your extension factory (before `session_start`), so they are in place regardless of load order:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider } from "@mariozechner/pi-tui";

export default function (pi: ExtensionAPI) {
  let wrapAutocomplete: ((provider: AutocompleteProvider) => AutocompleteProvider) | undefined;

  // Tell pi-fzfp not to set its own editor component.
  pi.events.on("pi-fzfp:check-editor", (ack: () => void) => { ack(); });

  // Receive the provider (pi-fzfp emits this from both its factory and
  // session_start to cover both load orderings).
  pi.events.on("pi-fzfp:provider", (fn: (provider: AutocompleteProvider) => AutocompleteProvider) => {
    wrapAutocomplete = fn;
  });

  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) =>
      new MyEditor(tui, theme, keybindings, wrapAutocomplete)
    );
  });
}
```

Then apply `wrapAutocomplete` inside your editor's `setAutocompleteProvider`:

```typescript
override setAutocompleteProvider(provider: AutocompleteProvider): void {
  super.setAutocompleteProvider(this.wrapAutocomplete ? this.wrapAutocomplete(provider) : provider);
}
```
