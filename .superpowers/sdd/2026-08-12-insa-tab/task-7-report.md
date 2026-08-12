# Task 7: INSA day-detail hover tooltip report

## TDD evidence

### RED

Command:

```text
npm test -- --watchAll=false src/components/insa/InsaCalendar.test.tsx src/components/insa/InsaPage.test.tsx
```

Result: exit 1. The new focus test failed because `onRequestDayDetails` had zero calls. The new hover test failed because no element with `role="tooltip"` existed. This confirmed the intended missing behavior before production changes.

### GREEN

The same focused command passed after implementation: 2 suites, 14 tests, 0 failures.

## Files changed

- `src/components/insa/InsaPage.tsx`
- `src/components/insa/InsaCalendar.tsx`
- `src/components/insa/InsaCalendarCell.tsx`
- `src/components/insa/Insa.css`
- `src/components/insa/InsaCalendar.test.tsx`
- `src/components/insa/InsaPage.test.tsx`
- `.superpowers/sdd/2026-08-12-insa-tab/task-7-report.md`

No Jade production file changed.

## Design notes

- `InsaPage` now owns a stable `requestDayDetails(ymd)` callback. A ref mirrors the detail-state cache so successful responses are reused without making the callback depend on each state update. The existing controller map still prevents duplicate in-flight requests; error states remain retryable.
- Click selection remains separate: it sets `selectedYmd` for the lower panel, then requests details. Hover and focus request details but do not select a day.
- The calendar passes the callback and per-day detail state into each cell. Only dates with team schedule counts create a tooltip.
- The tooltip opens on cell hover and date-button focus, closes on mouse leave and blur, and represents loading, error, empty, and loaded detail states. It uses the Jade position calculation: 8px horizontal clamp, 60% viewport above/below decision, 6px vertical gap, and fixed positioning.
- Scoped INSA styles reuse Jade’s 260px dark tooltip, radius, shadow, header, and disabled pointer-event tokens.

## Verification

| Check | Exact result |
| --- | --- |
| Focused tests | `npm test -- --watchAll=false src/components/insa/InsaCalendar.test.tsx src/components/insa/InsaPage.test.tsx` — exit 0; 2 suites passed, 14 tests passed. |
| Full tests | `npm test -- --watchAll=false` — exit 0; 9 suites passed, 51 tests passed. |
| TypeScript | `npx tsc --noEmit` — exit 0; no output. |
| Production build | `npm run build` — exit 0; CRA compiled successfully. |
| Whitespace | `git diff --check` — exit 0; no whitespace errors. Git emitted existing CRLF conversion warnings only. |
| Scope check | `git diff --name-only` listed only the six INSA task files before this report; no Jade production file was changed. |

## Self-review

- Confirmed hover calls the shared request path while leaving `selectedYmd` unset, and a later click uses the successful cached result.
- Confirmed focus invokes the same request path and blur removes the tooltip.
- Confirmed cache, in-flight suppression, error retry, abort behavior, and lower detail panel behavior remain covered by focused INSA tests.
- Confirmed tooltip pointer events are disabled so it cannot interrupt mouse-leave behavior.
- Confirmed the date-only tooltip coordinate math matches Jade’s clamp and above/below thresholds.

## Concerns

None.
