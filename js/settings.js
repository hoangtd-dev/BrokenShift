/** Settings tab: rates, km-rate periods, calculation date, weeks-per-month factor. */
import { validateSettings } from './calculator.js';
import { todayIso } from './format.js';
import { el, rateContext, rateNote } from './ui.js';

/**
 * Mount the settings panel.
 * @param {HTMLElement} root
 * @param {ReturnType<import('./state.js').createStore>} store
 */
export function mountSettings(root, store) {
  const status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const errorBox = el('div', { class: 'errors', role: 'alert', 'aria-live': 'polite' });
  const periodBody = el('tbody');
  const rateInfo = el('p', { class: 'rate-note' });

  const num = (id, label, step, min = '0') => {
    const input = el('input', { id, type: 'number', step, min, inputmode: 'decimal', required: true });
    return { input, field: el('div', { class: 'field' }, el('label', { for: id }, label), input) };
  };

  const a1 = num('s-a1', 'Broken shift allowance — 1 unpaid break ($)', '0.01');
  const a2 = num('s-a2', 'Broken shift allowance — 2 unpaid breaks ($)', '0.01');
  const travel = num('s-travel', 'Paid travel time amount per trip, flat ($) — 2 unpaid breaks = 2 trips', '0.01');
  const weeks = num('s-weeks', 'Weeks per month factor', '0.01', '0.01');
  const calcDate = el('input', { id: 's-date', type: 'date' });
  const useToday = el('button', { type: 'button', onclick: () => { calcDate.value = ''; } }, 'Use today');

  let periodCounter = 0;
  function addPeriodRow(p = { from: '', to: null, rate: 0 }) {
    const n = ++periodCounter;
    const from = el('input', { type: 'date', 'aria-label': 'Period start date', value: p.from, required: true });
    const to = el('input', { type: 'date', 'aria-label': 'Period end date (leave blank for open-ended)', value: p.to ?? '' });
    const rate = el('input', { type: 'number', step: '0.01', min: '0', inputmode: 'decimal', 'aria-label': 'Rate per km ($)', value: String(p.rate), required: true });
    const row = el(
      'tr',
      { 'data-period': n },
      el('td', {}, from),
      el('td', {}, to),
      el('td', {}, rate),
      el('td', {}, el('button', { type: 'button', class: 'small danger', onclick: () => row.remove() }, 'Remove')),
    );
    periodBody.append(row);
  }

  function fill(settings) {
    a1.input.value = settings.allowance1Break.toFixed(2);
    a2.input.value = settings.allowance2Breaks.toFixed(2);
    travel.input.value = settings.travelFlat.toFixed(2);
    weeks.input.value = String(settings.weeksPerMonth);
    calcDate.value = settings.calculationDate;
    periodBody.replaceChildren();
    settings.kmRatePeriods.forEach(addPeriodRow);
    rateInfo.replaceChildren(el('strong', {}, 'Rate currently applied: '), rateNote(rateContext(settings)));
  }

  function collect() {
    const kmRatePeriods = [...periodBody.querySelectorAll('tr')].map((tr) => {
      const [from, to, rate] = tr.querySelectorAll('input');
      return { from: from.value, to: to.value || null, rate: rate.value === '' ? NaN : Number(rate.value) };
    });
    const read = (i) => (i.value.trim() === '' ? NaN : Number(i.value));
    return {
      allowance1Break: read(a1.input),
      allowance2Breaks: read(a2.input),
      travelFlat: read(travel.input),
      weeksPerMonth: read(weeks.input),
      calculationDate: calcDate.value,
      kmRatePeriods,
    };
  }

  const form = el(
    'form',
    { class: 'card', novalidate: true, 'aria-labelledby': 'settings-title' },
    el('h2', { id: 'settings-title' }, 'Settings'),
    el('div', { class: 'form-grid' }, a1.field, a2.field, travel.field, weeks.field),
    el('fieldset', {}, el('legend', {}, 'Calculation date'),
      el('p', { class: 'hint' }, 'Decides which km rate period applies. Leave blank to use today.'),
      el('div', { class: 'inline' }, el('label', { for: 's-date', class: 'sr-only' }, 'Calculation date'), calcDate, useToday)),
    el('fieldset', {}, el('legend', {}, 'Vehicle rate per km — effective-date periods'),
      el('p', { class: 'hint' }, 'Leave the end date blank for an open-ended period. Periods must not overlap.'),
      el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...['From', 'To', 'Rate ($/km)', ''].map((h) => el('th', { scope: 'col' }, h)))), periodBody)),
      el('button', { type: 'button', onclick: () => addPeriodRow() }, 'Add period')),
    rateInfo,
    errorBox,
    el('div', { class: 'form-actions' },
      el('button', { type: 'submit', class: 'primary' }, 'Save settings'),
      el('button', { type: 'button', class: 'danger', onclick: () => {
        if (!confirm('Reset all settings to their defaults?')) return;
        store.resetSettings();
        errorBox.textContent = '';
        status.textContent = 'Settings reset to defaults.';
      } }, 'Reset to defaults'),
      status),
  );

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    status.textContent = '';
    const settings = collect();
    const errors = validateSettings(settings);
    errorBox.replaceChildren(...errors.map((e) => el('p', {}, e)));
    if (errors.length) return;
    settings.kmRatePeriods.sort((a, b) => a.from.localeCompare(b.from));
    store.saveSettings(settings);
    status.textContent = 'Settings saved.';
  });

  // ---- Backup / transfer ----
  const dataStatus = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const fileInput = el('input', { id: 's-import', type: 'file', accept: 'application/json,.json', class: 'sr-only', tabindex: '-1' });

  function downloadExport() {
    const data = store.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `broken-shift-data-${todayIso()}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
    dataStatus.textContent = `Exported ${data.rows.length} row${data.rows.length === 1 ? '' : 's'} and settings.`;
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const incoming = Array.isArray(payload?.rows) ? payload.rows.length : 0;
      if (!confirm(`Import ${incoming} row${incoming === 1 ? '' : 's'} and settings from "${file.name}"?\n\nThis replaces all data currently saved on this device.`)) return;
      const { rows, skipped } = store.importData(payload);
      dataStatus.textContent = `Imported ${rows} row${rows === 1 ? '' : 's'} and settings.${skipped ? ` ${skipped} invalid row${skipped === 1 ? '' : 's'} skipped.` : ''}`;
    } catch (err) {
      dataStatus.textContent = err instanceof SyntaxError ? 'Import failed: the file is not valid JSON.' : `Import failed: ${err.message}`;
    }
  });

  const dataCard = el('section', { class: 'card', 'aria-labelledby': 'data-title' },
    el('h2', { id: 'data-title' }, 'Backup & transfer'),
    el('p', { class: 'hint' }, 'Data is stored in this browser only. Export it to a file, then import that file on another device.'),
    el('div', { class: 'form-actions' },
      el('button', { type: 'button', class: 'primary', onclick: downloadExport }, 'Export data (JSON)'),
      el('button', { type: 'button', onclick: () => fileInput.click() }, 'Import data…'),
      fileInput,
      dataStatus));

  root.replaceChildren(form, dataCard);
  fill(store.getState().settings);

  // Re-fill whenever settings change (e.g. after reset), but not on row edits.
  let lastSettings = store.getState().settings;
  store.subscribe((state) => {
    if (state.settings !== lastSettings) {
      lastSettings = state.settings;
      fill(state.settings);
    }
  });
}
