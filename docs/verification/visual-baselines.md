# Visual baselines — changing the UI without breaking the guard

The suite in `tests/e2e/visual.spec.ts` captures 107 full-page and element
screenshots (`tests/e2e/visual.spec.ts-snapshots/*.png`) and compares them on
every run. It is the only automated guard against a layout shift, a lost
control or a broken theme that unit tests cannot see.

Status: 107 baselines green on 2026-11-13 (release `335093b`).

## The rule

**A UI change regenerates the affected baselines, and the diff has to be
proved limited to the thing that changed.** A regenerated baseline that hides an
unintended layout shift is worse than a failing test.

## Running the suite

```bash
# Ports 3000/5173/4100 must be free; --workers=1 is mandatory on this host.
fuser -k 3000/tcp 5173/tcp 4100/tcp 2>/dev/null; sleep 4
E2E_API_PORT=4100 pnpm exec playwright test tests/e2e/visual.spec.ts --workers=1 --reporter=line
```

The suite starts its own API, admin and web dev servers (`playwright.config.ts`
`webServer`), resets and seeds the test database, pins the language fixture and
the post dates.

## Why a small change can pass silently

Each capture uses `maxDiffPixelRatio: 0.001` — about 1,440 pixels on a 1440×1000
page. A new icon button or a 14px toggle is smaller than that, so the comparison
can pass while the baseline no longer shows the shipped UI.

When the change is small:

```bash
rm tests/e2e/visual.spec.ts-snapshots/<screen>-desktop-chromium-linux.png
E2E_API_PORT=4100 pnpm exec playwright test tests/e2e/visual.spec.ts --workers=1 --update-snapshots
```

`--update-snapshots` only rewrites a file when the comparison fails or the file
is missing, so deleting the affected files is the way to force a fresh capture.

## Proving a diff is confined

`scripts/png-diff.mjs` (dependency-free) reports how much changed and where:

```bash
# The committed version as the "before" image:
git show HEAD:tests/e2e/visual.spec.ts-snapshots/posts-desktop-chromium-linux.png \
  > /tmp/before.png
node scripts/png-diff.mjs /tmp/before.png tests/e2e/visual.spec.ts-snapshots/posts-desktop-chromium-linux.png
# → {"width":1440,"height":1000,"changed":1207,"box":{"x":1134,"y":21,"w":186,"h":29}}
```

Judge the box against the change you meant to make. A 186×29 box at the top
right is the colour-scheme switch; a box that covers the content column means
something moved. `--rows` prints contiguous changed row bands (useful when one
element repeats), `--shift` finds the best `(dx, dy)` offset (useful to tell a
1px shift from a repaint).

## Sources of instability (and how they are neutralised)

The baselines are only useful if a failure means a real change. These sources
have been removed from the spec:

| Source | Fix in the spec |
| --- | --- |
| General Settings previews today's date and the current time | `page.clock.setFixedTime(2026-11-07T12:00:00Z)` for the admin screens |
| Languages screen shows when a language option was last written | same frozen clock |
| Dashboard "Events and News" fetched live WordPress.org data | `page.route('**/api/admin/dashboard/feeds*')` returns `dashboardFeedsFixture` |
| Analytics chart uses a rolling 7-day window | `page.route('**/api/admin/analytics*')` returns `analyticsFixture` |
| Post counts / titles depend on earlier E2E specs | `beforeAll` runs `db:reset:test` + `db:seed` with fixed timestamps |
| Customizer preview is a cross-origin iframe that may not have loaded | `settle()` waits for each frame's `load` state |
| Editor captures a loading skeleton | explicit waits for the canvas text before the shot |

If a future failure looks like noise, fix the source (stub it or pin it) instead
of raising `maxDiffPixelRatio`.

## Host hygiene

The dev servers, Chromium, the Playwright MCP browser and the API together need
more memory than this host has spare. Under load (>10) screens hang and the run
reports "did not run" or a missing heading — always a timeout, never a diff.

Before a full run: stop the dev servers and the MCP browser, check `uptime` and
`free -m`, and keep `--workers=1`. A clean run takes about 2 minutes.

## Orphans

When a screen is renamed or dropped, its baseline stays behind and never runs.
Delete it in the same commit (e.g. `reading-desktop` was dropped when the
desktop Reading capture moved to the mobile set). The count should match the
screens the spec captures: `desktopScreens` + `mobileScreens` + the element
captures (analytics chart, vitals, editor tabs and dialogs).

## Related

- [ADR 0044](../adr/0044-admin-color-schemes.md) and
  [ADR 0065](../adr/0065-admin-dark-theme.md) explain the palettes the suite
  guards.
- [Design audit](design-audit-2026-11-05.md) holds the measured comparisons
  behind the baselines.
- `docs/implementation-log.md` records each regeneration with the diff boxes.
