# AI Code Instructions

## Tech Stack
* **Runtime:** Node.js 24 LTS
* **Language:** TypeScript (strict mode, ESM)
* **Build:** tsdown (ESM + CJS dual output)
* **Test framework:** Vitest
* **Dependencies:** `infinispan` (Hot Rod client), `protobufjs`, `@mastra/core` (peer)

## Project Structure

```
src/
  index.ts                # Entry point - re-exports from vector/
  vector/
    index.ts              # InfinispanVector class extending MastraVector
    index.test.ts         # Integration tests (require running Infinispan)
docker-compose.yaml       # Infinispan server for testing
tsdown.config.ts          # Build configuration
vitest.config.ts          # Test configuration
.github/workflows/
  ci.yml                  # Lint + test on PRs and pushes
  release.yml             # Manual release to npm
```

## Build and Test Commands
* **Install dependencies:** `npm install`
* **Build:** `npm run build`
* **Type check:** `npm run lint`
* **Run tests (with containers):** `npm test` (starts Docker via pretest)
* **Run tests (containers already running):** `npx vitest run`

## Architecture

### MastraVector Interface

`InfinispanVector` extends `MastraVector` from `@mastra/core/vector` and implements all abstract methods:

- `createIndex` - Registers a protobuf schema with `@Vector` annotation and creates an indexed distributed cache
- `upsert` - Stores vectors as protobuf messages via Hot Rod
- `query` - kNN search using Ickle `<->` operator with score projection
- `updateVector` - Updates by ID or filter
- `deleteVector` / `deleteVectors` - Removes by ID, batch IDs, or filter
- `describeIndex` - Recovers dimension/metric from server schema
- `listIndexes` - Lists non-internal caches
- `deleteIndex` - Removes cache and schema

### Infinispan Integration Pattern

Each index maps to:
1. A **protobuf schema** registered in `___protobuf_metadata` cache with `@Vector` and `@Keyword` annotations
2. A **distributed cache** with indexing enabled for that entity type
3. Entries stored as protobuf messages with `doc_id`, `embedding` (repeated float), and `metadata_json` (serialized JSON) fields

Vector search uses Ickle queries: `FROM entity e WHERE e.embedding <-> [v1, v2, ...]~topK`

### Connection Model

The client creates short-lived Hot Rod connections per operation. Each operation:
1. Connects to Infinispan with the specified auth
2. Performs the operation
3. Disconnects

## Development Standards
* **Style:** TypeScript strict mode, ESM modules
* **Testing:** Integration tests require a running Infinispan server (via Docker)
* **Peer dependency:** `@mastra/core` is a peer dep, not bundled
* **Commit messages:** Conventional commits preferred
* **Git branches:** Use `main` as the default branch

## Related Projects

* **Infinispan JS client:** `~/REDHAT/INFINISPAN/js-client` - The Hot Rod client this package depends on
* **Infinispan server:** `~/REDHAT/INFINISPAN/infinispan` - The server source
* **Mastra monorepo:** `~/REDHAT/INFINISPAN/mastra` - The AI framework (reference for interface patterns)
* **Simple tutorials:** `~/REDHAT/INFINISPAN/infinispan-simple-tutorials/infinispan-ai/mastra` - RAG agent example
