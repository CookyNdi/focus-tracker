/* =========================================================
   FocusTrack — app.js
   ---------------------------------------------------------
   A distraction logger for work/study time.

   How data gets in:
   - Automatically, via a "?source=AppName" URL parameter
     (meant to be the target of a future redirect feature).

   How data is stored:
   - Entirely in localStorage, as a JSON array of entries:
       { id, app, time }  // time = ISO date string

   File map:
   - index.html  → markup only
   - styles.css  → all styling
   - app.js      → all behaviour (this file)
   ========================================================= */

"use strict";

/* =========================================================
   1. CONSTANTS
   ========================================================= */

const STORAGE_KEY = "ft_distractions_v1";

// Cycled deterministically per app name so the same app
// always gets the same color across gauge / chart / history.
const APP_COLORS = [
  "#8b5cf6", "#a78bfa", "#c4b5fd", "#7c3aed",
  "#a855f7", "#d8b4fe", "#5b21b6", "#c026d3",
];

const GAUGE_RADIUS = 80;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;
const GAUGE_THRESHOLD = 10; // distraction count at which the ring is 100% full

const HISTORY_LIMIT = 100;  // max rows rendered in the history list
const CLOCK_REFRESH_MS = 30000;

/* =========================================================
   2. DOM REFERENCES (cached once, reused everywhere)
   ========================================================= */

const dom = {
  headerCount: document.getElementById("headerCount"),
  clockText: document.getElementById("clockText"),

  gaugeFill: document.getElementById("gaugeFill"),
  gaugeNumber: document.getElementById("gaugeNumber"),
  gaugeSub: document.getElementById("gaugeSub"),

  statWeek: document.getElementById("statWeek"),
  statMonth: document.getElementById("statMonth"),
  statAvg: document.getElementById("statAvg"),

  periodTabs: document.getElementById("periodTabs"),
  appChartCanvas: document.getElementById("appChart"),
  trendChartCanvas: document.getElementById("trendChart"),

  historyList: document.getElementById("historyList"),
  historySearch: document.getElementById("historySearch"),

  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importInput: document.getElementById("importInput"),
  resetBtn: document.getElementById("resetBtn"),

  toast: document.getElementById("toast"),
};

/* =========================================================
   3. APP STATE
   ========================================================= */

const state = {
  distractions: loadDistractions(), // array of {id, app, time}, newest first
  period: "day",                    // "day" | "week" | "month"
  searchTerm: "",
  appChart: null,                   // Chart.js instance (bar)
  trendChart: null,                 // Chart.js instance (line)
};

/* =========================================================
   4. STORAGE
   ========================================================= */

function loadDistractions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveDistractions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.distractions));
}

/* =========================================================
   5. SMALL HELPERS
   ========================================================= */

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForApp(name) {
  return APP_COLORS[hashString(name.toLowerCase()) % APP_COLORS.length];
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgoStart(n) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

function todayDateStamp() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Group entries by app name, sorted by count (descending). */
function groupByApp(entries) {
  const counts = {};
  for (const entry of entries) {
    counts[entry.app] = (counts[entry.app] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([app, count]) => ({ app, count }))
    .sort((a, b) => b.count - a.count);
}

/* ---- Time-window filters, all relative to "now" ---- */

function entriesToday() {
  const cutoff = startOfToday();
  return state.distractions.filter((d) => new Date(d.time) >= cutoff);
}

function entriesThisWeek() {
  const cutoff = daysAgoStart(6); // last 7 days, inclusive of today
  return state.distractions.filter((d) => new Date(d.time) >= cutoff);
}

function entriesThisMonth() {
  const cutoff = daysAgoStart(29); // last 30 days, inclusive of today
  return state.distractions.filter((d) => new Date(d.time) >= cutoff);
}

function entriesForPeriod(period) {
  if (period === "day") return entriesToday();
  if (period === "week") return entriesThisWeek();
  return entriesThisMonth();
}

/* =========================================================
   6. DATA ACTIONS (create / delete / clear)
   ========================================================= */

function addDistraction(rawName) {
  const app = (rawName || "").trim();
  if (!app) return;

  state.distractions.unshift({
    id: makeId(),
    app,
    time: new Date().toISOString(),
  });

  saveDistractions();
  renderAll();
  showToast(`Distraksi ke "${app}" tercatat otomatis`);
}

function deleteDistraction(id) {
  state.distractions = state.distractions.filter((d) => d.id !== id);
  saveDistractions();
  renderAll();
}

function clearAllData() {
  const confirmed = confirm(
    "Hapus semua data distraksi? Tindakan ini tidak bisa dibatalkan."
  );
  if (!confirmed) return;

  state.distractions = [];
  saveDistractions();
  renderAll();
  showToast("Semua data dihapus");
}

/* =========================================================
   7. TOAST NOTIFICATIONS
   ========================================================= */

let toastTimer = null;

function showToast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.className = isError ? "show error" : "show";

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.className = "";
  }, 2600);
}

