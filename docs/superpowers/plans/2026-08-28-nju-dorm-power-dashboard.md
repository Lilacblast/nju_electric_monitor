# NJU Dorm Power Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready, single-file GitHub Pages dashboard that reads the current dorm's static CSV and derives balance, consumption, recharge, alerts, forecasts, and responsive charts.

**Architecture:** `index.html` contains the selected B-direction markup, CSS, pure calculation core, rendering layer, fetch/refresh controller, and Chart.js integration. Pure functions are exposed as `globalThis.NJUPowerCore` and tested by a dependency-free Node test that extracts the marked inline script. The existing crawler and workflow remain untouched.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Chart.js UMD from a pinned CDN URL, Node.js built-in `node:test` and `vm`.

**Spec:** `docs/superpowers/specs/2026-08-28-nju-dorm-power-dashboard-design.md`

## Global Constraints

- Production entry is repository-root `index.html`; CSS and application JavaScript remain inline.
- Fetch only `data/electricity_data.csv?t=${Date.now()}` with `{ cache: "no-store" }`; never call NJU APIs.
- Do not modify `.github/workflows/auto_monitor_schedule.yml` or crawler source.
- Default visual system is selected direction B: warm light gray, near-white surfaces, ink text, restrained electricity green, thin rules, automatic dark mode.
- Support Android/mobile widths from 320 px, Windows desktop, 44 px touch targets, and no page-level horizontal overflow.
- Empty, one-record, partial-invalid, fetch-failure, stale-data, low-balance, and Chart.js-failure states must not blank the page.
- No credentials, Cookies, Sessions, Tokens, GitHub Secrets, names, student IDs, room numbers, or official NJU marks.
- Design preview HTML/PNG files are local decision artifacts and must not ship in the final repository state.

---

### Task 1: Pure data normalization core

**Files:**
- Create: `index.html`
- Create: `tests/dashboard-core.test.mjs`

**Interfaces:**
- Produces: `NJUPowerCore.parseCsv(text) -> Array<object>`
- Produces: `NJUPowerCore.normalizeRecords(rows) -> { records, skippedCount }`
- Produces: `NJUPowerCore.parseBeijingTime(value) -> number | NaN`

- [ ] **Step 1: Write failing parser and normalization tests**

Create a Node test that reads `index.html`, extracts `<script id="dashboard-core">`, evaluates it in `vm`, and asserts quoted CSV parsing, invalid-row skipping, Beijing interpretation, duplicate-last semantics, and ascending sort:

```js
test('normalizes, deduplicates, and sorts CSV records', () => {
  const csv = 'time,num,unit\n2026-08-28T18:00:00,98.2,度\nbad,abc,度\n2026-08-28T17:00:00,99.0,度\n2026-08-28T18:00:00,97.8,度\n';
  const { records, skippedCount } = core.normalizeRecords(core.parseCsv(csv));
  assert.equal(skippedCount, 1);
  assert.deepEqual(records.map(r => r.balance), [99, 97.8]);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: FAIL because `index.html` or `NJUPowerCore` is missing.

- [ ] **Step 3: Add the smallest complete inline core**

Create the HTML shell and marked script. Implement a state-machine CSV parser, a timezone-safe parser that appends `+08:00` to naive ISO values, finite numeric validation, duplicate-last map, and ascending sort. Export with:

```js
globalThis.NJUPowerCore = Object.freeze({
  parseCsv,
  parseBeijingTime,
  normalizeRecords
});
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: all parser/normalization tests pass.

- [ ] **Step 5: Commit the core**

```bash
git add index.html tests/dashboard-core.test.mjs
git commit -m "feat: add dashboard data normalization core"
```

### Task 2: Interval, recharge, statistics, and prediction core

**Files:**
- Modify: `index.html`
- Modify: `tests/dashboard-core.test.mjs`

