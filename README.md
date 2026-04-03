# Webcap

A Chrome extension for capturing screenshots of web page regions or individual components, with a built-in editor for adding backgrounds before saving.

## Features

- **Component mode** - Hover over any element to detect it. Scroll or use arrow keys to expand/narrow the selection. Captures include a drop shadow with rounded corners.
- **Rectangle mode** - Click and drag to select any area on the page.
- **Background editor** - Choose from solid colors, gradient presets, or a custom color picker before saving your capture.
- **Keyboard shortcuts** - Fast access to both modes, DOM traversal, and mode switching.

## Screenshots

### Component Mode
![Component mode capture](screenshots/component-mode.jpg)

### Editor
![Editor with gradient background](screenshots/editor.png)

## Installation

### Chrome Web Store

[Install Webcap from the Chrome Web Store](https://chromewebstore.google.com/detail/webcap/hiofbhgfmcaiohmbdlajagfbhkikpcim)

### Manual (Developer Mode)

1. Clone this repository
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select this directory

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+E` / `Ctrl+Shift+E` | Component capture |
| `Cmd+Shift+S` / `Ctrl+Shift+S` | Rectangle capture |
| `Tab` | Switch between modes |
| `Arrow Up/Down` | Expand/narrow selection (component mode) |
| `Arrow Left/Right` | Navigate siblings (component mode) |
| `Scroll` | Expand/narrow selection (component mode) |
| `Enter` | Capture selected component |
| `Esc` | Cancel |

## Privacy

Webcap runs entirely in your browser. It does not collect any data, make any network requests, or require any account.