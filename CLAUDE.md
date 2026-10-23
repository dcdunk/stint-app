# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Gr8r Studio: a project management workspace. The same web code ships two ways: as a website (Vercel) and as a Mac app (Tauri, in `src-tauri/`, which wraps the Vite build in macOS's built-in WebKit view). Plain JavaScript ES modules and CSS, bundled by Vite. No UI framework, no runtime dependencies, no backend. Data starts as an empty workspace (`blank()` in `src/data/seed.js`) and the first launch runs setup (`A.startFresh`, also triggered by Settings → Delete workspace). `seed()` in the same file is a full demo workspace for screenshots and UI testing; it is no longer loaded by default. Every top-level key in `seed()` must also exist in `blank()` (enforced by `test/blank.test.js`), or pages that read it will crash on a fresh install. Data is persisted to `localStorage` under the key `gr8r.v2` (see `src/core/store.js`). Clearing that key starts setup again.

## Commands

```bash
npm install
npm run dev            # http://localhost:5173, hot reload
npm run build          # production build into dist/
npm run preview        # serve the production build
npm run lint           # ESLint (flat config)
npm run format         # Prettier, writes files
npm run format:check   # Prettier, check only
npm run mac:dev        # Mac app window with hot reload (needs Rust: ~/.cargo/bin)
npm run mac:build      # unsigned .app + .dmg in src-tauri/target/release/bundle/
```

`npm test` runs `test/*.test.js` with Node's built-in runner (single file: `node --test test/blank.test.js`). CI (`.github/workflows/ci.yml`) runs `lint`, `format:check`, `test` and `build` on every push to main and every PR, so run all three before calling a change done, and verify UI changes in the running dev server. Node 22 (`.nvmrc`). Deploys to Vercel from `dist/` (`vercel.json`).

In dev builds, `window.__gr8r` exposes `{ S, D, A, go, render }` for debugging from the browser console.

## Architecture

**State.** `src/core/store.js` holds one mutable store `S` (`S.data` = workspace data, `S.prefs` = user preferences, `S.views` = saved per-view settings, `S.ui` = transient UI state like route, open drawer, expanded rows). `D()` is shorthand for `S.data`. Lookup helpers (`proj`, `task`, `mem`, `team`, `tasksOf`, `canSee`, ...) live there too. Call `save()` after mutating persisted state.

**Rendering.** Every page, view and overlay is a function that returns an HTML string built from `S`. `render()` in `src/shell/render.js` rebuilds the whole shell from scratch on every change while preserving focus and scroll position. There is no virtual DOM and no component state: change `S`, then call `render()`.

**Routing.** `go(route, params)` in `src/shell/render.js` sets `S.ui.route`/`S.ui.params`. Route names are listed in `ROUTE_NAMES`. On boot, `location.hash` selects the initial route or an auth screen (`login`, `signup`, `onboarding`, ...). Project sub-views (board, list, table, calendar, timeline, files, overview) are tabs defined by `PTABS` in `src/pages/project.js`, rendered from `src/views/`.

**Interactions (event delegation).** Markup never binds listeners directly. Elements declare `data-a="actionName"` (click), `data-in` (input) or `data-blur` (blur); `src/actions/events.js` delegates to handlers on the shared action table `A` exported from `src/actions/actions.js`. Other `actions/*.js` modules add handlers to `A` as an import side effect, so they must be imported in `src/main.js` after `actions/actions.js`. **Adding a new module means adding its import to `main.js`**, in dependency order.

**Layers.** Dependencies point downward:

1. `core/` and `data/` import nothing else from the app.
2. `ui/`, `shell/`, `components/`, `pages/`, `views/`, `overlays/`, `features/` render HTML from state.
3. `actions/` mutate state and re-render.

Filtering/grouping for list-like views lives in `src/shell/view-engine.js` (`FIELDS` defines filterable fields).

**Mac app (Tauri).** Config is `src-tauri/tauri.conf.json`; the Rust side (`src-tauri/src/`) is the stock template and holds no app logic. On boot, `src/main.js` adds a `desktop` class to `<html>` when running inside Tauri; desktop-only CSS lives at the end of `src/styles/shell.css` and reserves a topbar-high band above the workspace switcher for the window's traffic-light buttons. `.side-top` and `.topbar` carry `data-tauri-drag-region` so they drag the window. `trafficLightPosition.y` in the config is not a literal pixel offset; check alignment with the "Home" breadcrumb visually after changing it or `--topbar-h`. Fonts are bundled via `@fontsource` (no network) so the app looks identical offline. `localStorage` persists per bundle `identifier` (`com.dcdunk.gr8rstudio`): changing it wipes users' saved data.

## Conventions

- **Icons:** call `ic('name')` with any Lucide icon name. A custom Vite plugin in `vite.config.js` (`virtual:icons`) scans `src/**/*.js` for quoted kebab-case strings matching Lucide names and bundles only those. A name built dynamically (string concatenation) will not be found; keep icon names as literal strings somewhere in source.
- **Dropdowns:** write a plain `<select class="select">`; `src/ui/select.js` renders the styled menu and keeps the native element as the source of truth.
- **Layout:** every page edge uses `var(--gutter)` (defined in `src/styles/tokens.css`) so headers, toolbars, lists, tables and boards align. Design tokens (colour, spacing, type, radius) all live in `tokens.css`.
- **CSS:** `src/styles/index.css` imports every stylesheet in cascade order; new stylesheets must be added there.
- Escape user-provided text with `esc()` from `src/core/utils.js` when interpolating into HTML strings.
