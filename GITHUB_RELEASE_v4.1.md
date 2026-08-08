# Summie v4.1 — Release Notes

> **A bigger, smoother, more Word-like Summie.** v4.1 adds page-based editing, find & replace, password-protected documents, shapes, richer image controls, a new table of contents system, and a long list of polish fixes across saving, exporting, toolbars, sidebars, and document management.

---

## What's New

### Page-Based Editing

Summie now supports a Word-style page view with fixed A4 pages.

- **Fixed A4 pages** — write inside real page boundaries instead of one endless document
- **Automatic page creation** — new pages appear when content overflows
- **Manual page breaks** — press `Ctrl+Enter` to jump to a new page when pagination is enabled
- **Page break button** — available from the editing toolbar when page mode is active
- **Stable typing experience** — pages are reused while typing to prevent flicker
- **Smoother scrolling** — page breaks keep the cursor comfortably in view
- **Non-editable page labels** — page labels stay outside the document text
- **Aligned placeholder text** — first-line typing starts exactly where it should

### Find & Replace

A completely new floating search panel is now available in the editor.

- **`Ctrl+F` / `Ctrl+H`** — open search, or jump straight to find & replace
- **Floating panel** — VS Code-style panel in the top-right of the document
- **Search options** — match case, whole word, and regular expression support
- **Keyboard navigation** — Enter and Shift+Enter move between matches
- **Replace tools** — replace one match or all matches at once
- **Regex validation** — invalid regular expressions show a clear error
- **Safe highlights** — search highlights are never saved into the document
- **Documentation page** — added a dedicated help page for find & replace

### Password-Protected Documents

Sensitive documents can now be protected with a password.

- **Set or remove passwords** from the file sidebar
- **AES encryption** for protected `.sumd` files
- **Live password confirmation** — submit stays disabled until passwords match
- **Summie-style dialogs** — password prompts use the same custom dialog design as the rest of the app

### Images

Images are now much easier to work with inside documents.

- **Image context tab** — appears automatically when an image is selected
- **Resize controls** — width and height inputs with aspect-ratio lock
- **Restore original size** — reset dimensions back to the uploaded image size
- **More positioning modes** — inline, in front of text, behind text, around text, top/bottom, and floating
- **Always resizable** — resizing works across all positioning modes
- **Layer order controls** — move images forward or backward
- **Better selection behavior** — context-tab clicks, resizing, and dragging no longer deselect the image
- **Click then drag** — first click selects an image, then dragging moves it
- **Multiple image fix** — uploading additional images no longer breaks the document

### Shapes

Summie now includes Word-like drawing tools.

- **New shape types** — rectangle, rounded rectangle, circle, oval, triangle, diamond, line, and arrow
- **Move and resize** — shapes can be selected, dragged, and scaled
- **Precise resize handles** — handles align tightly to the selected shape
- **Shift-resize** — hold Shift to preserve the original proportions
- **Style controls** — fill colour, line colour, and line style from the context tab
- **Layer order controls** — send shapes forward or backward
- **Persistent editing** — shapes remain editable after saving and reopening
- **DOCX export** — shapes export as native Word drawing objects

### Table of Contents

A new table of contents element can be inserted directly into a document.

- **Insert from the toolbar** — available from the Insert tab
- **Three styles** — Classic, Summie, and Word
- **Automatic updates** — follows document heading changes automatically
- **Manual mode** — automatic updating can be turned off
- **Click navigation** — clicking an item smoothly scrolls to the matching heading
- **Editable title** — customize the table of contents heading
- **Hover controls** — edit and delete buttons appear when needed

### Text Boxes

Text boxes received a major upgrade.

- **Border styles** — none, solid, dashed, dotted, and double
- **Border thickness** — controlled separately from border style
- **Background opacity** — colour picker, HEX input, and opacity slider
- **Shadow levels** — none, small, normal, and large
- **Corner radius** — adjustable rounded corners
- **Inline/floating toggle fixes** — switching modes now behaves correctly
- **Word-style resize handles** — cleaner editing controls
- **Better inline behavior** — cursor placement and wrapping are much more reliable
- **Cleaner deletion** — removing text boxes no longer asks for confirmation

### Outline Sidebar

The contents sidebar is now smarter while navigating long documents.

- **Collapsible sections** — headings with subheadings can be folded
- **Smart default state** — sections start collapsed except for the current area
- **Follows scrolling** — the active heading updates automatically
- **More accurate position indicator** — the sidebar now tracks the document position more precisely
- **Empty headings fixed** — empty heading paragraphs disappear from the outline once the cursor leaves them

### View Tools

- **New View tab** — added between Insert and Math
- **Paragraph marks** — show or hide paragraph marks from the toolbar or with `Ctrl+Shift+8`
- **Remembered preference** — Summie remembers whether paragraph marks are visible

---

## Improvements

### Toolbar & Sidebar Polish

