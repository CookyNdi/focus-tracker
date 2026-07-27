/* =========================================================
   FocusTrack Redirector — utils.js
   ---------------------------------------------------------
   Pure helper functions shared by background.js (service
   worker) and popup.js. Loaded in background.js via
   importScripts("utils.js"), and in popup.html via
   <script src="utils.js">.
   ========================================================= */

"use strict";

/** Fallback redirect destination used until the user sets their own in the popup. */
const DEFAULT_REDIRECT_URL = "https://example.com";

/**
 * Validates and normalizes a redirect URL entered by the user.
 * Adds an "https://" prefix if no scheme was given, and rejects
 * anything that isn't a valid http/https URL.
 * Returns the normalized URL string, or null if invalid.
 */
function normalizeRedirectUrl(input) {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Builds the final redirect URL by adding/overwriting a "source"
 * query parameter on top of the configured base URL, however that
 * base URL is shaped (with or without a path or existing query string).
 */
function buildRedirectUrl(baseUrl, sourceName) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("source", sourceName);
    return url.toString();
  } catch {
    // Fallback for the rare case baseUrl isn't parseable as a URL.
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}source=${encodeURIComponent(sourceName)}`;
  }
}

/**
 * Normalizes user input (a full URL or just a domain name)
 * into a clean hostname without "www.".
 *   "https://www.instagram.com/explore" -> "instagram.com"
 *   "instagram.com"                     -> "instagram.com"
 */
function normalizeHost(input) {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";

  const withProtocol = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const host = new URL(withProtocol).hostname;
    return host.replace(/^www\./, "");
  } catch {
    // Fallback for input too messy to parse as a URL.
    return raw.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Finds the entry in `sites` that matches the hostname currently
 * being opened. Matches on exact equality, or when the hostname
 * is a subdomain of the stored pattern (e.g. "web.whatsapp.com"
 * matches the pattern "whatsapp.com").
 */
function findMatchingSite(hostname, sites) {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  if (!host || !Array.isArray(sites)) return null;

  return (
    sites.find((site) => {
      const pattern = normalizeHost(site.pattern);
      if (!pattern) return false;
      return host === pattern || host.endsWith(`.${pattern}`);
    }) || null
  );
}

/**
 * Checks whether `now` falls within the configured work-hours
 * window. Supports ranges that cross midnight (e.g. start "22:00",
 * end "06:00").
 */
function isWithinWorkHours(workHours, now = new Date()) {
  if (!workHours) return true;

  if (Array.isArray(workHours.days) && workHours.days.length > 0) {
    if (!workHours.days.includes(now.getDay())) return false;
  }

  const toMinutes = (value) => {
    const [h, m] = String(value || "00:00").split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const startMinutes = toMinutes(workHours.start);
  const endMinutes = toMinutes(workHours.end);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes === endMinutes) return true; // treated as active 24 hours
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  // Range crosses midnight, e.g. 22:00 - 06:00
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/** Short unique ID for a site entry or history entry. */
function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}