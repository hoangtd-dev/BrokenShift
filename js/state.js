/**
 * Application data and localStorage persistence.
 * To change the default rates, edit DEFAULT_SETTINGS below.
 */

/** @typedef {import('./calculator.js').Settings} Settings */
/** @typedef {import('./calculator.js').RosterRow} RosterRow */

const STORAGE_KEY = 'brokenShiftCalc.v1';

/** @type {Settings} */
export const DEFAULT_SETTINGS = Object.freeze({
  allowance1Break: 21.81,
  allowance2Breaks: 28.87,
  travelFlat: 10.0,
  kmRatePeriods: [
    { from: '2026-09-01', to: '2027-02-28', rate: 1.05 },
    { from: '2027-03-01', to: null, rate: 1.01 },
  ],
  calculationDate: '', // '' = use today's date
  weeksPerMonth: 4.33,
});

/** @returns {Settings} a fresh deep copy of the defaults */
function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `r${Date.now()}${Math.random().toString(16).slice(2)}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Merge stored settings over defaults, ignoring malformed values. */
function sanitiseSettings(raw) {
  const out = cloneDefaults();
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ['allowance1Break', 'allowance2Breaks', 'travelFlat', 'weeksPerMonth']) {
    if (isNum(raw[key])) out[key] = raw[key];
  }
  if (typeof raw.calculationDate === 'string') out.calculationDate = raw.calculationDate;
  if (Array.isArray(raw.kmRatePeriods)) {
    out.kmRatePeriods = raw.kmRatePeriods
      .filter((p) => p && typeof p.from === 'string' && isNum(p.rate))
      .map((p) => ({ from: p.from, to: typeof p.to === 'string' && p.to ? p.to : null, rate: p.rate }));
  }
  return out;
}

function sanitiseRows(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r.employee === 'string' && r.employee.trim() && isNum(r.km) && r.km >= 0)
    .map((r) => ({
      id: typeof r.id === 'string' ? r.id : newId(),
      employee: r.employee.trim(),
      day: Number.isInteger(r.day) && r.day >= 0 && r.day <= 6 ? r.day : 0,
      km: r.km,
      breaks: r.breaks === 2 ? 2 : 1,
    }));
}

/**
 * Create the store. Storage is injectable so tests can pass a fake.
 * @param {Storage} [storage]
 */
export function createStore(storage = globalThis.localStorage) {
  /** @type {{settings: Settings, rows: RosterRow[]}} */
  let state = { settings: cloneDefaults(), rows: [] };
  const listeners = new Set();

  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null');
    if (saved) state = { settings: sanitiseSettings(saved.settings), rows: sanitiseRows(saved.rows) };
  } catch {
    // Unreadable or unavailable storage: start with defaults.
  }

  function commit(next) {
    state = next;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keep working in memory.
    }
    listeners.forEach((fn) => fn(state));
  }

  return {
    getState: () => state,

    /** @param {(state: object) => void} fn @returns {() => void} unsubscribe */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** @returns {string[]} distinct employee names, sorted */
    employeeNames() {
      const seen = new Map();
      state.rows.forEach((r) => seen.set(r.employee.toLowerCase(), r.employee));
      return [...seen.values()].sort((a, b) => a.localeCompare(b));
    },

    /** @param {Omit<RosterRow, 'id'>} data */
    addRow(data) {
      commit({ ...state, rows: [...state.rows, { ...data, employee: data.employee.trim(), id: newId() }] });
    },

    /** @param {string} id @param {Omit<RosterRow, 'id'>} data */
    updateRow(id, data) {
      commit({
        ...state,
        rows: state.rows.map((r) => (r.id === id ? { ...data, employee: data.employee.trim(), id } : r)),
      });
    },

    /** @param {string} id */
    deleteRow(id) {
      commit({ ...state, rows: state.rows.filter((r) => r.id !== id) });
    },

    /** Remove every row for an employee (case-insensitive name match). @param {string} name */
    deleteEmployee(name) {
      const key = name.trim().toLowerCase();
      commit({ ...state, rows: state.rows.filter((r) => r.employee.trim().toLowerCase() !== key) });
    },

    /** @param {string} id */
    duplicateRow(id) {
      const index = state.rows.findIndex((r) => r.id === id);
      if (index < 0) return;
      const rows = [...state.rows];
      rows.splice(index + 1, 0, { ...state.rows[index], id: newId() });
      commit({ ...state, rows });
    },

    /** @param {Settings} settings */
    saveSettings(settings) {
      commit({ ...state, settings: sanitiseSettings(settings) });
    },

    resetSettings() {
      commit({ ...state, settings: cloneDefaults() });
    },
  };
}
