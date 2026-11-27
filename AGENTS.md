# AGENTS.md

This file provides guidance to AI code assistants when working in this repository.

Read `AI-CODE.md` for the full tech stack, project structure, and architecture details.

## Quick Reference

- **Build:** `npm run build`
- **Test:** `npm test` (starts Infinispan via Docker, runs Vitest, tears down)
- **Lint:** `npm run lint` (TypeScript type check)
- **Language:** TypeScript strict, ESM
- **Peer dep:** `@mastra/core` -- never bundle it, always peer

## Key Patterns

- `InfinispanVector` extends `MastraVector` from `@mastra/core/vector`
- Each index = protobuf schema + indexed distributed cache
- Vector search via Ickle queries with `<->` operator
- Metadata stored as serialized JSON in a `@Keyword` field
- Short-lived Hot Rod connections per operation

## Before Making Changes

1. Read `AI-CODE.md` for architecture context
2. Check `src/vector/index.ts` for the current implementation
3. Run `npm run lint` before committing
4. Integration tests need a running Infinispan -- use `docker compose up -d`
