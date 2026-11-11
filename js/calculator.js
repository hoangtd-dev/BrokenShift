/**
 * Pure calculation functions. No DOM, no storage, no globals.
 * All money values are rounded to whole cents.
 */

/** @typedef {{from: string, to: string|null, rate: number}} RatePeriod  ISO dates (YYYY-MM-DD); `to` null = open-ended */
/**
 * @typedef {Object} Settings
 * @property {number} allowance1Break   Broken shift allowance, 1 unpaid break
 * @property {number} allowance2Breaks  Broken shift allowance, 2 unpaid breaks
 * @property {number} travelFlat        Flat paid-travel amount per trip
 * @property {RatePeriod[]} kmRatePeriods
 * @property {string} calculationDate   ISO date, or '' meaning "today"
 * @property {number} weeksPerMonth
 */
/** @typedef {{id: string, employee: string, day: number, km: number, breaks: 1|2}} RosterRow  day: 0 = Monday … 6 = Sunday */
/** @typedef {{rate: number, period: RatePeriod|null, status: 'matched'|'outside'|'none'}} RateLookup */
/**
 * @typedef {Object} Comparison
 * @property {number} costA
 * @property {number} costB
 * @property {'A'|'B'|'equal'} costlier
 * @property {'A'|'B'|'equal'} cheaper
 * @property {number} difference  absolute difference
 * @property {number} signed      costB - costA (negative = paid travel is lower)
 * @property {number|null} pct    change from A to B in percent ((B - A) / A * 100); null when A is 0
 */

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Round to cents.
 * @param {number} n
 * @returns {number}
 */
export function roundCents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Cost A: broken shift allowance for the number of unpaid breaks.
 * @param {Settings} settings
 * @param {number} unpaidBreaks 1 or 2
 * @returns {number}
 */
export function brokenShiftAllowance(settings, unpaidBreaks) {
  return unpaidBreaks === 2 ? settings.allowance2Breaks : settings.allowance1Break;
}

/**
 * Find the km rate that applies on a date.
 * If the date falls outside every period, the nearest earlier period (or the earliest) is used and status is 'outside'.
 * With no periods at all the rate is 0 and status is 'none'.
 * @param {RatePeriod[]} periods
 * @param {string} dateIso YYYY-MM-DD
 * @returns {RateLookup}
 */
export function findKmRate(periods, dateIso) {
  if (!periods.length) return { rate: 0, period: null, status: 'none' };
  const sorted = [...periods].sort((a, b) => a.from.localeCompare(b.from));
  const match = sorted.find((p) => p.from <= dateIso && (!p.to || dateIso <= p.to));
  if (match) return { rate: match.rate, period: match, status: 'matched' };
  // Outside every period: fall back to the nearest earlier period (or the earliest) and flag it.
  const fallback = sorted.filter((p) => p.from <= dateIso).pop() || sorted[0];
  return { rate: fallback.rate, period: fallback, status: 'outside' };
}

/**
 * Cost B: flat travel amount per trip, plus kilometres at the applicable rate.
 * Trips = unpaid breaks (1 or 2); the flat amount is multiplied by trips, the km are counted once.
 * @param {Settings} settings
 * @param {number} km distance entered for the pair
 * @param {number} kmRate
 * @param {number} [trips=1]
 * @returns {number}
 */
export function paidTravelCost(settings, km, kmRate, trips = 1) {
  return roundCents(trips * settings.travelFlat + km * kmRate);
}

/**
 * Compare two costs neutrally.
 * @param {number} costA
 * @param {number} costB
 * @returns {Comparison}
 */
export function compareCosts(costA, costB) {
  const difference = roundCents(Math.abs(costA - costB));
  const signed = roundCents(costB - costA);
  const pct = costA === 0 ? null : (signed / costA) * 100;
  if (difference === 0) return { costA, costB, costlier: 'equal', cheaper: 'equal', difference, signed, pct };
  return {
    costA,
    costB,
    costlier: costA > costB ? 'A' : 'B',
    cheaper: costA > costB ? 'B' : 'A',
    difference,
    signed,
    pct,
  };
}

/**
 * Calculate both options for one roster row.
 * @param {RosterRow} row
 * @param {Settings} settings
 * @param {number} kmRate
 * @returns {Comparison}
 */
export function calculateRow(row, settings, kmRate) {
  return compareCosts(brokenShiftAllowance(settings, row.breaks), paidTravelCost(settings, row.km, kmRate, row.breaks));
}

