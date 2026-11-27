# infinispan-mastra

Infinispan vector store provider for [Mastra](https://mastra.ai).

Provides vector search (kNN) capabilities using [Infinispan](https://infinispan.org) as the backend, via the Hot Rod protocol.

## Installation

```bash
npm install infinispan-mastra
```

## Usage

```typescript
import { InfinispanVector } from 'infinispan-mastra';

const store = new InfinispanVector({
  id: 'my-store',
  host: 'localhost',
  port: 11222,
  username: 'admin',
  password: 'password',
});

// Create an index
await store.createIndex({
  indexName: 'documents',
  dimension: 1536,
  metric: 'cosine',
});

// Upsert vectors
await store.upsert({
  indexName: 'documents',
  vectors: [embedding],
  metadata: [{ source: 'doc.pdf' }],
});

// Query
const results = await store.query({
  indexName: 'documents',
  queryVector: queryEmbedding,
  topK: 10,
});
```

## Use with Mastra

```typescript
import { Mastra } from '@mastra/core';
import { InfinispanVector } from 'infinispan-mastra';

const mastra = new Mastra({
  vectors: {
    infinispan: new InfinispanVector({
      id: 'infinispan',
      host: 'localhost',
      port: 11222,
      username: 'admin',
      password: 'password',
    }),
  },
});
```

## Features

- kNN vector search with cosine, euclidean, and dot product metrics
- Hybrid queries (vector + metadata filtering)
- Full CRUD operations on vectors
- Uses Hot Rod binary protocol for performance
- Automatic protobuf schema and indexed cache management

## Running tests

```bash
npm run test
```

Tests require Docker to run an Infinispan server.

## License

Apache-2.0
