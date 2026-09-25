# Summie v4.4 — Release Notes

> **The visual & structural release.** v4.4 brings a complete symbols picker, document zoom, pie charts, a fully branded Windows installer, sidebar indicator polish, checklist upgrades, new document chooser, and deep hardening across Linux, save-state and CI — closing out the Ideas v4.3 backlog and then some.

---

## What's New

### Symbols Picker — Griekse Letters, Wiskunde, Pijlen en Meer

A brand new **Symbolen** panel accessible from the toolbar (**Invoegen → Symbolen**).

- **Four categories** — Greek letters, Mathematical symbols, Arrows, and Miscellaneous
- **Search-as-you-type** — fuzzy filter across name and unicode point
- **Insert at cursor** — click any symbol to insert instantly; the panel stays open for rapid multi-insert
- **Keyboard friendly** — `Esc` closes, arrow keys navigate, `Enter` inserts
- 120+ glyphs covering the full Greek alphabet (upper/lower), common math operators (`∑ ∏ ∫ ∂ ∇ ± × ÷ ≈ ≠ ≤ ≥ ∞ ∝ √`), arrows in 8 directions plus variants, and useful symbols (`° ± ™ © ® € ™ ← ↑ → ↓ ↔ ⇐ ⇑ ⇒ ⇓ ⇔ • ◦ ◆ ◇ ▪ ▫`)
- Persisted `recentSymbols` in `userData/symbols-recent.json` for quick re-access

### Document Zoom — Per-Document, Docs/Word Shortcuts

- **Zoom level per document** — persisted in the `.sumd` payload and restored on load
- **Toolbar control** — `A–` / `A+` buttons with live percentage readout (25%–300%)
- **Keyboard shortcuts** — `Ctrl++` / `Ctrl+-` / `Ctrl+0` (matches Google Docs / Word)
- **Mouse wheel** — `Ctrl+Scroll` zooms the editor viewport without affecting UI chrome
- Applies only to the **editor content area** — topbar, sidebar, landing page stay at 100%
- Zoom state survives save/close/reopen and is included in `docx` export metadata

### Pie Charts (Taartdiagrammen)

Insert fully editable pie charts via **Invoegen → Taartdiagram**.

- **24-color palette** — distinct, color-blind-safe hues; each slice gets its own color by default
- **Per-slice color override** — click a slice in the legend to pick a custom color
- **Optional in-slice percentages** — toggle on/off; shown by default with smart label placement (inside large slices, outside small ones with leader lines)
- **Live data table** — edit values and labels in a spreadsheet-like grid; chart updates in real time
- **Keyboard accessible** — `Tab` through slices, `Enter/Space` to select, arrow keys to adjust values
- Exports to `docx` as a native DrawingML chart (editable in Word)

### Fully Branded Windows Installer

The NSIS installer (`installer/`) is now a first-class Summie experience.

- **Custom UI** — branded header, progress page, finish page with "Launch Summie" checkbox
- **Multi-language** — Dutch (default) and English, auto-detected from system locale
- **Clean reinstall on update** — uninstalls previous version silently, preserves `userData/` (settings, recents, favourites, autosave, symbols, Piper voices)
- **Code signing ready** — `CSC_LINK` / `CSC_KEY_PASSWORD` integration in CI
- **Fast, cross-platform build** — GitHub Actions builds the installer on `ubuntu-latest` via `electron-builder --win --config installer/electron-builder.installer.json` (no Windows runner needed for the installer artifact)

### Sidebar Indicator — Inchworm Animation Unified

The active-tab indicator in the sidebar (Begrippen, Referenties, Inhoud, Bronnen, Symbolen) now uses the **same "inchworm" spring animation** as the topbar tabs.

- Smooth elastic stretch when switching tabs
- Matches topbar timing (300 ms, cubic-bezier(0.34, 1.56, 0.64, 1))
- Respects `prefers-reduced-motion` — instant snap when enabled
- Implemented in new `js/ui/sidebar-indicator.js`

### Checklist Upgrades

- **Box-only toggle** — click the checkbox to mark done without striking through text
- **Empty item handling** — `Enter` on an empty checklist item removes the marker and converts to a normal paragraph
- **In-place conversion** — toggle between checklist ↔ bullet ↔ numbered without losing content or nesting
- **Toggle-off** — clicking the checklist button while inside a checklist reverts to plain paragraphs

### New Document Chooser — Single / Paginated Previews

