/**
 * PDF export via the browser's print dialog ("Save as PDF").
 * Builds printable pages inside #print-root; css/print.css shows only that area when printing.
 * Layout is result-first: headline verdict and totals on top, shift detail and assumptions below.
 */
import { WEEKDAYS, groupByEmployee, summarise } from './calculator.js';
import { cheaperLabel, formatAUD, formatDate, formatKm, todayIso } from './format.js';
import { el, rateContext, rateNote } from './ui.js';

const NAMES = { A: 'Broken shift', B: 'Paid travel' };
const cell = (text, cls) => el('td', { class: cls }, text);

/** e.g. "Paid travel is $20.18 lower" */
function lowerText(c) {
  return c.cheaper === 'equal' ? 'Both options cost the same' : `${NAMES[c.cheaper]} is ${formatAUD(c.difference)} lower`;
}

/** Cost table cell, lower cost highlighted. */
function costCell(c, option) {
  const best = c.cheaper === option;
  return cell(formatAUD(option === 'A' ? c.costA : c.costB), `num ${best ? 'best' : c.cheaper === 'equal' ? '' : 'worse'}`);
}

/** One amount box (A or B). */
function amountBox(c, option) {
  const best = c.cheaper === option;
  return el('div', { class: `p-box ${best ? 'best' : ''}` },
    el('span', { class: 'p-box-label' }, `${option} · ${NAMES[option]}`),
    el('span', { class: 'p-box-value' }, formatAUD(option === 'A' ? c.costA : c.costB)),
    best ? el('span', { class: 'p-box-flag' }, '✓ Lower cost') : null);
}

/** Weekly or monthly block with the two amounts and a one-line verdict. */
function periodBlock(title, c, per) {
  return el('div', { class: 'p-period' },
    el('h3', {}, title),
    el('div', { class: 'p-boxes' }, amountBox(c, 'A'), amountBox(c, 'B')),
    el('p', { class: 'p-verdict-line' }, c.cheaper === 'equal' ? lowerText(c) : `${lowerText(c)} ${per}`));
}

/** Green headline banner. */
function banner(monthly, weekly, subject) {
  return el('div', { class: `p-banner ${monthly.cheaper === 'equal' ? 'neutral' : ''}` },
    el('span', { class: 'p-banner-label' }, subject),
    el('span', { class: 'p-banner-main' }, monthly.cheaper === 'equal' ? 'Both options cost the same' : `${lowerText(monthly)} per month`),
    monthly.cheaper === 'equal' ? null : el('span', { class: 'p-banner-sub' }, `${formatAUD(weekly.difference)} lower per week`));
}

function pageHeader(title, subtitle, ctx) {
  return el('header', { class: 'p-head' },
    el('div', {},
      el('p', { class: 'p-kicker' }, 'Broken shift vs paid travel · cost comparison'),
      el('h1', {}, title),
      subtitle ? el('p', { class: 'p-sub' }, subtitle) : null),
    el('div', { class: 'p-date' }, el('span', {}, 'Prepared'), el('strong', {}, formatDate(todayIso())), el('span', {}, `Rates as at ${formatDate(ctx.dateIso)}`)));
}

function assumptions(settings, ctx) {
  const item = (k, v) => el('div', {}, el('dt', {}, k), el('dd', {}, v));
  return el('section', { class: 'p-assume' },
    el('h3', {}, 'Assumptions'),
    el('dl', {},
      item('A · Allowance, 1 unpaid break', formatAUD(settings.allowance1Break)),
      item('A · Allowance, 2 unpaid breaks', formatAUD(settings.allowance2Breaks)),
      item('B · Travel time (flat per trip)', formatAUD(settings.travelFlat)),
      item('B · Vehicle rate', `${formatAUD(ctx.lookup.rate)} per km`),
      item('Weeks per month', String(settings.weeksPerMonth))),
    ctx.lookup.status === 'matched' ? null : el('p', { class: 'p-warn' }, rateNote(ctx)),
    el('p', { class: 'p-foot' }, 'Each row is one pair of shifts per week. Monthly = weekly × weeks per month. Figures are for comparison only; the decision rests with the rostering manager.'));
}

