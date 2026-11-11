/** Formatting helpers shared by the screen UI and the PDF/print view. */

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** @param {number} n @returns {string} e.g. "$21.81" */
export function formatAUD(n) {
  return aud.format(n);
}

/** @param {number} n @returns {string} km with one decimal */
export function formatKm(n) {
  return n.toFixed(1);
}

/** @param {string} iso YYYY-MM-DD @returns {string} e.g. "10 Nov 2026" */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** @returns {string} today's local date as YYYY-MM-DD */
export function todayIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Plain-language description of a comparison.
 * @param {{costlier: string, difference: number}} c
 * @returns {string}
 */
export function describeCostlier(c) {
  if (c.costlier === 'equal') return 'Same cost';
  const name = c.costlier === 'A' ? 'Broken shift' : 'Paid travel';
  return `${name} costs ${formatAUD(c.difference)} more`;
}

/** @param {string} cheaper 'A'|'B'|'equal' @returns {string} */
export function cheaperLabel(cheaper) {
  return cheaper === 'A' ? 'Broken shift' : cheaper === 'B' ? 'Paid travel' : 'Equal';
}

/**
 * Signed percentage, e.g. "+12.3%" / "−35.2%"; "n/a" when not defined.
 * @param {number|null} pct
 * @returns {string}
 */
export function formatPct(pct) {
  if (pct == null) return 'n/a';
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return '0.0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(1)}%`;
}

/** Signed AUD amount, e.g. "+$1.20" / "−$3.40". */
export function formatSignedAUD(n) {
  if (n === 0) return formatAUD(0);
  return `${n > 0 ? '+' : '−'}${formatAUD(Math.abs(n))}`;
}
