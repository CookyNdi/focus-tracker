/* =========================================================
   FocusTrack Redirector — popup.js
   ---------------------------------------------------------
   All popup interactions: manage the site list (add/edit/
   delete), configure work hours, and view redirect history.
   Depends on helper functions from utils.js (loaded before
   this file in popup.html).
   ========================================================= */

"use strict";

/* =========================================================
   1. DOM REFERENCES
   ========================================================= */

const dom = {
  tabs: document.getElementById("tabs"),

  siteList: document.getElementById("siteList"),
  addSiteBtn: document.getElementById("addSiteBtn"),
  siteForm: document.getElementById("siteForm"),
  formTitle: document.getElementById("formTitle"),
  siteName: document.getElementById("siteName"),
  sitePattern: document.getElementById("sitePattern"),
  saveSiteBtn: document.getElementById("saveSiteBtn"),
  cancelSiteBtn: document.getElementById("cancelSiteBtn"),

  hoursEnabled: document.getElementById("hoursEnabled"),
  hoursFields: document.getElementById("hoursFields"),
  hoursStart: document.getElementById("hoursStart"),
  hoursEnd: document.getElementById("hoursEnd"),
  daysRow: document.getElementById("daysRow"),
  saveHoursBtn: document.getElementById("saveHoursBtn"),

  historyList: document.getElementById("historyList"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),

  toast: document.getElementById("toast"),
};

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

/* =========================================================
   2. STATE
   ========================================================= */

const state = {
  sites: [],
  workHours: { enabled: true, start: "09:00", end: "17:00", days: [1, 2, 3, 4, 5] },
  history: [],
  editingId: null,
  selectedDays: new Set([1, 2, 3, 4, 5]),
};

/* =========================================================
   3. STORAGE
   ========================================================= */

async function loadAll() {
  const data = await chrome.storage.local.get(["sites", "workHours", "history"]);
  state.sites = data.sites || [];
  state.workHours = data.workHours || state.workHours;
  state.history = data.history || [];
  state.selectedDays = new Set(state.workHours.days || []);
}

async function persistSites() {
  await chrome.storage.local.set({ sites: state.sites });
}

async function persistWorkHours() {
  await chrome.storage.local.set({ workHours: state.workHours });
}

async function persistClearHistory() {
  state.history = [];
  await chrome.storage.local.set({ history: [] });
}

/* =========================================================
   4. TOAST
   ========================================================= */

let toastTimer = null;

function showToast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.className = isError ? "show error" : "show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.className = "";
  }, 2200);
}

/* =========================================================
   5. TABS
   ========================================================= */

dom.tabs.addEventListener("click", (event) => {
  const btn = event.target.closest(".tab-btn");
  if (!btn) return;

  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

  btn.classList.add("active");
  document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
});

/* =========================================================
   6. SITES: render + CRUD
   ========================================================= */

