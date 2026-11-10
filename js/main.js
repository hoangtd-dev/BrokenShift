/** Bootstrap: create the store, mount views, wire tabs. */
import { createStore } from './state.js';
import { mountRoster } from './ui.js';
import { mountSettings } from './settings.js';
import { exportPdf } from './pdf.js';

const store = createStore();

mountRoster(document.getElementById('panel-roster'), store, {
  onExportEmployee: (name) => exportPdf(store, [name]),
  onExportAll: () => exportPdf(store, null),
});
mountSettings(document.getElementById('panel-settings'), store);

// Tabs
const tabs = [...document.querySelectorAll('[role="tab"]')];

function selectTab(selected) {
  for (const tab of tabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
}

tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
});
