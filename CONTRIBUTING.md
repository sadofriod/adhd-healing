# Contributing

Thanks for contributing to ADHD Healing.

This project is local-first, macOS-hosted, and intentionally optimized for a single-user workflow. Contributions are welcome for code, tests, docs, bug reports, and product feedback. English and Chinese issues or pull requests are both fine.

## Before You Start

- Read [README.md](./README.md), [README.zh-CN.md](./README.zh-CN.md), and [docs/setup.md](./docs/setup.md) before changing setup or behavior.
- For large product or architecture changes, open an issue first so the direction can be aligned before implementation.
- Keep changes scoped. Avoid mixing behavior changes with unrelated refactors.

## Local Setup

```bash
pnpm install
pnpm start
```

Useful commands:

```bash
pnpm run start:cli
pnpm run build:web
pnpm lint
pnpm exec tsc --noEmit
pnpm test
```

Notes:

- Package manager: `pnpm`
- Runtime: `Bun`
- Session history persistence: Prisma + SQLite
- Default local database: `data/sessions.db` when `DATABASE_URL` is unset

## Project Conventions

- Keep files small and focused on a single responsibility.
- Prefer creating a small directory for a module over growing one large file.
- Avoid `index.ts` unless it is the package entry point.
- Add or update colocated tests for every source change when practical.
- Keep documentation aligned with the current implementation, especially setup, API, and runtime behavior.
- When user-facing behavior changes, update both English and Chinese documentation where applicable.

## Pull Request Expectations

- Describe the behavior change, not just the code diff.
- Call out risks, migrations, or environment changes.
- List the validation you ran locally.
- Update docs when commands, configuration, API shape, or workflows change.
- Keep PRs reviewable; smaller focused PRs are preferred over broad rewrites.

## CI

GitHub Actions runs the main repository checks on every push and pull request:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm exec tsc --noEmit`
- `pnpm test`
- `pnpm run build:web`

Please make sure these pass locally before asking for review.

## Docker and Deployment

The repository does not currently treat a full Dockerized app stack as the default path.

- SQLite is enough for the current local-first workflow.
- The runtime depends on host-native macOS integrations such as Apple Reminders automation, local Vault paths, and the Obsidian CLI.
- Docker is currently relevant only for the optional GitHub MCP server configured in [mcp.json](./mcp.json).

If the project later needs remote hosting, multi-user access, or contributor onboarding without macOS-specific tooling, introducing Docker Compose can be revisited from that concrete requirement.