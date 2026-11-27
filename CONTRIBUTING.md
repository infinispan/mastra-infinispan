# Contributing to @infinispan/mastra

Thank you for your interest in contributing to the Infinispan Mastra integration.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Set up git hooks: `.githooks/configure-hooks`
4. Install dependencies: `npm install`
5. Start Infinispan: `docker compose up -d`
6. Run tests: `npx vitest run`

## Development

### Build

```bash
npm run build
```

### Test

Tests require a running Infinispan server:

```bash
docker compose up -d
npx vitest run
```

### Format

Code is formatted with Prettier on commit via husky/lint-staged. To format manually:

```bash
npm run format
```

### Type Check

```bash
npm run lint
```

## Commit Messages

Commit messages must follow the Infinispan format:

```
[#issue-number] Short summary starting with uppercase
```

Configure the template:

```bash
git config commit.template .gitmessage
```

Or run `.githooks/configure-hooks` to set up both the template and the commit-msg hook.

## Pull Requests

- Create a GitHub issue first for non-trivial changes
- Reference the issue number in your commit messages
- Ensure `npm run lint` and `npm run format:check` pass
- Add tests for new functionality

## Reporting Issues

Use [GitHub Issues](https://github.com/infinispan/mastra-infinispan/issues) for bug reports and feature requests.

For security vulnerabilities, see [SECURITY.md](SECURITY.md).
