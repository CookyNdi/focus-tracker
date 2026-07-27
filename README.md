# FocusTrack Redirector (Chrome Extension)

A Chrome extension companion for FocusTrack. When you open a registered
site/social app **during work hours**, the tab is automatically redirected
to:

```
https://example.com?source=SiteName
```

That `?source=` parameter is exactly what `app.js` in FocusTrack picks up
automatically as a new distraction entry.

## Installation (developer mode)

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select this `focustrack-extension` folder (the one containing
   `manifest.json`).
5. An "FT" icon will appear in the toolbar. Click it to open the settings.

## How to use it

- **Sites tab** — add/edit/delete the sites you want redirected. Fill in
  a Name (e.g. `Instagram`) and a Domain/URL (e.g. `instagram.com` or
  `https://www.instagram.com` — both get normalized automatically).
  Subdomains match too, so `instagram.com` also catches
  `www.instagram.com`.
- **Work Hours tab** — turn the restriction on/off, set a start–end time,
  and pick the days. When the restriction is **on**, redirects only
  happen while the current time falls inside the chosen hours & days.
  When it's **off**, the sites above are always redirected, any time.
- **History tab** — a local log (kept in the extension, separate from
  FocusTrack's own data) of which site was redirected and when. Can be
  cleared any time.

5 sample sites (Instagram, TikTok, Twitter/X, Facebook, YouTube) are
pre-filled on first install — feel free to edit or delete them as needed.

## Changing the redirect destination

The redirect base URL is currently set to `https://example.com` as
requested. To change it (e.g. once FocusTrack is hosted at its real
domain), edit this single line in `background.js`:

```js
const REDIRECT_BASE_URL = "https://example.com";
```

## Technical notes

- All data (`sites`, `workHours`, `history`) is stored in
  `chrome.storage.local` — local to the browser, never sent to any
  server.
- The extension requests broad host permissions (`http://*/*`,
  `https://*/*`) because the sites to watch are freely defined by the
  user through the popup, not a fixed list in the code. This will trigger
  Chrome's standard permission warning ("Read and change all your data on
  the websites you visit") — that's expected for this kind of extension.
- Navigation detection uses `chrome.webNavigation.onBeforeNavigate` and
  only processes the main frame (not iframes), so it won't accidentally
  redirect third-party iframes embedded inside other pages.
- Redirects to FocusTrack's own domain (`REDIRECT_BASE_URL`) are
  automatically skipped to avoid a redirect loop.

## File structure

```
focustrack-extension/
├── manifest.json     # extension configuration (Manifest V3)
├── background.js     # service worker: navigation detection + redirect + log
├── utils.js          # shared helper functions (used by background & popup)
├── popup.html
├── popup.css
├── popup.js           # UI: manage sites, work hours, history
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```