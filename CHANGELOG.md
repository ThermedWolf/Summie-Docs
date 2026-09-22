# Summie v4.3 — Release Notes

> **The scholarly release.** v4.3 brings a full APA 7 / Vancouver citation system with live renumbering, neural read-aloud with Piper TTS, complete English translation, auto-capitalize, rebuilt lists and font sizing, plus deep hardening across save, load and security — and the Ideas v4.3.0 backlog closed out.

---

## What's New

### Citation & Bibliography System (APA 7 + Vancouver)

The biggest feature of this release — a complete scholarly referencing engine built from scratch.

- **Two citation styles** — switch per-document between **APA (Author, Year)** and **Vancouver (Numbered)**. Selector lives in the Bronnen sidebar and the "Bron toevoegen" modal; sidebar is the single source of truth.
- **DOI / URL / Titel lookup** — one dropdown replaces the old tabs. Default is URL. Entering any of the three auto-fetches metadata (Crossref / OpenAlex), formats it, and shows a live preview before you add it.
- **Smart insertion** — "Toevoegen aan bronnen" adds to the sidebar only, then auto-inserts an **in-text citation** inline at the cursor (no paragraph split, no stray newline). Supports round brackets `(Keten, 2021)`, square brackets `[1]` and **superscript ¹** for Vancouver — persisted per document.
- **Live renumbering** — Vancouver numbers always reflect **first occurrence in the document**. Inserting a citation above an existing one renumbers every inline span, full reference paragraph and the `summie-bibliography` block automatically via a debounced `MutationObserver`. Re-adding a source reuses its entry so numbers stay stable.
- **Two lists, two orderings** — sidebar shows sources in **insertion order** (newest at bottom, un-cited shows `—`); the bibliography block inside the document shows **only cited sources in occurrence order**. Toggling style or notation re-renders both instantly.
- **Editable everywhere** — pencil icon + click-to-edit on sidebar items, hover actions (edit/delete) + `dblclick` on inline citations, and a **contenteditable bibliography heading** (`Bronnen` / `Sources` follows the app language). Editing reuses the modal in update mode and propagates to every view and to `docx` export.
- **APA 7 faithful** — `,` → `;` author delimiter (with setting for `;` vs newline in Settings → Bronnen), correct `&` / `et al.` handling, organization fallback for webpages (site name becomes author when none given), `Geraadpleegd op` / `Retrieved` localized, `n.d.` / `n.a.` localized, no DOI/URL/`Available from` noise in scholarly types, `n.d.` in-text deduplication.
- **i18n-aware** — bibliography heading, `Ed./Red.`, `editors/redacteuren`, months and `Geraadpleegd op / Retrieved … van / from` all follow the app language and re-render live on language switch.
- **Persistence** — `citationStyle`, `vancouverInTextStyle` and `citationSearchMode` (last-used DOI/URL/Titel) are saved in the `.sumd` payload, `localStorage` draft, dirty fingerprint and undo snapshots; restored on load via `Bibliography.applyDocumentSettings()`.

### Neural Read-Aloud — Offline Voorlezen

- **Piper-only neural TTS** — bundled `piper` binary (`piper-bin`, Linux x64, 2023.11.14) + `onnxruntime-web` / `piper-tts-web`. No `espeak-ng` fallback, no network at playback time.
- **Voices** — English bundled: `en_US-libritts_r-medium/high` (female) + `en_US-ryan-medium/high` (male, distinct). Dutch on-demand: `nl_BE-nathalie-medium` (Vrouw Flemish), `nl_NL-ronnie-medium` (Man) and `nl_NL-dii-high` (Vrouw high, 61 MB). First use of a missing Dutch gender prompts a ~40–90 MB Hugging Face download with progress.
- **Experience** — `Weergave → Voorlezen` or `Ctrl+Shift+R`, whole document or selection, floating mini-player (play/pause/stop, prev/next sentence & paragraph, scrub, speed 0.5–2×, Vrouw/Man/Systeem), live sentence highlight + auto-scroll, pause-on-edit, `Esc` to stop, `)`-parenthetical skipping via `stripParenthetical()`, per-block pauses (`code/table/image/shape`) and sentence `silence 0.12` tuning.
- **Smart bits** — lightweight stop-word heuristic detects `nl ↔ en` per sentence and picks the right voice, with fallback to app language; closing the player fully cancels audio (no ghost playback).