function renderSites() {
  dom.siteList.innerHTML = "";

  if (state.sites.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No sites yet. Add the social apps you want redirected.";
    dom.siteList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.sites.forEach((site) => {
    const row = document.createElement("div");
    row.className = "site-row";

    const info = document.createElement("div");
    info.className = "site-info";
    const name = document.createElement("div");
    name.className = "site-name";
    name.textContent = site.name;
    const pattern = document.createElement("div");
    pattern.className = "site-pattern";
    pattern.textContent = site.pattern;
    info.append(name, pattern);

    const actions = document.createElement("div");
    actions.className = "site-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.type = "button";
    editBtn.textContent = "✎";
    editBtn.setAttribute("aria-label", `Edit ${site.name}`);
    editBtn.addEventListener("click", () => openEditForm(site));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "icon-btn danger";
    deleteBtn.type = "button";
    deleteBtn.textContent = "×";
    deleteBtn.setAttribute("aria-label", `Delete ${site.name}`);
    deleteBtn.addEventListener("click", () => deleteSite(site.id));

    actions.append(editBtn, deleteBtn);
    row.append(info, actions);
    fragment.appendChild(row);
  });

  dom.siteList.appendChild(fragment);
}

function openAddForm() {
  state.editingId = null;
  dom.formTitle.textContent = "Add site";
  dom.siteName.value = "";
  dom.sitePattern.value = "";
  dom.siteForm.classList.remove("hidden");
  dom.siteName.focus();
}

function openEditForm(site) {
  state.editingId = site.id;
  dom.formTitle.textContent = "Edit site";
  dom.siteName.value = site.name;
  dom.sitePattern.value = site.pattern;
  dom.siteForm.classList.remove("hidden");
  dom.siteName.focus();
}

function closeForm() {
  state.editingId = null;
  dom.siteForm.classList.add("hidden");
}

async function saveSiteFromForm() {
  const name = dom.siteName.value.trim();
  const patternRaw = dom.sitePattern.value.trim();

  if (!name || !patternRaw) {
    showToast("Name & domain are required", true);
    return;
  }

  const pattern = normalizeHost(patternRaw) || patternRaw.toLowerCase();
  if (!pattern) {
    showToast("Invalid domain", true);
    return;
  }

  if (state.editingId) {
    const idx = state.sites.findIndex((s) => s.id === state.editingId);
    if (idx > -1) state.sites[idx] = { ...state.sites[idx], name, pattern };
  } else {
    state.sites.push({ id: makeId("site"), name, pattern });
  }

  await persistSites();
  renderSites();
  closeForm();
  showToast("Site saved");
}

async function deleteSite(id) {
  state.sites = state.sites.filter((s) => s.id !== id);
  await persistSites();
  renderSites();
  showToast("Site deleted");
}

dom.addSiteBtn.addEventListener("click", openAddForm);
dom.cancelSiteBtn.addEventListener("click", closeForm);
dom.saveSiteBtn.addEventListener("click", saveSiteFromForm);

/* =========================================================
   7. WORK HOURS
   ========================================================= */

function renderDays() {
  dom.daysRow.innerHTML = "";

  DAYS.forEach((day) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "day-chip" + (state.selectedDays.has(day.value) ? " active" : "");
    chip.textContent = day.label;
    chip.addEventListener("click", () => {
      if (state.selectedDays.has(day.value)) state.selectedDays.delete(day.value);
      else state.selectedDays.add(day.value);
      renderDays();
    });
    dom.daysRow.appendChild(chip);
  });
}

function renderWorkHours() {
  dom.hoursEnabled.checked = !!state.workHours.enabled;
  dom.hoursStart.value = state.workHours.start || "09:00";
  dom.hoursEnd.value = state.workHours.end || "17:00";
  dom.hoursFields.classList.toggle("disabled", !state.workHours.enabled);
  renderDays();
}

dom.hoursEnabled.addEventListener("change", () => {
  dom.hoursFields.classList.toggle("disabled", !dom.hoursEnabled.checked);
});

dom.saveHoursBtn.addEventListener("click", async () => {
  if (dom.hoursEnabled.checked && state.selectedDays.size === 0) {
    showToast("Pick at least one work day", true);
    return;
  }

  state.workHours = {
    enabled: dom.hoursEnabled.checked,
    start: dom.hoursStart.value || "09:00",
    end: dom.hoursEnd.value || "17:00",
    days: Array.from(state.selectedDays).sort(),
  };

  await persistWorkHours();
  showToast("Work hours saved");
});

/* =========================================================
   8. HISTORY
   ========================================================= */

function renderHistory() {
  dom.historyList.innerHTML = "";

  if (state.history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No redirects yet.";
    dom.historyList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.history.slice(0, 30).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "history-row";

    const name = document.createElement("span");
    name.className = "hrow-name";
    name.textContent = entry.name;

    const time = document.createElement("span");
    time.className = "hrow-time";
    time.textContent = new Date(entry.time).toLocaleString("en-US", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

    row.append(name, time);
    fragment.appendChild(row);
  });

  dom.historyList.appendChild(fragment);
}

dom.clearHistoryBtn.addEventListener("click", async () => {
  await persistClearHistory();
  renderHistory();
  showToast("History cleared");
});

/* =========================================================
   9. BOOT
   ========================================================= */

async function init() {
  await loadAll();
  renderSites();
  renderWorkHours();
  renderHistory();
}

init();