# Contributing

Contributions are welcome! Please follow these steps:

## Development Setup

```bash
git clone git@github.com:matheusmarnt/ghostwire.git
cd ghostwire
composer install
```

## Running Tests

```bash
npm ci && npm run build        # the browser suite runs against resources/dist/ghostwire.js
npx playwright install chromium
npm test                       # Vitest (js/tests)
vendor/bin/pest                # Pest: Unit, Feature, Contract and Browser suites
```

Do not pipe `vendor/bin/pest` through `head`, `tail` or `grep` — `pest-plugin-browser` spawns `playwright run-server` children that keep the pipe open and the command never returns. Redirect to a file instead if you need to capture output.

### Performance gates

CI runs a dedicated `perf` workflow on every pull request. Every gate is structural — a count of bytes or DOM operations, never a duration — so it cannot fail because a runner is slow:

- **Bundle budget (SPEC-PERF-08):** `resources/dist/ghostwire.js` must stay at or under 10 KB gzip with zero runtime dependencies (`js/tests/perf-bundle-budget.test.js`). If a change pushes it over, the budget is the conversation to have, not the number to raise.
- **Read-before-write (SPEC-PERF-01/02):** no layout read after the first DOM write of a cycle — measured from the first write to a connected node (the host's `aria-busy`), in jsdom (`js/tests/perf-read-write-order.test.js`) and in a real browser against the built bundle (`tests/Browser/Performance/RenderBudgetTest.php`).
- **Bounded synthesis (SPEC-PERF-03/04):** layout reads grow sub-quadratically with host size and stop growing once the 300-candidate cap engages (`tests/Browser/Performance/ComplexityTest.php`).
- **No lifecycle leaks (SPEC-PERF-11):** 500 show/hide cycles leave no layers, observers or timers behind (`js/tests/perf-lifecycle-leaks.test.js`).

Run them locally with `npx vitest run --config js/vitest.config.js perf-` and `vendor/bin/pest tests/Browser/Performance`.

## Code Style

```bash
vendor/bin/pint
```

## Submitting a Pull Request

1. Fork the repository
2. Create a branch: `git checkout -b my-feature`
3. Make your changes with tests
4. Ensure code style is clean (`vendor/bin/pint`)
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/) — **do not edit `CHANGELOG.md`**, release-please generates it from your commit subjects
6. Push and open a PR against `main`

## Commit Convention

This project uses Conventional Commits for automated changelogs **and automated releases**. Your commit subjects are the changelog: release-please reads them from `main`, opens a release PR with the version bump and generated `CHANGELOG.md` entries, and once that PR is merged it creates the tag and the GitHub Release on its own.

A subject release-please cannot parse is skipped **silently** — no changelog entry and no version bump, with nothing going red. `lint.yml`'s `commit-convention` job exists to make that loud, so a PR with a non-conventional commit fails CI.

| Prefix | Release bump |
|---|---|
| `feat:` | minor |
| `fix:` | patch |
| `feat!:` / `BREAKING CHANGE:` | major |
| `chore:` / `docs:` / `test:` / `ci:` | no release |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