/** One page for one employee. */
function buildEmployeePage(group, settings, ctx) {
  const s = summarise(group.rows, settings, ctx.lookup.rate);
  const pairs = `${group.rows.length} pair${group.rows.length === 1 ? '' : 's'} of shifts per week`;

  const table = el('table', {},
    el('thead', {}, el('tr', {}, ...['Day', 'km', 'Breaks', 'A · Broken shift', 'B · Paid travel', 'Difference', 'Lower cost']
      .map((h, i) => el('th', { class: i === 0 || i === 6 ? '' : 'num' }, h)))),
    el('tbody', {}, ...s.lines.map(({ row, result }) =>
      el('tr', {},
        cell(WEEKDAYS[row.day]),
        cell(formatKm(row.km), 'num'),
        cell(String(row.breaks), 'num'),
        costCell(result, 'A'),
        costCell(result, 'B'),
        cell(result.difference ? formatAUD(result.difference) : '—', 'num'),
        cell(result.cheaper === 'equal' ? 'Equal' : cheaperLabel(result.cheaper))))));

  return el('section', { class: 'print-page' },
    pageHeader(group.name, pairs, ctx),
    banner(s.monthly, s.weekly, 'Result'),
    el('div', { class: 'p-periods' }, periodBlock('Per week', s.weekly, 'per week'), periodBlock(`Monthly estimate (× ${settings.weeksPerMonth})`, s.monthly, 'per month')),
    el('h3', { class: 'p-section' }, 'Shift detail'),
    table,
    assumptions(settings, ctx));
}

/** Summary page for a multi-employee export. */
function buildSummaryPage(groups, settings, ctx) {
  const rate = ctx.lookup.rate;
  const all = summarise(groups.flatMap((g) => g.rows), settings, rate);
  const body = el('tbody');
  for (const g of groups) {
    const s = summarise(g.rows, settings, rate);
    body.append(el('tr', {},
      el('th', { scope: 'row' }, g.name),
      cell(String(g.rows.length), 'num'),
      costCell(s.weekly, 'A'), costCell(s.weekly, 'B'),
      costCell(s.monthly, 'A'), costCell(s.monthly, 'B'),
      cell(s.monthly.cheaper === 'equal' ? 'Equal' : `${cheaperLabel(s.monthly.cheaper)} −${formatAUD(s.monthly.difference)}`)));
  }
  body.append(el('tr', { class: 'total' },
    el('th', { scope: 'row' }, 'Total'),
    cell(String(groups.reduce((n, g) => n + g.rows.length, 0)), 'num'),
    costCell(all.weekly, 'A'), costCell(all.weekly, 'B'),
    costCell(all.monthly, 'A'), costCell(all.monthly, 'B'),
    cell(all.monthly.cheaper === 'equal' ? 'Equal' : `${cheaperLabel(all.monthly.cheaper)} −${formatAUD(all.monthly.difference)}`)));

  return el('section', { class: 'print-page' },
    pageHeader('Roster summary', `${groups.length} employees`, ctx),
    banner(all.monthly, all.weekly, 'Result — all employees'),
    el('div', { class: 'p-periods' }, periodBlock('Per week', all.weekly, 'per week'), periodBlock(`Monthly estimate (× ${settings.weeksPerMonth})`, all.monthly, 'per month')),
    el('h3', { class: 'p-section' }, 'By employee'),
    el('table', {},
      el('thead', {}, el('tr', {},
        el('th', {}, 'Employee'), el('th', { class: 'num' }, 'Pairs'),
        el('th', { class: 'num' }, 'Weekly A'), el('th', { class: 'num' }, 'Weekly B'),
        el('th', { class: 'num' }, 'Monthly A'), el('th', { class: 'num' }, 'Monthly B'),
        el('th', {}, 'Lower cost (monthly)'))),
      body),
    assumptions(settings, ctx));
}

/**
 * Open the print dialog with the chosen employees.
 * @param {ReturnType<import('./state.js').createStore>} store
 * @param {string[]|null} names employee names, or null for everyone
 */
export function exportPdf(store, names = null) {
  const { settings, rows } = store.getState();
  const ctx = rateContext(settings);
  let groups = groupByEmployee(rows).sort((a, b) => a.name.localeCompare(b.name));
  if (names) {
    const wanted = new Set(names.map((n) => n.toLowerCase()));
    groups = groups.filter((g) => wanted.has(g.name.toLowerCase()));
  }
  if (!groups.length) return;

  const pages = groups.map((g) => buildEmployeePage(g, settings, ctx));
  if (groups.length > 1) pages.unshift(buildSummaryPage(groups, settings, ctx));

  const printRoot = document.getElementById('print-root');
  printRoot.replaceChildren(...pages);

  // The document title becomes the suggested PDF file name.
  const originalTitle = document.title;
  document.title = groups.length === 1 ? `Broken shift vs travel - ${groups[0].name} - ${todayIso()}` : `Broken shift vs travel - all employees - ${todayIso()}`;

  window.addEventListener('afterprint', () => {
    printRoot.replaceChildren();
    document.title = originalTitle;
  }, { once: true });
  window.print();
}
