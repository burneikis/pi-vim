# pi-vim

Vim motions extension for [pi-coding-agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Replaces the default input editor with a vim-modal editor supporting normal, insert, visual, and replace modes.

## Branches

- **`main`** — Vim motions only
- **`fzfp`** — Vim motions + integrated [pi-fzfp](https://github.com/burneikis/pi-fzfp) fuzzy file picker

## Install

### Vim only (main branch)

```bash
pi install git:github.com/burneikis/pi-vim
```

### Vim + Fuzzy File Picker (fzfp branch)

```bash
pi install git:github.com/burneikis/pi-vim#fzfp
cd ~/.pi/agent/extensions/pi-vim
npm install
```

**Do not install pi-fzfp separately when using this branch** — the fuzzy matching is built in.

## Features

### Vim Motions
- Normal, Insert, Visual, and Replace modes
- Motions (`h`, `j`, `k`, `l`, `w`, `b`, `e`, `0`, `$`, `gg`, `G`, etc.)
- Operators (`d`, `c`, `y`, `p`, etc.)
- Text objects (`iw`, `aw`, `i"`, `a(`, etc.)
- Search (`/`, `?`, `n`, `N`)
- Registers and yank/paste
- Dot repeat

### Fuzzy File Picker (fzfp branch)
- Replaces `@file` autocomplete with weighted dual-key fuzzy matching
- Basename matches scored 2× higher than path matches
- Suffix alignment bonus for extension-aware matching (`@acts` → `abct.ts` over `abct.scss`)
- Path prefix pre-filtering when query contains `/`
- Test file penalty as a tiebreaker
- Requires [`fd`](https://github.com/sharkdp/fd) on `PATH`
