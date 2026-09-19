# Contributing

Contributions are welcome! Please follow these steps:

## Development Setup

```bash
git clone git@github.com:matheusmarnt/ghostwire.git
cd ghostwire
composer install
```

## Running Tests

The test suite (Pest, Orchestra Testbench) is wired starting at milestone M1 — see `SDD-ghostwire.md` §14/§16. Until then, CI validates `composer.json` and code style only.

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