**Interfaces:**
- Consumes: normalized `{ timeMs, time, balance, unit }` records.
- Produces: `deriveIntervals(records) -> Array<Interval>` where each interval includes `hours`, `consumption`, `averagePowerKW`, and optional recharge event.
- Produces: `calculateStats(records, intervals, nowMs) -> Stats`.
- Produces: `getFreshness(latestMs, nowMs) -> "normal" | "warning" | "danger"`.
- Produces: `getBalanceLevel(balance) -> "normal" | "notice" | "warning" | "critical"`.

- [ ] **Step 1: Add failing derivation tests**

Cover normal decreases, exact-ten recharge, `20 -> 68.7`, `32.4 -> 61.9`, a low-confidence increase, a 1.1-hour interval's average power, and the rule that high-confidence recharge-hour consumption is counted.

```js
assert.deepEqual(pick(core.deriveIntervals(records20to687)[0]), {
  consumption: 1.3,
  estimatedRecharge: 50,
  confidence: 'high'
});
```

- [ ] **Step 2: Verify the new tests fail**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: FAIL because interval/stat functions are absent.

- [ ] **Step 3: Implement interval derivation**

Implement the exact recharge model from the spec. For low-confidence increases set `consumption` and `averagePowerKW` to `null`, preserving the event for display but excluding it from statistics.

- [ ] **Step 4: Add failing window and prediction tests**

Assert 24-hour and Beijing-today totals by interval end time, seven-day/all-history prediction fallback, and `remainingDays === null` below 12 eligible hours.

- [ ] **Step 5: Implement statistics and state functions**

Calculate recent interval, 24h total, today total, seven-day rate, projected days, freshness thresholds, balance thresholds, and recharge list. Use numeric rounding only at display time.

- [ ] **Step 6: Run all tests and commit**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: all tests pass.

```bash
git add index.html tests/dashboard-core.test.mjs
git commit -m "feat: derive dorm consumption and recharge statistics"
```

### Task 3: Selected B layout and complete state rendering

**Files:**
- Modify: `index.html`
- Modify: `tests/dashboard-core.test.mjs`

**Interfaces:**
- Consumes: `calculateStats()` output.
- Produces: semantic elements with stable IDs for balance, update time, freshness, four statistics, warnings, comparisons, recharge events, chart canvases, and empty/error states.

- [ ] **Step 1: Add static-contract tests**

Assert `index.html` contains viewport metadata, the required section IDs, four range buttons with `aria-pressed`, chart `aria-label`s, `prefers-color-scheme: dark`, and no prohibited credential keys.

- [ ] **Step 2: Verify static-contract tests fail**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: FAIL on missing production sections/styles.

- [ ] **Step 3: Implement semantic markup and B-direction CSS**

Build the top bar, balance summary, two-by-two/four-column statistic rule grid, trend section, interval section, recharge list, alert, comparisons, and footer. Use CSS variables for light and dark themes. Preserve at least 44 px buttons and `min-width: 0` on grid children.

- [ ] **Step 4: Implement formatting and render functions**

Add `formatBalance`, `formatKWh`, `formatDateTime`, `formatDuration`, `formatPower`, `renderDashboard`, `renderNoData`, and `renderError`. One record renders the real balance and `—` for derived values. All text insertion uses `textContent`.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: all tests pass.

```bash
git add index.html tests/dashboard-core.test.mjs
git commit -m "feat: build minimal responsive power dashboard layout"
```

### Task 4: Chart.js, refresh controller, and range interaction

**Files:**
- Modify: `index.html`
- Modify: `tests/dashboard-core.test.mjs`

**Interfaces:**
- Consumes: normalized records, derived intervals, selected range.
- Produces: `loadData()`, `refreshDashboard()`, `setRange(range)`, `updateCharts(records, intervals)`.

- [ ] **Step 1: Add failing controller contract tests**

Assert cache-busted CSV URL, `cache: 'no-store'`, `300000` millisecond refresh, four supported ranges, and preserved content on refresh error.

