/** Sanity checks for calculator.js. Open tests.html through a local server. */
import {
  brokenShiftAllowance,
  compareCosts,
  findKmRate,
  groupByEmployee,
  monthlyEstimate,
  paidTravelCost,
  resolveCalculationDate,
  roundCents,
  summarise,
  validateRow,
  validateSettings,
  weekdayBreakdown,
} from './calculator.js';
import { DEFAULT_SETTINGS } from './state.js';

const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}
function eq(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

test('roundCents handles float noise', () => eq(roundCents(0.1 + 0.2), 0.3));
test('allowance: 1 break', () => eq(brokenShiftAllowance(settings, 1), 21.81));
test('allowance: 2 breaks', () => eq(brokenShiftAllowance(settings, 2), 28.87));
test('km rate: first period start', () => eq(findKmRate(settings.kmRatePeriods, '2026-09-01').rate, 1.05));
test('km rate: first period last day', () => eq(findKmRate(settings.kmRatePeriods, '2027-02-28').rate, 1.05));
test('km rate: second period start', () => eq(findKmRate(settings.kmRatePeriods, '2027-03-01').rate, 1.01));
test('km rate: far future uses open-ended period', () => eq(findKmRate(settings.kmRatePeriods, '2035-01-01').rate, 1.01));
test('km rate: before first period is flagged', () => {
  const r = findKmRate(settings.kmRatePeriods, '2025-01-01');
  eq([r.rate, r.status], [1.05, 'outside']);
});
test('km rate: no periods gives 0', () => eq(findKmRate([], '2026-11-10'), { rate: 0, period: null, status: 'none' }));
test('cost B: flat + km x rate', () => eq(paidTravelCost(settings, 10, 1.05), 20.5));
test('cost B: 0 km is just the flat amount', () => eq(paidTravelCost(settings, 0, 1.05), 10));
test('cost B: 2 trips doubles flat amount ($20, not $10)', () => eq(paidTravelCost(settings, 0, 1.05, 2), 20));
test('cost B: 2 trips = 2 x flat + km x rate (km not doubled)', () => eq(paidTravelCost(settings, 10, 1.05, 2), 30.5));
test('cost B: 12 km, 2 trips', () => eq(paidTravelCost(settings, 12, 1.05, 2), 32.6));
test('compare: A costlier', () => { const c = compareCosts(21.81, 20.5); eq([c.costlier, c.cheaper, c.difference, c.signed], ['A', 'B', 1.31, -1.31]); });
test('compare: pct is change from A to B', () => eq(Math.round(compareCosts(20, 15).pct), -25));
test('compare: pct null when A is 0', () => eq(compareCosts(0, 5).pct, null));
test('compare: B costlier', () => eq(compareCosts(21.81, 30).costlier, 'B'));
test('compare: equal', () => eq(compareCosts(10, 10).costlier, 'equal'));
test('monthly = weekly x factor', () => eq(monthlyEstimate(100, 50, 4.33).costA, 433));

const rows = [
  { id: '1', employee: 'Sam', day: 2, km: 10, breaks: 1 },
  { id: '2', employee: 'sam ', day: 0, km: 5, breaks: 2 },
  { id: '3', employee: 'Alex', day: 0, km: 0, breaks: 1 },
];
test('groupByEmployee merges names case-insensitively and sorts by day', () => {
  const g = groupByEmployee(rows);
  eq(g.map((x) => x.name), ['Sam', 'Alex']);
  eq(g[0].rows.map((r) => r.id), ['2', '1']);
});
test('summarise totals', () => {
  const s = summarise(rows.slice(0, 2), settings, 1.05);
  eq(s.weekly.costA, 50.68); // 21.81 + 28.87
  eq(s.weekly.costB, 45.75); // 20.5 (1 trip, 10 km) + 25.25 (2 trips, 5 km)
  eq(s.weekly.costlier, 'A');
  eq(s.weekly.difference, 4.93);
});
test('weekdayBreakdown covers 7 days', () => {
  const b = weekdayBreakdown(rows, settings, 1.05);
  eq(b.length, 7);
  eq(b[0].count, 2);
  eq(b[1].count, 0);
});
test('validateRow rejects blank name and negative km', () => {
  eq(validateRow({ employee: ' ', km: -1, breaks: 1 }).length, 2);
  eq(validateRow({ employee: 'A', km: 0, breaks: 2 }), []);
});
test('validateSettings accepts defaults', () => eq(validateSettings(settings), []));
test('validateSettings catches overlapping periods', () => {
  const bad = { ...settings, kmRatePeriods: [{ from: '2026-01-01', to: '2026-12-31', rate: 1 }, { from: '2026-06-01', to: null, rate: 1 }] };
  eq(validateSettings(bad).length, 1);
});
test('resolveCalculationDate falls back to today', () => {
  eq(resolveCalculationDate({ calculationDate: '' }, '2026-11-10'), '2026-11-10');
  eq(resolveCalculationDate({ calculationDate: '2027-03-01' }, '2026-11-10'), '2027-03-01');
});

const failed = results.filter((r) => !r.ok);
const list = document.getElementById('results');
document.getElementById('summary').textContent = failed.length ? `${failed.length} of ${results.length} failed` : `All ${results.length} checks passed`;
document.getElementById('summary').className = failed.length ? 'fail' : 'pass';
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.message}`}`;
  list.append(li);
}