### Full English Translation

- **Runtime i18n** — new `js/i18n/en.js` dictionary + `i18n.js` engine. Toggle in Settings (gear on landing), persists to `userData/app-settings.json`, applies without restart. Toolbar tabs, Sources sidebar, settings, dialogs, updater and read-aloud strings all translate; bibliography rendering is excluded from the i18n walk so formatter output stays intact.

### Writing Quality

- **Auto-capitalize (Issue #1)** — capitalizes the first letter after `. ! ?` and at document/paragraph start, with backspace/delete tracking so re-typing doesn't re-trigger. Exposed as `_checkAndCapitalize()` for placeholder integration.
- **List Manager (Issues #4, #5)** — bullet + **numeric** lists (`1. 2. 3.`) via new `js/features/lists.js`, `Backspace` on an empty item removes the marker and goes back, `Enter` on empty outdents, typing `- ` / `* ` / `→ ` + space auto-creates a bullet (can be toggled). Toolbar gets a proper numbered-list button with corrected SVG.
- **Font size redesign (Issue #7)** — `FontSizeManager.applySize()` now handles four cases without nesting: empty paragraph sets `p.style.fontSize`, caret in existing ZWS span updates in place, caret in text inserts a `‍\u200B` span, selection wraps and cleans inner spans. `A–` / `A+` work with a collapsed caret, heading styles (`Titel`, `Kop 1` …) force the correct size, and `getCleanEditorContent()` strips empty/ZWS spans on save.

---

## Editor Features

### Lists & Text

- **Auto-bullet** — `- `, `* ` and arrow markers followed by a space instantly become a bullet list; `Backspace` cleanly removes it.
- **Numeric lists** — dedicated toolbar button, same keyboard ergonomics as bullets.
- **Standaard (Default) text colour** — new top entry in the text-colour picker ("Standaard" / "Default") removes the explicit `foreColor` so text inherits `var(--text-primary)` (black in light, white in dark). Handles both collapsed carets (clean ZWS span) and ranges.

### Begrippen & References

- **Hover tooltip** — begrip highlights now show the definition on hover (150 ms delay, 150 ms grace to reach the tooltip) instead of click, with full dark-mode styling. The begrip form now requires `trefwoord` plus description or alias.
- **Citation UX** — modal has a blue theme and a single mode dropdown; both modal and sidebar style selectors were de-duplicated (sidebar is canonical).

### Infrastructure

- **Snapshot undo/redo** — `js/core/undo.js` captures editor HTML, begrippen, protection state, citations and fingerprint in full snapshots; `Ctrl+Z` / `Ctrl+Shift+Z` restores everything consistently (including redo not resurrecting stale content).
- **Focus preservation** — `js/core/focus-preservation.js` (`SummieSelection`) clones the editor `Range` before any modal (citations, references, image URL, styles, begrippen) opens and restores it before insert; mouse/focus inside the editor is locked while a modal is open so the caret never drifts.
- **Image caret guarantee** — every in-flow/square/top-bottom image now ensures a trailing `p[data-image-spacer]` so the cursor can always be placed behind it; `Backspace`/`Delete` won't eat the spacer, and spacers are stripped on save/export.

---

## Bug Fixes

| # | Fix |
|---|-----|
| Save-state flicker | Fingerprint baseline now locks only after async restores finish (`images` 200 ms, `tabruler` 350 ms, `bibliography` 700 ms → lock at 950/1150 ms), clones strip transient highlights, shows "Laatst opgeslagen …" from file timestamp on load — closing with auto-save no longer prompts spuriously. `AutoSave.flush()` is now authoritative and dirty-aware. |
| Window title on rename | Renaming a file now updates `<doc> — Summie` immediately. |
| List icons | Broken numbered-list SVG (vertical bars) replaced with proper `1-2-3` glyph; bullet/numbered/checklist unified to `viewBox 0 0 24`, `stroke 2`, lines `10→21`, markers at `x=4 y=6/12/18`. |
| Text-colour `A` in dark mode | The 5 outline paths of `#textColorBtn` were hard-coded `#1a1a1a` — now `class="fc-outline"` driven by `var(--text-primary)`; underline/brush keeps the active colour. |
| Citation inline split | In-text citations now use `Range.insertNode` (span `summie-citation-inline`) with explicit `display:inline` instead of `execCommand insertHTML`, which split the paragraph in Chromium. |
| Citation preview crash | `showPreview` called free `formatAPA()` → `ReferenceError`; now delegates to `formatReference()` per selected style. |
| Citation `renderList` `this` | `forEach` missing `this` context → `TypeError`; now bound correctly and sidebar renders. |
| Inhoud progress | Progress line now updates after collapsing a section; reading-position tracks the viewport centre with `ResizeObserver`. |
| Last-saved indicator | Odometer animation not firing after the first minute — stray `innerHTML` wipe destroyed reconciliation nodes; "Geen wijzigingen" shown for never-saved docs; hours/days round at the half-mark. |
| Cursor jump on Enter (Issue #9) | `setTimeout(0)` → `requestAnimationFrame` + guard for actually-new empty paragraph; fast Enter no longer snaps back. |
| Table picker clipping | Size picker no longer clipped by the toolbar scroll track. |
| Manage Documents "Terug" | Button now navigates to the landing page instead of history back. |
| Double-click `.sumd` | Files from Explorer open in the landing window or a new window, never replace an open document. |
| Linux `.sumd` open | `mimeType`, `argv` scan and `file://` URI parsing now work on Linux. |
| Topbar indicator (EN) | Underline measured Dutch "Bewerken" before async i18n → misaligned "Edit"; now `ResizeObserver` + `MutationObserver` + `SummieI18n` hooks keep it centred. |
| Auto-save toggle | `autosave.js` now enables the toggle immediately after the first save without needing to leave and re-enter the editor. |
| Wayland/Hyprland GPU | `ELECTRON_OZONE_PLATFORM_HINT=wayland` + `Vulkan` + zygote bug caused 5× CPU / GPU segfault (139) on Intel Arc — now `--disable-vulkan` + `--no-zygote` with clean Wayland flags. |
| Close with modals | Outside click and `Escape` now close menus and dialogs consistently. |
| Renderer focus | Background colour, sidebar and `begrippen` highlights no longer steal focus when a modal is open. |

---

## Security & Reliability

- `.sumd` import is now **sanitized with DOMPurify** before every `innerHTML` injection (editor, localStorage, document preview, landing extraction, header/footer). Strips `scripts`/`on*`/`javascript:` and DOM-clobbering `id`/`name`, escapes begrippen/references/images/shapes at all HTML sinks, and adds a strict CSP (`script-src 'none'`) to the preview `<iframe>` and the `leren` window. Vendored as `js/lib/purify.min.js` and listed in `package.json`.
- **IPC hardening** (`main.js`) — every channel validates the sender is an own `file://` page; renderer-supplied paths are resolved and must be existing regular `.sumd`/`.json` files before any read/write/delete/rename; `shell.openExternal` restricted to `http/https/mailto`; code-file reads restricted by extension and size.
- **Electron 43.7.0 + electron-builder 26.15.3** — upgraded from 43.4, with `.gitattributes` enforcing LF.
- **Recent-docs safety** — no permanent pruning of `recent-docs.json` while drives are offline; `update-doc-path` keeps favourites in sync on rename; `recents-*`/`favourites-*`/`known-tags-*`/`settings-*`/`autosave-*` all validate paths.
- **Landing stability** — removed CSP-blocked `Fuse.js` CDN loads; search-result context menu crash fixed.
- **Build** — reproducible `afterPack` hook adds Linux desktop entries (`WMClass`, `new-document`/`new-window` actions); updater verifies `SHA-256` of the downloaded installer before install and fails closed; Windows code signing enabled via `CSC_LINK`/`CSC_KEY_PASSWORD` when present.

---

## Technical

- **New modules** — `js/citations/apa-format.js`, `js/citations/vancouver-format.js`, `js/citations/bibliography.js`, `js/features/auto-capitalize.js`, `js/features/lists.js`, `js/features/tts.js`, `js/core/undo.js`, `js/core/focus-preservation.js`, `js/security/sanitize.js`, `js/i18n/en.js`, `js/i18n/i18n.js`, `bibliography.css`, `read-aloud.css`, `js/lib/purify.min.js`, `build/afterPack.js`
- **Piper registry** — `main.js: PIPER_REGISTRY + PIPER_GENDER_MAP`, IPC `piper-get-status/-paths/-download/-synthesize`, Hugging Face redirect handling, `LD_LIBRARY_PATH`, `--speaker/--length_scale/--sentence_silence`, `asarUnpack` + `extraResources` for `piper-bin`/`piper-voices`
- **Fingerprint** — canonical dirty detection covering `content`, `pages`, `begrippen`, `protectedFlag`, `codeBlocks`, `references`, `citations`, `citationStyle`, `vancouverInTextStyle`, `citationSearchMode`, `images`, `customStyles`, `headerFooter`, `tabRulerIndents`
- **Payload** — `.sumd` now stores `citationStyle`, `vancouverInTextStyle`, `citationSearchMode`; `docx-export.js` renders supervisors/brackets correctly for both styles including superscript runs in body and table cells
- **IPC additions** — `scan-sumd-elements`, `read-sumd-meta`, `write-sumd-meta`, `open-sumd-file-by-path`, `recents-*`, `favourites-*`, `known-tags-*`, `settings-*`, `autosave-*`, `piper-*`, plus `wordcount`, `window-controls` per-sender fixes

---

## Files Changed

**New files:** `bibliography.css`, `read-aloud.css`, `js/citations/apa-format.js`, `js/citations/bibliography.js`, `js/citations/vancouver-format.js`, `js/features/auto-capitalize.js`, `js/features/lists.js`, `js/features/tts.js`, `js/core/undo.js`, `js/core/focus-preservation.js`, `js/security/sanitize.js`, `js/i18n/en.js`, `js/i18n/i18n.js`, `js/lib/purify.min.js`, `build/afterPack.js`, `.gitattributes`, `piper-voices/README` (gitignored binaries)

**Major rewrites:** `main.js`, `js/file/fileio.js`, `js/file/docname.js`, `js/file/protection.js`, `js/format/fontsize.js`, `js/topbar/topbar.js`, `js/topbar/topbar-indicator.js`, `js/core/editor.js`, `js/core/events.js`, `js/features/images.js`, `js/begrippen/highlight.js`, `index.html`, `styles.css`, `topbar.css`, `landing.js`, `landing.css`, `manage-documents.js`, `toc.js`, `preload.js`, `updater.js`

**Updated:** `js/begrippen/begrippen.js`, `js/begrippen/autocomplete.js`, `js/references/references.js`, `js/format/styles.js`, `js/features/tabruler.js`, `js/features/tables.js`, `js/features/table-controls.js`, `js/features/code-blocks.js`, `js/features/wiskunde.js`, `js/file/docx-export.js`, `js/file/autosave.js`, `js/file/storage.js`, `js/ui/sidebar.js`, `js/ui/theme.js`, `js/ui/notifications.js`, `js/ui/search.js`, `document-preview.js`, `package.json`, `package-lock.json`, `installer.nsh`

---

_Summie is a Dutch document editor built with Electron. v4.3 closes the Ideas v4.3.0 backlog — every item from that list (auto-capitalize, citation styles, in-text references, bullet & numeric lists, colour picker polish, font-size persistence and heading fixes, cursor-jump fix) shipped and was hardened with security, Wayland and save-state fixes._
