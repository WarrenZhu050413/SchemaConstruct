# Hypertext Navigator

This repository exposes the inline hypertext experience in two places:

- `demo/hypertext_navigation_demo.html` – open directly in Chrome and select text, then press **Cmd/Ctrl + Shift + K** to generate a hypertext highlight. Hover the highlight to see the floating chat tooltip.
- `manifest.json` + `extension/` + `hypertext/` – load the repository folder as an unpacked Chrome extension to enable the same behaviour on any webpage.

`hypertext/hypertext-experience.js` is the shared runtime. The demo includes it via a normal script tag; the extension reuses the exact file and boots it with `extension/hypertext-loader.js`.

## Directory structure

```
manifest.json
hypertext/
  hypertext-experience.js
extension/
  hypertext-loader.js
  (uses the shared runtime)
demo/
  hypertext_navigation_demo.html
```

## Load the extension

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked**, select this repository folder.
3. On any page, select text and type **Cmd/Ctrl + Shift + K**. A red highlight appears and hovering it reveals the inline chat tooltip.

## Local demo

Simply open `demo/hypertext_navigation_demo.html` in a Chromium browser. The file is completely self-contained – no build step required.

## Tests

The project is intentionally minimal and does not ship automated tests. To validate manually, exercise the steps above in both the demo and the extension.