- [ ] **Step 2: Verify controller tests fail**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: FAIL on absent fetch/refresh controller.

- [ ] **Step 3: Pin Chart.js and implement chart lifecycle**

Use an official/npm-verified fixed Chart.js UMD URL. Create one line chart and one bar chart, then mutate dataset/labels and call `update()` on refresh. Use a second line dataset for recharge points. Disable strong bezier overshoot, keep `beginAtZero: false` on balance, and show exact Beijing time in tooltips.

- [ ] **Step 4: Implement load, refresh, failure preservation, and controls**

Fetch CSV immediately and every five minutes. Update `aria-pressed` when the range changes. If Chart.js is unavailable, replace chart surfaces with explanatory text while leaving all non-chart data visible.

- [ ] **Step 5: Run tests and commit**

Run: `node --test tests/dashboard-core.test.mjs`  
Expected: all tests pass.

```bash
git add index.html tests/dashboard-core.test.mjs
git commit -m "feat: add dashboard charts and automatic refresh"
```

### Task 5: Browser QA, privacy scan, and artifact cleanup

**Files:**
- Modify: `index.html` only for verified defects.
- Delete before final commit: `design-demos/`
- Retain locally or repository documentation: `direction-approved.md`, `brand-spec.md`, `docs/superpowers/**`.

**Interfaces:**
- Consumes: completed static page and real `data/electricity_data.csv`.
- Produces: verified GitHub Pages-ready repository root.

- [ ] **Step 1: Serve the repository locally**

Run: `python -m http.server 8765 --bind 127.0.0.1`  
Open: `http://127.0.0.1:8765/`.

- [ ] **Step 2: Verify the real one-record state**

Confirm `99.51 度`, `2026-08-28 17:15`, data-stale status relative to current time, no fabricated trend, and `—`/data-insufficient derived values.

- [ ] **Step 3: Verify responsive and dark modes**

Check 1440×900, 375×812, and 320×568. At each viewport assert `document.documentElement.scrollWidth <= window.innerWidth`. Emulate dark mode and confirm readable surfaces and green/yellow/red state text.

- [ ] **Step 4: Verify synthetic multi-record behavior**

Serve a temporary CSV response containing normal decreases, irregular intervals, `20 -> 68.7`, and low-confidence increase. Confirm the two charts, range buttons, tooltip data, recharge list, and statistics match core-test expectations. Do not write synthetic data into `data/`.

- [ ] **Step 5: Run final automated checks**

```bash
node --test tests/dashboard-core.test.mjs
git diff --check
rg -n "NJU_USERNAME|NJU_PASSWORD|Cookie|Session|OAuth|Token|SECRET|学号|姓名" index.html
```

Expected: tests pass, diff check is clean, and the privacy scan returns no matches.

- [ ] **Step 6: Remove local design previews and commit final QA fixes**

Delete `design-demos/` after confirming the selected direction is represented in production. Keep `direction-approved.md` as the decision record.

```bash
git add -A index.html tests direction-approved.md brand-spec.md data design-demos
git commit -m "chore: finalize GitHub Pages dashboard"
```

### Task 6: Repository and Pages handoff

**Files:**
- Modify: `README.md` only if the existing deployment instructions lack the GitHub Pages URL and privacy boundary.

**Interfaces:**
- Produces: a clean branch ready to push to `master` and enable Pages from `/(root)`.

- [ ] **Step 1: Verify workflow isolation**

Run: `git diff origin/master -- .github/workflows/auto_monitor_schedule.yml src/`  
Expected: no output.

- [ ] **Step 2: Verify final repository state and history**

Run: `git status --short --branch` and `git log --oneline -8`.  
Expected: no unintended files; commits describe spec, core, UI, charts, and final QA.

- [ ] **Step 3: Push only after all checks pass**

Run: `git push origin master`  
Expected: successful update. If GitHub Pages is not already configured, report the one required manual setting: `Settings → Pages → Deploy from a branch → master → /(root)`.
