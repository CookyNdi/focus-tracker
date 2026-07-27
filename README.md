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
- **Redirect tab** — set the destination URL that matched sites get sent
  to (defaults to `https://example.com`). The site's name is added
  automatically as `?source=`. Use **Reset to default** to go back to
  `https://example.com`.
- **History tab** — a local log (kept in the extension, separate from
  FocusTrack's own data) of which site was redirected and when. Can be
  cleared any time.

5 sample sites (Instagram, TikTok, Twitter/X, Facebook, YouTube) are
pre-filled on first install — feel free to edit or delete them as needed.

## Changing the redirect destination

No code editing needed — open the popup's **Redirect** tab, type the new
URL (e.g. once FocusTrack is hosted at its real domain), and click
**Save**. It's stored in `chrome.storage.local` and used immediately for
the next matching navigation. `https://example.com` is only the built-in
default used the very first time the extension runs.

## Technical notes

- All data (`sites`, `workHours`, `redirectUrl`, `history`) is stored in
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
- Redirects to FocusTrack's own domain (the configured Redirect URL) are
  automatically skipped to avoid a redirect loop.

## File structure

```
repo/
├── extension/
│   ├── icons/icon128.png (dst.)
│   ├── background.js
│   ├── manifest.json
│   ├── popup.css / popup.html / popup.js
│   └── utils.js
├── website/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── LICENSE
└── README.md
```