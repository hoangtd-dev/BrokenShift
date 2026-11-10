# Broken Shift vs Paid Travel Calculator

A single-page tool for comparing two ways of handling back-to-back shifts under the SCHADS Award:

- **A – Broken shift:** pay the broken shift allowance (1 or 2 unpaid breaks).
- **B – Paid travel:** pay a flat travel-time amount plus kilometres × the km rate.

It shows the numbers only; it makes no recommendation. Plain HTML, CSS and ES modules. No framework, no build step.

## Run

ES modules don't load from `file://`, so serve the folder:

```sh
cd calculateBrokenShift
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works (`npx serve`, VS Code Live Server, …).

Sanity checks for the calculator: open `http://localhost:8000/tests.html`.

## Using it

- **Roster tab:** add one row per pair of shifts (employee, weekday, km, unpaid breaks). Pick an employee in the left list (searchable) or "Overview" for the whole roster. The lower cost is highlighted green. Edit, duplicate and delete are on each row.
- **Each row is one pair of shifts per week**, so employee and roster totals are weekly figures. Monthly = weekly × weeks-per-month factor.
- **Settings tab:** allowances, flat travel amount, km-rate periods, calculation date (blank = today), weeks per month. Saved in the browser's localStorage. "Reset to defaults" restores the values below.
- **PDF:** "Export PDF" (per employee) or "Export all employees" opens the print dialog; choose *Save as PDF*. One A4 page per employee.

## Changing the defaults

Edit `DEFAULT_SETTINGS` in [js/state.js](js/state.js):

| Setting | Default |
|---|---|
| Allowance, 1 unpaid break | $21.81 |
| Allowance, 2 unpaid breaks | $28.87 |
| Paid travel amount per trip | $10.00 |
| km rate | $1.05 from 2026-09-01 to 2027-02-28, then $1.01 from 2027-03-01 |
| Weeks per month | 4.33 |

Defaults only apply when nothing is saved or after "Reset to defaults". To pick up new defaults on a browser that already has saved settings, press **Reset to defaults** in the Settings tab.

## Structure

```
index.html
css/styles.css, css/print.css
js/main.js        bootstrap and tabs
js/state.js       data store + localStorage, DEFAULT_SETTINGS
js/calculator.js  pure functions (JSDoc), no DOM
js/format.js      AUD / date formatting
js/ui.js          roster rendering
js/settings.js    settings panel
js/pdf.js         print/PDF export
tests.html + js/tests.js   calculator checks
```

## Notes

- Money is rounded to cents per row, then summed.
- If the calculation date falls outside every km-rate period, the nearest earlier period (or the earliest) is used and a warning is shown.
- Data stays in your browser; nothing is sent anywhere.
