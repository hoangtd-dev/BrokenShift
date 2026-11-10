/** Roster tab rendering: entry form, employee list (master-detail), overview, summaries. */
import {
  WEEKDAYS,
  findKmRate,
  groupByEmployee,
  resolveCalculationDate,
  summarise,
  validateRow,
  weekdayBreakdown,
} from './calculator.js';
import { cheaperLabel, formatAUD, formatDate, formatKm, todayIso } from './format.js';

/**
 * Tiny DOM builder. Text is always set via textContent/createTextNode (no HTML injection).
 * @param {string} tag
 * @param {Object} [attrs] `class`, `on<event>` handlers, or plain attributes
 * @param {...(Node|string|null)} children
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) {
    if (child != null) node.append(child);
  }
  return node;
}

/**
 * Rate lookup for the configured calculation date.
 * @param {import('./calculator.js').Settings} settings
 */
export function rateContext(settings) {
  const dateIso = resolveCalculationDate(settings, todayIso());
  return { dateIso, lookup: findKmRate(settings.kmRatePeriods, dateIso) };
}

/** Text for a rate lookup, including a warning when the date is outside every period. */
export function rateNote(ctx) {
  const { lookup, dateIso } = ctx;
  if (lookup.status === 'none') return 'No km rate periods are set, so km are costed at $0.00.';
  const text = `${formatAUD(lookup.rate)} per km (calculation date ${formatDate(dateIso)})`;
  return lookup.status === 'outside' ? `${text} — date is outside the configured rate periods; nearest period used.` : text;
}

const OPTION_NAME = { A: 'Broken shift', B: 'Paid travel' };

/** Headline sentence for a comparison, e.g. "Paid travel is $4.20 lower". */
function verdictText(c, per) {
  if (c.cheaper === 'equal') return `Both options cost the same ${per}`;
  return `${OPTION_NAME[c.cheaper]} is ${formatAUD(c.difference)} lower ${per}`;
}

/** Cost table cell; the lower cost is highlighted, the higher one is muted. */
function costCell(c, option) {
  const state = c.cheaper === option ? 'best' : c.cheaper === 'equal' ? '' : 'worse';
  return el('td', { class: `num cost ${state}` }, formatAUD(option === 'A' ? c.costA : c.costB), c.cheaper === option ? el('span', { class: 'tick', 'aria-label': 'lower cost', title: 'Lower cost' }, '✓') : null);
}

/** Cell naming the cheaper option as a chip. */
function cheaperChip(c) {
  return el('td', {}, c.cheaper === 'equal' ? el('span', { class: 'chip' }, 'Equal') : el('span', { class: `chip chip-best` }, `${cheaperLabel(c.cheaper)} lower`));
}

/** Big side-by-side numbers with the lower cost highlighted. */
function kpiPair(title, c, per) {
  const card = (option) => {
    const best = c.cheaper === option;
    return el(
      'div',
      { class: `kpi ${best ? 'best' : c.cheaper === 'equal' ? '' : 'worse'}` },
      el('span', { class: 'kpi-label' }, `${option}: ${OPTION_NAME[option]}`),
      el('span', { class: 'kpi-value' }, formatAUD(option === 'A' ? c.costA : c.costB)),
      best ? el('span', { class: 'kpi-flag' }, '✓ Lower cost') : null,
    );
  };
  return el(
    'div',
    { class: 'kpi-block' },
    el('h3', {}, title),
    el('div', { class: 'kpi-pair' }, card('A'), card('B')),
    el('p', { class: `verdict ${c.cheaper === 'equal' ? '' : 'has-best'}` }, verdictText(c, per)),
  );
}

const head = (labels, numFrom = 1) => el('thead', {}, el('tr', {}, ...labels.map((h, i) => el('th', { scope: 'col', class: i >= numFrom ? 'num' : '' }, h))));
const td = (content, cls) => el('td', { class: cls }, content);

/**
 * Mount the roster view.
 * @param {HTMLElement} root
 * @param {ReturnType<import('./state.js').createStore>} store
 * @param {{onExportEmployee: (name: string) => void, onExportAll: () => void}} handlers
 */