The "Nieuw Document" flow on the landing page now shows a **visual chooser** with live previews.

- Two cards: **Enkel blad** (single continuous page) and **Gepagineerd** (multi-page with margins, page numbers, header/footer)
- Each card renders a pixel-perfect mini-preview using the shared `document-preview.js` engine
- Click to create — no extra modal, no extra click
- Previews respect current theme (light/dark) and default font settings

### Document Preview — Dark Mode Aware

The reusable `document-preview.js` (used on landing page cards and the new document chooser) now **follows the system/app dark mode**.

- Background, text, code blocks, tables, and glossary highlights all adapt
- No flash of wrong theme when opening a preview

---

## Editor Features

### Text Colour — "Standaard" Option Works Correctly

The **Standaard / Default** entry in the text colour picker now **removes the explicit `foreColor`** so text inherits `var(--text-primary)` (black in light mode, white in dark).

- Works for both collapsed carets (cleans the ZWS span) and ranges
- The underline/brush icon on the button keeps the active colour for visual feedback

### Pagination — Cleaned Up

- Removed the **Paginering toggle** from the Bestand sidebar (was redundant with the document-mode selector)
- New paginated documents now **actually start paginated** (fixed a race where the first page wasn't rendered until first keystroke)

### Wiskunde — Grafiek Insert & Delete

- **Insert at cursor** — the grafiek (chart) is inserted at the current cursor position, not at the end of the document
- **Deletable** — selecting the chart wrapper and pressing `Backspace` / `Delete` removes it cleanly

### Leren — Auto-load Begrippen

The learning module (**Leren**) now **auto-loads the glossary (begrippen) from the currently open document** when you open a `.sumd` file.

- No manual import step needed
- If the document has no begrippen, the module starts empty as before

### I18n — Landing Page Translations

- Current-document card on the landing page now shows **translated date** and **word count / status bar** in the active language (NL/EN)
- Manage Documents page: word count and status bar also translated

---

## Bug Fixes

| # | Fix |
|---|-----|
| Windows Piper ENOENT | Bundled `piper.exe` + voices into the installer (`extraResources` + `asarUnpack`); fixed `ENOENT` on installed builds where the asar was read-only |
| Build afterPack (Windows) | Removed `afterPack` from `electron-builder` config — was causing ESM `file://` resolution bug on Windows; moved logic to standalone `build/afterPack.js` invoked only on Linux |
| Text-colour dark mode | The 5 outline paths of `#textColorBtn` were hard-coded `#1a1a1a` — now `class="fc-outline"` driven by `var(--text-primary)` |
| List icons | Broken numbered-list SVG (vertical bars) replaced with proper `1-2-3` glyph; bullet/numbered/checklist unified to `viewBox 0 0 24`, `stroke 2`, lines `10→21`, markers at `x=4 y=6/12/18` |
| Cursor jump on Enter | `setTimeout(0)` → `requestAnimationFrame` + guard for actually-new empty paragraph; fast Enter no longer snaps back |
| Table picker clipping | Size picker no longer clipped by the toolbar scroll track |
| Manage Documents "Terug" | Button now navigates to the landing page instead of history back |
| Double-click `.sumd` | Files from Explorer open in the landing window or a new window, never replace an open document |
| Linux `.sumd` open | `mimeType`, `argv` scan and `file://` URI parsing now work on Linux |
| Topbar indicator (EN) | Underline measured Dutch "Bewerken" before async i18n → misaligned "Edit"; now `ResizeObserver` + `MutationObserver` + `SummieI18n` hooks keep it centred |
| Auto-save toggle | `autosave.js` now enables the toggle immediately after the first save without needing to leave and re-enter the editor |
| Wayland/Hyprland GPU | `ELECTRON_OZONE_PLATFORM_HINT=wayland` + `Vulkan` + zygote bug caused 5× CPU / GPU segfault (139) on Intel Arc — now `--disable-vulkan` + `--no-zygote` with clean Wayland flags |
| Close with modals | Outside click and `Escape` now close menus and dialogs consistently |
| Renderer focus | Background colour, sidebar and `begrippen` highlights no longer steal focus when a modal is open |

---

## Security & Reliability

- **Electron 43.7.0 + electron-builder 26.15.3** — upgraded from 43.4, with `.gitattributes` enforcing LF
- **AUR package** — `summie-docs-bin` PKGBUILD in `aur/` repackages the official `.deb` from GitHub Releases; `sha256sums` updated per release
- **Linux desktop entries** — reproducible `afterPack` hook adds `WMClass`, `new-document`/`new-window` actions
- **Updater** — verifies `SHA-256` of the downloaded installer before install and fails closed
- **Windows code signing** — enabled via `CSC_LINK`/`CSC_KEY_PASSWORD` when present
- **CI** — added Fortify, SonarQube, SonarCloud workflows; AUR publish workflow (triggers on release)

---

## Technical

### New Modules

- `js/features/symbols.js` + `symbols.css` — symbols picker panel
- `js/ui/zoom.js` + `zoom.css` — document zoom controller
- `js/ui/sidebar-indicator.js` — inchworm animation for sidebar tabs
- `app/wiskunde.css` — pie chart styles
- `build/afterPack.js` — Linux post-pack hook (desktop entries, WMClass)
- `installer/` — complete NSIS installer stack (`installer.html`, `installer.js`, `installer.css`, `i18n.js`, `main-installer.js`, `preload-installer.js`, `electron-builder.installer.json`)
- `aur/PKGBUILD` + `aur/.SRCINFO` — Arch Linux binary package

### Major Rewrites

- `main.js` — Piper bundling, IPC hardening, Wayland flags, installer IPC
- `app/index.html` — symbols, zoom, sidebar indicator integration
- `js/topbar/topbar.js` — text-colour "Standaard", zoom buttons, symbols button
- `js/ui/sidebar.js` — indicator hook
- `landing.html` / `landing.js` / `landing.css` — new document chooser, dark-mode preview
- `manage-documents.js` — "Terug" navigation fix, i18n
- `js/features/wiskunde.js` — pie charts, grafiek insert/delete
- `js/features/lists.js` — checklist upgrades
- `js/core/editor.js` — grafiek insert at cursor, paginated new document fix
- `js/core/undo.js` — checklist conversion snapshots
- `js/file/fileio.js` — Linux `.sumd` open, double-click handling
- `preload.js` — new IPC channels for installer, symbols, zoom
- `updater.js` — SHA-256 verification
- `package.json` — deps, build config, installer config

### IPC Additions

- `symbols-get-recent`, `symbols-set-recent`
- `zoom-get`, `zoom-set`
- `installer-check-update`, `installer-download`, `installer-install`
- `open-sumd-file-by-path` (hardened), `recents-*`, `favourites-*`, `known-tags-*`, `settings-*`, `autosave-*`

### Fingerprint / Payload

- `.sumd` now stores `zoomLevel`, `symbolsRecent` (optional)
- Fingerprint includes `zoom`, `symbols` for dirty detection

---

## Files Changed

**New files:** `js/features/symbols.js`, `symbols.css`, `js/ui/zoom.js`, `zoom.css`, `js/ui/sidebar-indicator.js`, `app/wiskunde.css`, `build/afterPack.js`, `installer/` (8 files), `aur/PKGBUILD`, `aur/.SRCINFO`, `.gitattributes`

**Major rewrites:** `main.js`, `app/index.html`, `js/topbar/topbar.js`, `js/ui/sidebar.js`, `landing.html`, `landing.js`, `landing.css`, `manage-documents.js`, `js/features/wiskunde.js`, `js/features/lists.js`, `js/core/editor.js`, `js/core/undo.js`, `js/file/fileio.js`, `preload.js`, `updater.js`, `package.json`, `package-lock.json`, `installer.nsh`

**Updated:** `js/topbar/topbar-indicator.js`, `js/features/tabruler.js`, `js/features/table-controls.js`, `js/features/code-blocks.js`, `js/begrippen/begrippen.js`, `js/begrippen/autocomplete.js`, `js/begrippen/highlight.js`, `js/references/references.js`, `js/format/fontsize.js`, `js/format/styles.js`, `js/file/docx-export.js`, `js/file/autosave.js`, `js/file/storage.js`, `js/ui/sidebar.js`, `js/ui/theme.js`, `js/ui/notifications.js`, `js/ui/search.js`, `document-preview.js`, `README.md`, `CHANGELOG.md`

---

_Summie is a Dutch document editor built with Electron. v4.4 ships the symbols picker, document zoom, pie charts, a branded Windows installer, and a wave of polish — every feature from the Ideas v4.3 backlog was delivered in v4.3; v4.4 is the "what's next" that users didn't know they needed._