- **Horizontal toolbar scrolling** — mouse wheel scrolls wide toolbars horizontally
- **Overflow fade** — toolbar overflow is easier to see
- **Dropdown clipping fixed** — dropdowns now render above the toolbar layer instead of being cut off
- **Smoother tab transitions** — toolbar tabs cross-fade without stretching
- **File sidebar auto-closes** — closes after saving as `.sumd`, exporting to DOCX, or loading a document
- **File sidebar height fixed** — now starts directly below the tab row

### File Size & Save State

- **File size display** — shown in the bottom-right corner using B, KB, or MB
- **Odometer animation** — changing size digits roll into place
- **More reliable saved indicator** — compares the full document content after typing and clicking
- **Smarter autosave** — only saves when the document actually changed
- **Missing save path dialog** — clear choices when the original file path no longer exists

### Landing Page & Document Management

- **Favourites in recent documents** — favourite documents also appear in the recent list
- **Better missing-file dialog** — choose a new path or remove the missing item
- **Delete remembered tags** — remove old tag suggestions from Document Management
- **Rename fixes** — renamed documents update their existing entry instead of creating duplicates
- **Explorer file type label** — `.sumd` files are now described as "Summie Document"

### Begrippen

- **Dots in terms** — terms containing periods are highlighted correctly
- **Alias search** — the Begrippen sidebar also searches aliases
- **Code-injection protection** — Begriff rendering now escapes unsafe input
- **Scroll position preserved** — opening or closing the Begrippen window no longer jumps the editor to the top

---

## Bug Fixes

| # | Fix |
| --- | --- |
| Double-click to open `.sumd` | Files opened from Windows Explorer now correctly load the selected document instead of restoring the previous `localStorage` document |
| PDF export & printing | Fixed IPC/print dialog wiring and removed the extra blank page at the end |
| Electron dialogs | Replaced native Electron pop-ups with Summie's custom modal system |
| Save As dropdown | Buttons now use the correct full dropdown width |
| Autocomplete | Closes correctly when leaving the cursor area, clicking in the editor, or using navigation keys |
| Text boxes | Fixed inline/floating mode, cursor placement, resize handles, margin bounds, placeholder text, wrapping, and accidental blue editing borders |
| Images | Fixed selection loss, resize behavior, drag behavior, and crashes when adding multiple images |
| Shapes | Fixed disappearing shapes while typing and restored editability after reopening documents |
| Begrippen highlights | Highlight spans are stripped before saving, so visual highlights are not written into `.sumd` files |
| Terms with periods | Fixed a regular-expression state bug that prevented some terms from highlighting |
| Rename flow | Renaming now removes the old file and updates recent/known/favourite entries in place |
| Missing files | Saving or opening a missing file now shows a useful recovery dialog |
| Enter vs Shift+Enter | Enter creates paragraph spacing; Shift+Enter creates a tighter line break |
| Toolbar layout | Context tabs support horizontal scrolling even when loaded lazily |
| File sidebar timing | Fixed timing issues when switching tabs and opening the file sidebar |
| Installer icon | Added a separate installer icon and refreshed the Windows icon cache after install/repair |
| DevTools shortcut | `Ctrl+Shift+I` opens the developer console |

---

## Technical

- **`find-replace.js` / `find-replace.css`** — new floating find & replace system with safe, non-persistent highlights
- **`image-controls.js`** — image context tab, sizing, positioning, selection, and layer controls
- **`shapes.js`** — Word-like shape insertion, editing, styling, persistence, and DOCX export support
- **`protection.js`** — password protection and encrypted `.sumd` handling
- **`pagemanager.js`** — fixed A4 pagination, overflow handling, page breaks, and page labels
- **`dialogs.js`** — shared Summie modal system replacing native Electron prompts
- **`toc.js` / `toc.css`** — insertable table of contents element with styles and live/manual updates
- **Electron IPC additions** — initial `.sumd` launch handoff, file-size reads, print/PDF export, path updates, and file-open helpers
- **Installer updates** — dedicated installer icon and Windows file-association icon refresh

---

## Files Changed

**New files:** `find-replace.js`, `find-replace.css`, `dialogs.js`, `image-controls.js`, `paragraph-marks.js`, `shapes.js`, `toc.js`, `toc.css`, `protection.js`, `installer-icon.ico`

**Major updates:** `main.js`, `preload.js`, `index.html`, `topbar.js`, `pagemanager.js`, `fileio.js`, `docname.js`, `docx-export.js`, `textbox.js`, `textbox.css`, `images.js`, `table-controls.js`, `begrippen.js`, `highlight.js`, `landing.js`, `manage-documents.js`, `installer.nsh`

---

_Summie is a Dutch document editor built with Electron. This release focuses on making Summie feel more like a real everyday writing app: safer documents, better navigation, richer layout tools, cleaner exports, and fewer little paper cuts._