/**
 * Totals for a set of rows. Each row is one pair of shifts per week,
 * so the totals are weekly figures.
 * @param {RosterRow[]} rows
 * @param {Settings} settings
 * @param {number} kmRate
 * @returns {{lines: Array<{row: RosterRow, result: Comparison}>, weekly: Comparison, monthly: Comparison}}
 */
export function summarise(rows, settings, kmRate) {
  const lines = rows.map((row) => ({ row, result: calculateRow(row, settings, kmRate) }));
  const weeklyA = roundCents(lines.reduce((s, l) => s + l.result.costA, 0));
  const weeklyB = roundCents(lines.reduce((s, l) => s + l.result.costB, 0));
  return {
    lines,
    weekly: compareCosts(weeklyA, weeklyB),
    monthly: monthlyEstimate(weeklyA, weeklyB, settings.weeksPerMonth),
  };
}

/**
 * Monthly estimate = weekly total × weeks-per-month factor.
 * @param {number} weeklyA
 * @param {number} weeklyB
 * @param {number} weeksPerMonth
 * @returns {Comparison}
 */
export function monthlyEstimate(weeklyA, weeklyB, weeksPerMonth) {
  return compareCosts(roundCents(weeklyA * weeksPerMonth), roundCents(weeklyB * weeksPerMonth));
}

/**
 * Group rows by employee (case-insensitive, trimmed), keeping first-seen order and spelling.
 * Rows within a group are ordered by weekday, then by original order.
 * @param {RosterRow[]} rows
 * @returns {Array<{name: string, rows: RosterRow[]}>}
 */
export function groupByEmployee(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.employee.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: row.employee.trim(), rows: [] });
    groups.get(key).rows.push(row);
  }
  return [...groups.values()].map((g) => ({
    name: g.name,
    rows: g.rows
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.day - b.r.day || a.i - b.i)
      .map((x) => x.r),
  }));
}

/**
 * Weekly totals per weekday, Monday to Sunday (days with no rows are included as zeros).
 * @param {RosterRow[]} rows
 * @param {Settings} settings
 * @param {number} kmRate
 * @returns {Array<{day: string, count: number, comparison: Comparison}>}
 */
export function weekdayBreakdown(rows, settings, kmRate) {
  return WEEKDAYS.map((day, index) => {
    const dayRows = rows.filter((r) => r.day === index);
    const { weekly } = summarise(dayRows, settings, kmRate);
    return { day, count: dayRows.length, comparison: weekly };
  });
}

/**
 * Validate a row's user input.
 * @param {{employee: string, km: number, breaks: number}} input
 * @returns {string[]} error messages (empty when valid)
 */
export function validateRow(input) {
  const errors = [];
  if (!input.employee || !input.employee.trim()) errors.push('Employee name is required.');
  if (!Number.isFinite(input.km) || input.km < 0) errors.push('Distance must be a number of 0 km or more.');
  if (input.breaks !== 1 && input.breaks !== 2) errors.push('Unpaid breaks must be 1 or 2.');
  return errors;
}

/**
 * Validate settings.
 * @param {Settings} s
 * @returns {string[]} error messages (empty when valid)
 */
export function validateSettings(s) {
  const errors = [];
  const money = [
    ['Allowance (1 break)', s.allowance1Break],
    ['Allowance (2 breaks)', s.allowance2Breaks],
    ['Travel time amount', s.travelFlat],
  ];
  for (const [label, v] of money) {
    if (!Number.isFinite(v) || v < 0) errors.push(`${label} must be 0 or more.`);
  }
  if (!Number.isFinite(s.weeksPerMonth) || s.weeksPerMonth <= 0) errors.push('Weeks per month must be greater than 0.');

  const sorted = [...s.kmRatePeriods].sort((a, b) => a.from.localeCompare(b.from));
  sorted.forEach((p, i) => {
    const n = i + 1;
    if (!p.from) errors.push(`Rate period ${n}: start date is required.`);
    if (!Number.isFinite(p.rate) || p.rate < 0) errors.push(`Rate period ${n}: rate must be 0 or more.`);
    if (p.from && p.to && p.to < p.from) errors.push(`Rate period ${n}: end date is before start date.`);
    const next = sorted[i + 1];
    if (next && next.from && (!p.to || p.to >= next.from)) {
      errors.push(`Rate periods ${n} and ${n + 1} overlap.`);
    }
  });
  return errors;
}

/**
 * The date used for rate lookup.
 * @param {Settings} settings
 * @param {string} todayIso
 * @returns {string}
 */
export function resolveCalculationDate(settings, todayIso) {
  return settings.calculationDate || todayIso;
}
