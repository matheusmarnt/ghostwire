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
4. Ensure code style is clean and `CHANGELOG.md` is updated
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/)
6. Push and open a PR against `main`

## Commit Convention

This project uses Conventional Commits for automated changelogs:

| Prefix | Release bump |
|---|---|
| `feat:` | minor |
| `fix:` | patch |
| `feat!:` / `BREAKING CHANGE:` | major |
| `chore:` / `docs:` / `test:` / `ci:` | no release |

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
