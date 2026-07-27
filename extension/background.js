/* =========================================================
   FocusTrack Redirector — background.js
   ---------------------------------------------------------
   Service worker (Manifest V3). Responsibilities:
   1. Seed default data on first install.
   2. Watch tab navigation (webNavigation).
   3. If the opened host matches one of the configured sites
      AND it's currently within work hours (or the work-hours
      restriction is disabled) -> redirect to FocusTrack with
      a ?source={site name} parameter.
   4. Log every redirect to local history (shown in the
      "History" tab of the popup).

   File map:
   - manifest.json → extension configuration
   - background.js → this logic (service worker)
   - utils.js      → helper functions, shared with popup.js
   - popup.html/.css/.js → UI shown when the extension icon is clicked
   ========================================================= */

"use strict";

importScripts("utils.js");

/* =========================================================
   1. CONSTANTS
   ========================================================= */

// Destination FocusTrack URL for the redirect. Change this later
// (e.g. once FocusTrack is hosted at its real domain).
const REDIRECT_BASE_URL = "https://example.com";

const HISTORY_LIMIT = 50;

// Seed data so the extension isn't empty right after install.
// All of this can be edited or removed from the popup.
const DEFAULT_SITES = [
  { id: "site_instagram", name: "Instagram", pattern: "instagram.com" },
  { id: "site_tiktok", name: "TikTok", pattern: "tiktok.com" },
  { id: "site_twitter", name: "Twitter / X", pattern: "x.com" },
  { id: "site_facebook", name: "Facebook", pattern: "facebook.com" },
  { id: "site_youtube", name: "YouTube", pattern: "youtube.com" },
];

const DEFAULT_WORK_HOURS = {
  enabled: true,
  start: "09:00",
  end: "17:00",
  days: [1, 2, 3, 4, 5], // Monday–Friday (0=Sunday ... 6=Saturday)
};

/* =========================================================
   2. INITIAL SETUP (on extension install / update)
   ========================================================= */

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(["sites", "workHours", "history"]);
  const toSet = {};

  if (!existing.sites) toSet.sites = DEFAULT_SITES;
  if (!existing.workHours) toSet.workHours = DEFAULT_WORK_HOURS;
  if (!existing.history) toSet.history = [];

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }
});

/* =========================================================
   3. HISTORY (local log for every redirect that happens)
   ========================================================= */

async function logRedirect(site, originalUrl) {
  const { history = [] } = await chrome.storage.local.get("history");

  history.unshift({
    id: makeId("log"),
    name: site.name,
    pattern: site.pattern,
    url: originalUrl,
    time: new Date().toISOString(),
  });

  await chrome.storage.local.set({ history: history.slice(0, HISTORY_LIMIT) });
}

/* =========================================================
   4. MAIN NAVIGATION LISTENER
   ========================================================= */

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle the main frame (not iframes inside the page).
  if (details.frameId !== 0) return;

  let targetUrl;
  try {
    targetUrl = new URL(details.url);
  } catch {
    return;
  }

  // Only handle http/https (skip chrome://, file://, etc).
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") return;

  // Never redirect the FocusTrack page itself (avoid a redirect loop).
  let redirectHost = "";
  try {
    redirectHost = new URL(REDIRECT_BASE_URL).hostname.replace(/^www\./, "");
  } catch {
    redirectHost = "";
  }
  const currentHost = targetUrl.hostname.replace(/^www\./, "");
  if (redirectHost && currentHost === redirectHost) return;

  const { sites = [], workHours } = await chrome.storage.local.get(["sites", "workHours"]);
  if (sites.length === 0) return;

  const match = findMatchingSite(targetUrl.hostname, sites);
  if (!match) return;

  // If the work-hours restriction is on and it's NOT currently work hours -> don't redirect.
  if (workHours && workHours.enabled && !isWithinWorkHours(workHours)) {
    return;
  }

  await logRedirect(match, details.url);

  const redirectUrl = `${REDIRECT_BASE_URL}?source=${encodeURIComponent(match.name)}`;
  try {
    await chrome.tabs.update(details.tabId, { url: redirectUrl });
  } catch {
    // The tab may have closed/navigated away before the redirect could run — ignore.
  }
});