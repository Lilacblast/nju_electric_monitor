# Final review fix report

Base SHA: `134bb3c`

## RED

Added regression coverage for all four review findings, then ran:

```text
node --test tests/dashboard-core.test.mjs
```

The new tests failed for the expected missing behaviors: stale refresh state stayed `normal`, the failure banner had no timestamp, the update lacked the year/machine timestamp, and the chart UI did not expose a seconds-precise formatter.

## GREEN

Implemented the smallest production changes in `index.html`:

- failed refreshes re-derive the preserved records against the current clock, re-render freshness/window/prediction state, and leave chart instances untouched;
- refresh errors include the failed Beijing time;
- chart tooltip titles use a dedicated seconds-precise Beijing formatter;
- the main update time includes the year and writes an ISO `dateTime`.

Verification:

```text
node --test tests/dashboard-core.test.mjs
29 passed, 0 failed
git diff --check
```

## Self-review

- Only `index.html` and `tests/dashboard-core.test.mjs` are changed by this fix.
- No crawler, workflow, data, or documentation files were touched.
- The refresh failure path does not call `updateCharts`, destroy charts, or replace the preserved records.
- The new tests distinguish chart samples that differ only by seconds and advance the fake clock across the freshness threshold.

Commit SHA: the single commit created from this report (`fix: keep stale-state timing honest after refresh failures`).

## Final review fix round 2

### RED

Added a regression test with two preserved records and `Chart: null`. The test captured the chart fallback surface before a failed refresh and asserted that both canvas visibility and fallback text remained unchanged afterward. It failed as expected: the failure-path `renderDashboard` changed `图表组件加载失败`/hidden canvases to the normal insufficient-data surface.

### GREEN

Added the minimal `preserveChartSurface` render option. The refresh failure path uses it while still re-rendering all non-chart stale-state content; existing Chart instances and the Chart.js-unavailable fallback surface are left untouched.

Verification:

```text
node --test tests/dashboard-core.test.mjs --test-name-pattern="chart fallback surface"
30 passed, 0 failed
node --test tests/dashboard-core.test.mjs
30 passed, 0 failed
git diff --check
```

Self-review: only `index.html`, `tests/dashboard-core.test.mjs`, and this report changed; no crawler, workflow, data, or unrelated documentation files were touched. Final fix SHA: appended in the commit carrying this round (`fix: preserve chart surfaces across refresh failures`).
