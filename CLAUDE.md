# Webcap

Chrome extension for capturing screenshots of web page regions or individual components.

**Published on Chrome Web Store** (submitted 2026-03-29, pending first review).
**GitHub**: https://github.com/ayakutt/webcap

## Architecture

This is a Manifest V3 Chrome extension with no build step, no frameworks, no dependencies. All plain JS/CSS/HTML.

### Files

- `manifest.json` - Extension manifest (MV3). Permissions: `activeTab`, `scripting`.
- `background.js` - Service worker. Handles capture flow: receives crop rect from content script, uses `chrome.tabs.captureVisibleTab` to screenshot, crops/processes with `OffscreenCanvas`, opens editor with result.
- `content.js` - Injected into active tab on demand. Provides two capture modes (rectangle selection + component detection). IIFE with double-injection guard (`window.__webcap_active`).
- `content.css` - Styles for overlay, selection, component highlight, tooltip, flash animation.
- `editor.html/js/css` - Post-capture editor page. Shows captured image on a canvas, lets user pick a background (solid colors, gradients, custom color picker) before saving.
- `icons/` - Extension icons at 16px, 48px, 128px. Colorful viewfinder design (red/yellow/blue/green corners).

### Capture Flow

1. User triggers capture (click extension icon or keyboard shortcut).
2. `background.js` injects `content.js` + `content.css` into the active tab.
3. `content.js` shows the capture UI (overlay for rectangle, highlight for component).
4. On selection, `content.js` sends `capture-rect` message to background with the rect coordinates (scaled by `devicePixelRatio`).
5. `background.js` calls `captureVisibleTab`, crops the image, optionally adds shadow (component mode), stores result in `pendingCapture` variable.
6. `background.js` opens `editor.html`. Editor requests the image via `get-capture` message.
7. User picks a background and saves.

### Component Mode Details

- Default mode (triggered by clicking extension icon).
- Detects elements via `document.elementFromPoint`.
- Builds an ancestor chain from the hovered element up to `<body>`.
- Scroll wheel, arrow up/down keys traverse the ancestor chain.
- Tooltip shows tag name, id, classes, dimensions.
- Captured with `border-radius` preserved and macOS-style drop shadow (80px padding, `rgba(0,0,0,0.35)` shadow, 50px blur, 12px Y offset).
- Camera cursor icon (dark-filled SVG).

### Rectangle Mode

- Click and drag to select area.
- Overlay dims the page, selection box cuts through.
- No shadow or border-radius applied.

### Editor

- Backgrounds: transparent (default), white, light gray, dark gray, black, 5 gradient presets (sunset, ocean, forest, dusk, peach), custom color picker.
- Canvas composites the background behind the captured image (transparent areas show the chosen background).
- Download button exports as PNG.
- Dark UI with floating toolbar, glass effect.

### Keyboard Shortcuts

- `Cmd+Shift+A` / `Ctrl+Shift+A` - Component capture (also the default click action).
- `Cmd+Shift+S` / `Ctrl+Shift+S` - Rectangle capture.
- `Tab` - Switch between modes.
- `Arrow Up/Down` - Traverse DOM tree in component mode.
- `Esc` - Cancel.

## Key Design Decisions

- **No external requests.** Everything runs locally. No analytics, no tracking, no remote code.
- **No storage APIs.** Captured image is passed from background to editor via in-memory variable + messaging (`pendingCapture` + `get-capture`). If the service worker dies between capture and editor load, the image is lost (acceptable tradeoff for simplicity).
- **Transparent padding on component captures.** The shadow padding area is transparent, not white/black. This lets users pick any background in the editor. Social platforms flatten transparency to white, which looks clean.
- **OffscreenCanvas in service worker.** MV3 service workers can't use regular Canvas/DOM. All image processing uses `OffscreenCanvas` and `createImageBitmap`.
- **No build step.** Just zip the files and upload to Chrome Web Store.

## Publishing

- Chrome Web Store developer account under ayakutt (non-trader, individual).
- To create a release zip: `zip -r webcap.zip manifest.json background.js content.js content.css editor.html editor.js editor.css icons/`
- First review takes 2-3 days. Subsequent updates are usually faster.
- Privacy policy hosted on Google Docs, linked from the store listing.

## README

Keep `README.md` up to date when adding features, changing shortcuts, or modifying the capture flow. Screenshots are referenced from `screenshots/` directory (user-managed).

## Development

- Load unpacked from this directory in `chrome://extensions` (enable Developer mode).
- After code changes, click the refresh button on the extension card in `chrome://extensions`.
- For clean screenshots: `open -na "Google Chrome" --args --user-data-dir=/tmp/webcap-demo`