/* =========================================================
   8. GAUGE (today's distraction ring)
   ========================================================= */

dom.gaugeFill.style.strokeDasharray = GAUGE_CIRCUMFERENCE.toFixed(2);

function gaugeColorFor(count) {
  if (count === 0) return "#c4b5fd";
  if (count <= 4) return "#8b5cf6";
  if (count <= 8) return "#a855f7";
  return "#c026d3";
}

function renderGauge(todayEntries) {
  const pct = Math.min(todayEntries.length / GAUGE_THRESHOLD, 1);
  const offset = GAUGE_CIRCUMFERENCE * (1 - pct);

  dom.gaugeFill.style.strokeDashoffset = offset.toFixed(2);
  dom.gaugeFill.style.stroke = gaugeColorFor(todayEntries.length);
  dom.gaugeNumber.textContent = todayEntries.length;

  const topApp = groupByApp(todayEntries)[0];
  dom.gaugeSub.innerHTML = topApp
    ? `Paling sering: <b>${topApp.app}</b> (${topApp.count}×)`
    : "Belum ada distraksi hari ini";
}

/* =========================================================
   9. STATS STRIP + HEADER
   ========================================================= */

function renderStats() {
  const today = entriesToday();
  const week = entriesThisWeek();
  const month = entriesThisMonth();

  renderGauge(today);

  dom.statWeek.textContent = week.length;
  dom.statMonth.textContent = month.length;
  dom.statAvg.textContent = (month.length / 30).toFixed(1);
  dom.headerCount.textContent = `${today.length} tercatat hari ini`;
}

function renderClock() {
  const time = new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
  dom.clockText.textContent = `· ${time}`;
}

/* =========================================================
   10. CHARTS
   ========================================================= */

if (window.Chart) {
  Chart.defaults.color = "#948da8";
  Chart.defaults.font.family = "'JetBrains Mono', monospace";
  Chart.defaults.font.size = 11;
}

/** Shows/hides the canvas and toggles a "no data" placeholder. */
function toggleChartEmptyState(canvas, isEmpty, message) {
  const container = canvas.parentElement;
  const existing = container.querySelector(".chart-empty");

  canvas.style.display = isEmpty ? "none" : "block";

  if (isEmpty && !existing) {
    const placeholder = document.createElement("div");
    placeholder.className = "chart-empty";
    placeholder.textContent = message;
    container.appendChild(placeholder);
  } else if (!isEmpty && existing) {
    existing.remove();
  }
}

function renderAppChart(entries) {
  const top8 = groupByApp(entries).slice(0, 8);

  if (state.appChart) {
    state.appChart.destroy();
    state.appChart = null;
  }

  toggleChartEmptyState(dom.appChartCanvas, top8.length === 0, "Belum ada data untuk periode ini.");
  if (top8.length === 0) return;

  state.appChart = new Chart(dom.appChartCanvas, {
    type: "bar",
    data: {
      labels: top8.map((d) => d.app),
      datasets: [{
        data: top8.map((d) => d.count),
        backgroundColor: top8.map((d) => colorForApp(d.app)),
        borderRadius: 6,
        barThickness: 18,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(255,255,255,0.05)" } },
        y: { grid: { display: false } },
      },
    },
  });
}

/** Builds 24 hourly buckets (00:00–23:00) for today's entries. */
function buildHourlyBuckets() {
  const counts = new Array(24).fill(0);
  for (const entry of entriesToday()) {
    counts[new Date(entry.time).getHours()]++;
  }
  const labels = counts.map((_, hour) => `${String(hour).padStart(2, "0")}:00`);
  return { labels, counts };
}

/** Builds one bucket per day for the last `days + 1` days (week/month view). */
function buildDailyBuckets(days, labelFormat) {
  const buckets = [];
  for (let i = days; i >= 0; i--) {
    const start = daysAgoStart(i);
    buckets.push({ start, label: start.toLocaleDateString("id-ID", labelFormat), count: 0 });
  }

  for (const entry of state.distractions) {
    const t = new Date(entry.time).getTime();
    for (let i = buckets.length - 1; i >= 0; i--) {
      const bucketStart = buckets[i].start.getTime();
      const nextStart = i === buckets.length - 1 ? Infinity : buckets[i + 1].start.getTime();
      if (t >= bucketStart && t < nextStart) {
        buckets[i].count++;
        break;
      }
    }
  }

  return {
    labels: buckets.map((b) => b.label),
    counts: buckets.map((b) => b.count),
  };
}

function buildTrendData(period) {
  if (period === "day") return buildHourlyBuckets();
  if (period === "week") return buildDailyBuckets(6, { weekday: "short", day: "numeric" });
  return buildDailyBuckets(29, { day: "2-digit", month: "2-digit" });
}

function renderTrendChart(period) {
  const { labels, counts } = buildTrendData(period);
  const total = counts.reduce((sum, n) => sum + n, 0);

  if (state.trendChart) {
    state.trendChart.destroy();
    state.trendChart = null;
  }

  toggleChartEmptyState(dom.trendChartCanvas, total === 0, "Belum ada data untuk periode ini.");
  if (total === 0) return;

  state.trendChart = new Chart(dom.trendChartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: counts,
        borderColor: "#a78bfa",
        backgroundColor: "rgba(139,92,246,0.18)",
        pointBackgroundColor: "#c4b5fd",
        pointRadius: period === "month" ? 0 : 3,
        borderWidth: 2,
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: period === "day" ? 12 : 10 },
        },
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: "rgba(255,255,255,0.05)" } },
      },
    },
  });
}

