/**
 * PDF export via the browser's print dialog ("Save as PDF").
 * Two outputs, both numbers-only:
 *   - Summary: one compact page for the whole roster.
 *   - Details: one page per employee.
 * "%" is the change from A (broken shift) to B (paid travel): (B − A) / A.
 */
import { WEEKDAYS, groupByEmployee, summarise } from './calculator.js';
import { cheaperLabel, formatAUD, formatDate, formatKm, formatPct, formatSignedAUD, todayIso } from './format.js';
import { el, rateContext } from './ui.js';

const NAMES = { A: 'Broken shift', B: 'Paid travel' };
const cell = (text, cls) => el('td', { class: cls }, text);
const th = (text, cls) => el('th', { class: cls }, text);

/** Cost cell; the lower cost is highlighted. */
function costCell(c, option) {
  const state = c.cheaper === option ? 'best' : c.cheaper === 'equal' ? '' : 'worse';
  return cell(formatAUD(option === 'A' ? c.costA : c.costB), `num ${state}`);
}

/** Difference (B − A) and % cells. Negative = paid travel is lower. */
const diffCell = (c) => cell(formatSignedAUD(c.signed), 'num');
const pctCell = (c) => cell(formatPct(c.pct), 'num pct');

function amountBox(c, option) {
  const best = c.cheaper === option;
  return el('div', { class: `p-box ${best ? 'best' : ''}` },
    el('span', { class: 'p-box-label' }, `${option} · ${NAMES[option]}`),
    el('span', { class: 'p-box-value' }, formatAUD(option === 'A' ? c.costA : c.costB)),
    best ? el('span', { class: 'p-box-flag' }, '✓ Lower') : null);
}

/** Weekly or monthly block: A, B and the B − A change in $ and %. */
function periodBlock(title, c) {
  return el('div', { class: 'p-period' },
    el('h3', {}, title),
    el('div', { class: 'p-boxes' }, amountBox(c, 'A'), amountBox(c, 'B')),
    el('div', { class: 'p-delta' },
      el('span', {}, 'B vs A'),
      el('strong', {}, formatSignedAUD(c.signed)),
      el('strong', { class: 'pct' }, formatPct(c.pct))));
}

/** Headline strip: lower option, monthly saving, % change. */
function banner(monthly, label) {
  const stat = (k, v) => el('div', { class: 'p-stat' }, el('span', {}, k), el('strong', {}, v));
  return el('div', { class: `p-banner ${monthly.cheaper === 'equal' ? 'neutral' : ''}` },
    el('span', { class: 'p-banner-label' }, label),
    el('div', { class: 'p-stats' },
      stat('Lower cost', monthly.cheaper === 'equal' ? 'Equal' : NAMES[monthly.cheaper]),
      stat('Monthly difference', formatAUD(monthly.difference)),
      stat('B vs A', formatPct(monthly.pct))));
}

function pageHeader(title, ctx, right) {
  return el('header', { class: 'p-head' },
    el('h1', {}, title),
    el('div', { class: 'p-date' }, right ? el('strong', {}, right) : null, el('span', {}, `${formatDate(todayIso())} · rates ${formatDate(ctx.dateIso)}`)));
}

/** Compact rates line (values only). */
function ratesLine(settings, ctx) {
  const item = (k, v) => el('div', {}, el('dt', {}, k), el('dd', {}, v));
  return el('dl', { class: 'p-rates' },
    item('Allowance · 1 break', formatAUD(settings.allowance1Break)),
    item('Allowance · 2 breaks', formatAUD(settings.allowance2Breaks)),
    item('Travel / trip', formatAUD(settings.travelFlat)),
    item('Per km', formatAUD(ctx.lookup.rate)),
    item('Weeks / month', String(settings.weeksPerMonth)));
}