export function mountRoster(root, store, handlers) {
  let editingId = null;
  let selectedKey = ''; // '' = overview, otherwise lower-cased employee name
  let search = '';

  // ---- Entry form (rendered once; keeps focus while the lists re-render) ----
  const nameInput = el('input', { id: 'f-name', type: 'text', list: 'employee-names', autocomplete: 'off', required: true });
  const nameList = el('datalist', { id: 'employee-names' });
  const daySelect = el('select', { id: 'f-day' }, ...WEEKDAYS.map((d, i) => el('option', { value: i }, d)));
  const kmInput = el('input', { id: 'f-km', type: 'number', min: '0', step: '0.1', inputmode: 'decimal', required: true });
  const breaksSelect = el('select', { id: 'f-breaks' }, el('option', { value: 1 }, '1 unpaid break'), el('option', { value: 2 }, '2 unpaid breaks'));
  const errorBox = el('div', { class: 'errors', role: 'alert', 'aria-live': 'polite' });
  const submitBtn = el('button', { type: 'submit', class: 'primary' }, 'Add row');
  const cancelBtn = el('button', { type: 'button', class: 'hidden', onclick: () => resetForm() }, 'Cancel');
  const formTitle = el('h2', { id: 'form-title' }, 'Add a pair of shifts');

  const field = (label, input, id) => el('div', { class: 'field' }, el('label', { for: id }, label), input);

  const form = el(
    'form',
    { class: 'card entry-form', novalidate: true, 'aria-labelledby': 'form-title' },
    formTitle,
    el(
      'div',
      { class: 'form-grid form-grid-inline' },
      field('Employee name', nameInput, 'f-name'),
      field('Day', daySelect, 'f-day'),
      field('Distance (km)', kmInput, 'f-km'),
      field('Unpaid breaks', breaksSelect, 'f-breaks'),
      el('div', { class: 'form-actions' }, submitBtn, cancelBtn),
    ),
    errorBox,
  );

  function resetForm() {
    editingId = null;
    form.reset();
    daySelect.value = '0';
    breaksSelect.value = '1';
    errorBox.textContent = '';
    submitBtn.textContent = 'Add row';
    formTitle.textContent = 'Add a pair of shifts';
    cancelBtn.classList.add('hidden');
    form.classList.remove('editing');
  }

  function startEdit(row) {
    editingId = row.id;
    nameInput.value = row.employee;
    daySelect.value = String(row.day);
    kmInput.value = row.km.toFixed(1);
    breaksSelect.value = String(row.breaks);
    errorBox.textContent = '';
    submitBtn.textContent = 'Save changes';
    formTitle.textContent = `Edit row — ${row.employee}, ${WEEKDAYS[row.day]}`;
    cancelBtn.classList.remove('hidden');
    form.classList.add('editing');
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nameInput.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const km = kmInput.value.trim() === '' ? NaN : Math.round(Number(kmInput.value) * 10) / 10;
    const data = {
      employee: nameInput.value.trim(),
      day: Number(daySelect.value),
      km,
      breaks: Number(breaksSelect.value),
    };
    const errors = validateRow(data);
    errorBox.replaceChildren(...errors.map((e) => el('p', {}, e)));
    if (errors.length) {
      (errors[0].startsWith('Employee') ? nameInput : kmInput).focus();
      return;
    }
    const wasEditing = Boolean(editingId);
    if (editingId) store.updateRow(editingId, data);
    else store.addRow(data);
    selectedKey = data.employee.toLowerCase();
    const keepName = data.employee;
    resetForm();
    if (!wasEditing) nameInput.value = keepName; // fast entry of the next row
    render(); // re-render so the newly selected employee is shown
    kmInput.focus();
  });

  // ---- Layout: sidebar + detail ----
  const searchInput = el('input', {
    id: 'emp-search',
    type: 'search',
    placeholder: 'Search employees…',
    'aria-label': 'Search employees',
    oninput: (e) => {
      search = e.target.value.trim().toLowerCase();
      render();
    },
  });
  const listBox = el('ul', { class: 'emp-list' });
  const sidebar = el('aside', { class: 'card sidebar', 'aria-label': 'Employees' }, searchInput, listBox);
  const detail = el('div', { class: 'detail' });
  const layout = el('div', { class: 'layout' }, sidebar, detail);
  root.replaceChildren(form, layout);

  function select(key) {
    selectedKey = key;
    render();
    detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---- Rendering ----
  function renderSidebar(groups, settings, rate) {
    const items = [];
    const overview = el(
      'li',
      {},
      el('button', { type: 'button', class: `emp-item ${selectedKey === '' ? 'active' : ''}`, 'aria-current': selectedKey === '' ? 'true' : null, onclick: () => select('') },
        el('span', { class: 'emp-name' }, 'Overview'),
        el('span', { class: 'emp-meta' }, `${groups.length} employee${groups.length === 1 ? '' : 's'}`)),
    );
    items.push(overview);

    const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));
    for (const g of sorted) {
      if (search && !g.name.toLowerCase().includes(search)) continue;
      const key = g.name.toLowerCase();
      const s = summarise(g.rows, settings, rate);
      const w = s.weekly;
      items.push(
        el(
          'li',
          {},
          el('button', { type: 'button', class: `emp-item ${selectedKey === key ? 'active' : ''}`, 'aria-current': selectedKey === key ? 'true' : null, onclick: () => select(key) },
            el('span', { class: 'emp-name' }, g.name),
            el('span', { class: 'emp-meta' }, `${g.rows.length} pair${g.rows.length === 1 ? '' : 's'}`),
            w.cheaper === 'equal'
              ? el('span', { class: 'chip' }, 'Equal')
              : el('span', { class: 'chip chip-best' }, `${w.cheaper}: ${cheaperLabel(w.cheaper)} −${formatAUD(w.difference)}`)),
        ),
      );
    }
    if (items.length === 1 && search) items.push(el('li', { class: 'empty-small' }, 'No match.'));
    listBox.replaceChildren(...items);
  }

  function renderOverview(groups, rows, settings, rate) {
    const all = summarise(rows, settings, rate);
    const sorted = [...groups].sort((a, b) => a.name.localeCompare(b.name));

    const empBody = el('tbody');
    for (const g of sorted) {
      const w = summarise(g.rows, settings, rate).weekly;
      empBody.append(
        el('tr', {},
          el('th', { scope: 'row' }, el('button', { type: 'button', class: 'link', onclick: () => select(g.name.toLowerCase()) }, g.name)),
          td(String(g.rows.length), 'num'),
          costCell(w, 'A'),
          costCell(w, 'B'),
          td(w.difference ? formatAUD(w.difference) : '—', 'num'),
          cheaperChip(w),
        ),
      );
    }

    const breakdown = weekdayBreakdown(rows, settings, rate);

    return [
      el('div', { class: 'section-head' },
        el('h2', {}, 'Whole roster'),
        el('button', { type: 'button', onclick: handlers.onExportAll }, 'Export all employees (PDF)')),
      el('section', { class: 'card hero' },
        el('div', { class: 'kpi-row' },
          kpiPair('Weekly total', all.weekly, 'per week'),
          kpiPair(`Monthly estimate (× ${settings.weeksPerMonth})`, all.monthly, 'per month'))),
      el('section', { class: 'card' },
        el('h3', { class: 'card-title' }, 'By employee (weekly)'),
        el('div', { class: 'table-wrap' },
          el('table', {}, head(['Employee', 'Pairs', 'A: Broken shift', 'B: Paid travel', 'Difference', 'Lower cost'], 1), empBody))),
      el('section', { class: 'card' },
        el('h3', { class: 'card-title' }, 'By weekday'),
        el('div', { class: 'table-wrap' },
          el('table', {}, head(['Day', 'Pairs', 'A: Broken shift', 'B: Paid travel', 'Difference', 'Lower cost'], 1),
            el('tbody', {}, ...breakdown.map((d) => d.count
              ? el('tr', {}, el('th', { scope: 'row' }, d.day), td(String(d.count), 'num'), costCell(d.comparison, 'A'), costCell(d.comparison, 'B'), td(d.comparison.difference ? formatAUD(d.comparison.difference) : '—', 'num'), cheaperChip(d.comparison))
              : el('tr', { class: 'dim' }, el('th', { scope: 'row' }, d.day), td('0', 'num'), td('—', 'num'), td('—', 'num'), td('—', 'num'), td(''))))))),
    ];
  }

  function renderEmployee(group, settings, rate) {
    const s = summarise(group.rows, settings, rate);
    const tbody = el('tbody');
    for (const { row, result } of s.lines) {
      const label = `${group.name} ${WEEKDAYS[row.day]}`;
      tbody.append(
        el('tr', {},
          el('th', { scope: 'row' }, WEEKDAYS[row.day]),
          td(formatKm(row.km), 'num'),
          td(String(row.breaks), 'num'),
          costCell(result, 'A'),
          costCell(result, 'B'),
          td(result.difference ? formatAUD(result.difference) : '—', 'num'),
          cheaperChip(result),
          td(el('div', { class: 'row-actions' },
            el('button', { type: 'button', class: 'small', 'aria-label': `Edit ${label}`, onclick: () => startEdit(row) }, 'Edit'),
            el('button', { type: 'button', class: 'small', 'aria-label': `Duplicate ${label}`, onclick: () => store.duplicateRow(row.id) }, 'Duplicate'),
            el('button', { type: 'button', class: 'small danger', 'aria-label': `Delete ${label}`, onclick: () => {
              if (!confirm(`Delete this row for ${group.name}?`)) return;
              if (editingId === row.id) resetForm();
              store.deleteRow(row.id);
            } }, 'Delete'))),
        ),
      );
    }
    return [
      el('div', { class: 'section-head' },
        el('h2', {}, group.name),
        el('div', { class: 'head-actions' },
          el('button', { type: 'button', onclick: () => handlers.onExportEmployee(group.name), 'aria-label': `Export PDF for ${group.name}` }, 'Export PDF'),
          el('button', { type: 'button', class: 'danger', 'aria-label': `Delete all data for ${group.name}`, onclick: () => {
            const n = group.rows.length;
            if (!confirm(`Delete ${group.name} and all ${n} row${n === 1 ? '' : 's'}? This cannot be undone.`)) return;
            if (editingId && group.rows.some((r) => r.id === editingId)) resetForm();
            selectedKey = '';
            store.deleteEmployee(group.name);
          } }, 'Delete employee'))),
      el('section', { class: 'card hero' },
        el('div', { class: 'kpi-row' },
          kpiPair('Per week', s.weekly, 'per week'),
          kpiPair(`Monthly estimate (× ${settings.weeksPerMonth})`, s.monthly, 'per month'))),
      el('section', { class: 'card' },
        el('h3', { class: 'card-title' }, 'Shift pairs'),
        el('div', { class: 'table-wrap' },
          el('table', {}, head(['Day', 'km', 'Breaks', 'A: Broken shift', 'B: Paid travel', 'Difference', 'Lower cost', ''], 1), tbody))),
    ];
  }

  function render() {
    const { settings, rows } = store.getState();
    const ctx = rateContext(settings);
    const rate = ctx.lookup.rate;

    nameList.replaceChildren(...store.employeeNames().map((n) => el('option', { value: n })));
    if (!nameList.isConnected) root.append(nameList);

    const groups = groupByEmployee(rows);
    if (selectedKey && !groups.some((g) => g.name.toLowerCase() === selectedKey)) selectedKey = '';

    const rateBar = el('p', { class: 'rate-note' }, el('strong', {}, 'Km rate applied: '), rateNote(ctx));

    if (!rows.length) {
      sidebar.classList.add('hidden');
      layout.classList.add('single');
      detail.replaceChildren(rateBar, el('p', { class: 'empty' }, 'No rows yet. Add a pair of shifts above to see the comparison.'));
      return;
    }
    sidebar.classList.remove('hidden');
    layout.classList.remove('single');

    renderSidebar(groups, settings, rate);
    const group = groups.find((g) => g.name.toLowerCase() === selectedKey);
    detail.replaceChildren(rateBar, ...(group ? renderEmployee(group, settings, rate) : renderOverview(groups, rows, settings, rate)));
  }

  store.subscribe(render);
  render();
}