function renderCharts(period) {
  const entries = entriesForPeriod(period);
  renderAppChart(entries);
  renderTrendChart(period);
}

/* =========================================================
   11. HISTORY LIST
   ========================================================= */

function buildHistoryRow(entry) {
  const row = document.createElement("div");
  row.className = "history-row";

  const dot = document.createElement("span");
  dot.className = "hrow-dot";
  dot.style.background = colorForApp(entry.app);

  const app = document.createElement("span");
  app.className = "hrow-app";
  app.textContent = entry.app;

  const time = document.createElement("span");
  time.className = "hrow-time";
  time.textContent = new Date(entry.time).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "hrow-del";
  deleteBtn.setAttribute("aria-label", `Hapus entri ${entry.app}`);
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", () => deleteDistraction(entry.id));

  row.append(dot, app, time, deleteBtn);
  return row;
}

function renderHistory(searchTerm) {
  const query = (searchTerm || "").toLowerCase().trim();
  const filtered = state.distractions
    .filter((d) => !query || d.app.toLowerCase().includes(query))
    .slice(0, HISTORY_LIMIT);

  dom.historyList.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = query
      ? `Tidak ada hasil untuk "${searchTerm}".`
      : "Belum ada distraksi tercatat. Data akan otomatis muncul lewat redirect dengan parameter ?source=.";
    dom.historyList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach((entry) => fragment.appendChild(buildHistoryRow(entry)));
  dom.historyList.appendChild(fragment);
}

/* =========================================================
   12. MASTER RENDER
   ========================================================= */

function renderAll() {
  renderStats();
  renderCharts(state.period);
  renderHistory(state.searchTerm);
}

/* =========================================================
   13. IMPORT / EXPORT
   ========================================================= */

function exportData() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    distractions: state.distractions,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `focustrack-export-${todayDateStamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
  showToast("Data berhasil diexport");
}

/** Merges valid entries from an imported file, skipping duplicate ids. */
function mergeImportedEntries(parsed) {
  const existingIds = new Set(state.distractions.map((d) => d.id));
  let added = 0;

  for (const entry of parsed.distractions) {
    const isValid = entry && entry.id && entry.app && entry.time;
    if (isValid && !existingIds.has(entry.id)) {
      state.distractions.push({ id: entry.id, app: String(entry.app), time: entry.time });
      existingIds.add(entry.id);
      added++;
    }
  }

  state.distractions.sort((a, b) => new Date(b.time) - new Date(a.time));
  return added;
}

function importDataFromFile(file) {
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (!parsed || !Array.isArray(parsed.distractions)) {
        throw new Error("Format file tidak valid");
      }

      const added = mergeImportedEntries(parsed);
      saveDistractions();
      renderAll();
      showToast(`Import selesai: ${added} data baru ditambahkan`);
    } catch {
      showToast("Gagal import: file tidak valid", true);
    }
  };

  reader.readAsText(file);
}

/* =========================================================
   14. URL PARAMETER TRACKING (?source=AppName)
   ========================================================= */

function processSourceParam() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get("source");
  if (!source || !source.trim()) return;

  addDistraction(source);

  // Strip the parameter so a page refresh doesn't log it again.
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
}

/* =========================================================
   15. EVENT WIRING
   ========================================================= */

dom.periodTabs.addEventListener("click", (event) => {
  const tab = event.target.closest(".tab-btn");
  if (!tab) return;

  dom.periodTabs.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.remove("active"));
  tab.classList.add("active");

  state.period = tab.dataset.period;
  renderCharts(state.period);
});

dom.historySearch.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderHistory(state.searchTerm);
});

dom.exportBtn.addEventListener("click", exportData);

dom.importBtn.addEventListener("click", () => dom.importInput.click());

dom.importInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (file) importDataFromFile(file);
  event.target.value = ""; // allow re-selecting the same file later
});

dom.resetBtn.addEventListener("click", clearAllData);

/* =========================================================
   16. BOOT
   ========================================================= */

function init() {
  processSourceParam(); // may add an entry + call renderAll() itself
  renderClock();
  renderAll();
  setInterval(renderClock, CLOCK_REFRESH_MS);
}

init();