/** Page 1 of the summary export: whole roster, one row per employee. */
function buildSummaryPage(groups, settings, ctx) {
  const rate = ctx.lookup.rate;
  const all = summarise(groups.flatMap((g) => g.rows), settings, rate);

  const body = el('tbody');
  for (const g of groups) {
    const s = summarise(g.rows, settings, rate);
    body.append(el('tr', {},
      el('th', { scope: 'row' }, g.name),
      costCell(s.weekly, 'A'), costCell(s.weekly, 'B'), diffCell(s.weekly),
      costCell(s.monthly, 'A'), costCell(s.monthly, 'B'), diffCell(s.monthly),
      pctCell(s.monthly)));
  }
  body.append(el('tr', { class: 'total' },
    el('th', { scope: 'row' }, 'Total'),
    costCell(all.weekly, 'A'), costCell(all.weekly, 'B'), diffCell(all.weekly),
    costCell(all.monthly, 'A'), costCell(all.monthly, 'B'), diffCell(all.monthly),
    pctCell(all.monthly)));

  return el('section', { class: 'print-page' },
    pageHeader('Summary', ctx, `${groups.length} employee${groups.length === 1 ? '' : 's'}`),
    banner(all.monthly, 'All employees'),
    el('div', { class: 'p-periods' }, periodBlock('Weekly', all.weekly), periodBlock('Monthly', all.monthly)),
    el('table', {},
      el('thead', {},
        el('tr', { class: 'group' }, th('', ''), el('th', { class: 'num', colspan: '3' }, 'Weekly'), el('th', { class: 'num', colspan: '3' }, 'Monthly'), th('', '')),
        el('tr', {}, th('Employee', ''), th('A', 'num'), th('B', 'num'), th('B − A', 'num'), th('A', 'num'), th('B', 'num'), th('B − A', 'num'), th('B vs A', 'num'))),
      body));
}

/** One details page for one employee. */
function buildDetailPage(group, settings, ctx) {
  const s = summarise(group.rows, settings, ctx.lookup.rate);

  const table = el('table', {},
    el('thead', {}, el('tr', {},
      th('Day', ''), th('km', 'num'), th('Breaks', 'num'), th('A · Broken shift', 'num'), th('B · Paid travel', 'num'), th('B − A', 'num'), th('B vs A', 'num'), th('Lower', ''))),
    el('tbody', {}, ...s.lines.map(({ row, result }) =>
      el('tr', {},
        cell(WEEKDAYS[row.day]),
        cell(formatKm(row.km), 'num'),
        cell(String(row.breaks), 'num'),
        costCell(result, 'A'), costCell(result, 'B'),
        diffCell(result), pctCell(result),
        cell(cheaperLabel(result.cheaper))))));

  return el('section', { class: 'print-page' },
    pageHeader(group.name, ctx, `${group.rows.length} pair${group.rows.length === 1 ? '' : 's'} / week`),
    banner(s.monthly, 'Result'),
    el('div', { class: 'p-periods' }, periodBlock('Weekly', s.weekly), periodBlock(`Monthly (× ${settings.weeksPerMonth})`, s.monthly)),
    table,
    ratesLine(settings, ctx));
}

/** Fill #print-root, open the print dialog, then clean up. */
function printPages(pages, fileName) {
  const printRoot = document.getElementById('print-root');
  printRoot.replaceChildren(...pages);

  // The document title becomes the suggested PDF file name.
  const originalTitle = document.title;
  document.title = `${fileName} - ${todayIso()}`;
  window.addEventListener('afterprint', () => {
    printRoot.replaceChildren();
    document.title = originalTitle;
  }, { once: true });
  window.print();
}

function sortedGroups(store, names) {
  let groups = groupByEmployee(store.getState().rows).sort((a, b) => a.name.localeCompare(b.name));
  if (names) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    groups = groups.filter((g) => wanted.has(g.name.toLowerCase()));
  }
  return groups;
}

/**
 * Export 1: roster summary (single page unless there are very many employees).
 * @param {ReturnType<import('./state.js').createStore>} store
 */
export function exportSummary(store) {
  const groups = sortedGroups(store, null);
  if (!groups.length) return;
  const { settings } = store.getState();
  printPages([buildSummaryPage(groups, settings, rateContext(settings))], 'Broken shift vs travel - summary');
}

/**
 * Export 2: per-employee details, one page each.
 * @param {ReturnType<import('./state.js').createStore>} store
 * @param {string[]|null} names employee names, or null for everyone
 */
export function exportDetails(store, names = null) {
  const groups = sortedGroups(store, names);
  if (!groups.length) return;
  const { settings } = store.getState();
  const ctx = rateContext(settings);
  const label = groups.length === 1 ? groups[0].name : 'all employees';
  printPages(groups.map((g) => buildDetailPage(g, settings, ctx)), `Broken shift vs travel - details - ${label}`);
}
