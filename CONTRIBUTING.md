# Contributing to qbo-migrate

Thank you for your interest in contributing!

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install` (repo uses pnpm lockfile)
3. Build the project: `pnpm run build`
4. Run tests: `pnpm test`

## Development Workflow

- Use `pnpm run dev` for watch mode
- Run `pnpm run lint` before committing
- Ensure tests pass with `pnpm test`
- Follow conventional commits for commit messages (enforced via commitlint + husky)

## Testing

- Write tests for new features (especially provider or migration ordering logic)
- Aim for >90% coverage for core migration/provider logic
- Run `pnpm run test:coverage` to check coverage

## Pull Request Process

1. Update README.md and docs/qbo-migration.md if user-facing behavior changes
2. Let semantic-release manage CHANGELOG (do not edit manually)
3. Ensure CI passes (build, lint, test, release dry-run on PR)
4. Request review from maintainers

## Code Style

- TypeScript strict mode (avoid `any` outside intentional test doubles)
- ESLint + Prettier configured (run `pnpm lint:fix`)
- Avoid leaking secrets/tokens in logs; use masking utilities

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) (parsed by semantic-release):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `style:` Formatting
- `refactor:` Code restructuring
- `test:` Tests
- `chore:` Maintenance

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
