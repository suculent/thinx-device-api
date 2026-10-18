# Phase 47: Build Log Search & Status Colours - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 47-build-log-search-status-colours
**Areas discussed:** Search behaviour, Highlighting & big logs, Search bar layout, No-id rows & dashboard

---

## Search behaviour

| Option | Description | Selected |
|--------|-------------|----------|
| Live, debounced | ~200 ms after typing stops, like Ctrl+F | ✓ |
| On Enter only | Cheapest on huge logs | |
| You decide | Planner picks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Plain text, case-insensitive | Escaped term, no regex | ✓ |
| Case-insensitive + Aa toggle | Optional exact case | |
| Regex supported | Error states, ReDoS concern | |

| Option | Description | Selected |
|--------|-------------|----------|
| Enter next, Shift+Enter prev | Like browser find; Esc closes the modal | ✓ |
| Buttons only | Enter does nothing | |

| Option | Description | Selected |
|--------|-------------|----------|
| Wrap around | Last → first, first → last | ✓ |
| Stop, disable button | Buttons disabled at the ends | |

**User's choice:** all recommended options.

---

## Highlighting & big logs

| Option | Description | Selected |
|--------|-------------|----------|
| Text segments + `<mark>` | v-for interpolation, inert, testable | ✓ |
| CSS Custom Highlight API | No DOM change; support/testability issues | |
| You decide | Researcher measures | |

| Option | Description | Selected |
|--------|-------------|----------|
| Cap at 1000, show "1000+" | Bounded DOM | ✓ |
| No cap | Could create ~100k nodes | |
| You decide | Planner measures | |

| Option | Description | Selected |
|--------|-------------|----------|
| 1 character | Like browser find | |
| 2 characters | Skips one-letter noise | |

**User's choice (minimum length):** 3 characters (free text).

| Option | Description | Selected |
|--------|-------------|----------|
| Distinct colour for current match | Soft for all, strong for current | ✓ |
| Outline only | Same fill, outline on current | |

---

## Search bar layout

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky bar above the log | Field, count, < > between header and `<pre>` | ✓ |
| In the modal header | Crowds the build id title | |

| Option | Description | Selected |
|--------|-------------|----------|
| "3 / 17", "No matches" | Position + total, aria-live | ✓ |
| "17 matches" only | Total only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Only when there is log text | Hidden on loading/error/empty | ✓ |
| Always, disabled | No layout jump | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reset on each open | Retry keeps the term | ✓ |
| Keep last term | Carries over between builds | |

---

## No-id rows & dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Eye "View" next to Download | Same button as History/Device, `—` without id | ✓ |
| Separate Log column | Fifth column in an md=6 card | |
| Row click opens log | Third interaction model | |

| Option | Description | Selected |
|--------|-------------|----------|
| Plain non-clickable item | No button/handler; also fixes 35 IN-06 markup and `UNKNOWN` → `—` | ✓ |
| Disabled button | Stays in tab order | |

| Option | Description | Selected |
|--------|-------------|----------|
| build_id only, no request if empty | Drop `build.id` fallback; reset `loading` on hide | ✓ |
| build_id only, show error | Explanatory error for empty id | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fix the spec now (36 IN-03) | Verified when Phase 48 greens the suite | ✓ |
| Defer to Phase 48 | Recorded reason: suite red until CI-07 | |

---

## Claude's Discretion

- Highlight colour tokens, debounce value (around 200 ms), placeholder copy.
- Where the segment helper lives (`utils/buildLog.js` suggested) and which unit-test file holds the tests.
- 36 IN-01 and WR-01 are fixed as the review proposes (not asked; there is a single obvious path).
- Small 36 UI-review nits in the touched files (`p-0`, `text-nowrap`, Retry button variant).

## Deferred Ideas

- AR-36-01 payload size (stays deferred).
- Regex or case-sensitive toggle (not taken).
