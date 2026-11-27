import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { InfinispanVector } from './index';

const INDEX_NAME = 'test_vectors';
const DIMENSION = 3;

describe('InfinispanVector', () => {
  let vector: InfinispanVector;

  beforeAll(() => {
    vector = new InfinispanVector({
      id: 'test-infinispan',
      host: 'localhost',
      port: 11222,
      username: 'admin',
      password: 'password'
    });
  });

  afterAll(async () => {
    try {
      await vector.deleteIndex({ indexName: INDEX_NAME });
    } catch {
      // Index may not exist
    }
  });

  beforeEach(async () => {
    try {
      await vector.deleteIndex({ indexName: INDEX_NAME });
    } catch {
      // Index may not exist
    }
  });

  describe('createIndex', () => {
    it('creates an index', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      const indexes = await vector.listIndexes();
      expect(indexes).toContain(INDEX_NAME);
    });
  });

  describe('describeIndex', () => {
    it('describes an index', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.dimension).toBe(DIMENSION);
      expect(stats.count).toBe(0);
      expect(stats.metric).toBe('cosine');
    });
  });

  describe('upsert', () => {
    it('inserts vectors', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      const ids = await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [
          [0.9, 0.1, 0.1],
          [0.1, 0.9, 0.1],
          [0.1, 0.1, 0.9]
        ],
        metadata: [{ label: 'dark' }, { label: 'light' }, { label: 'hoppy' }]
      });
      expect(ids).toHaveLength(3);

      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.count).toBe(3);
    });

    it('inserts vectors with custom ids', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      const ids = await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.5, 0.5, 0.5]],
        metadata: [{ label: 'balanced' }],
        ids: ['custom-id-1']
      });
      expect(ids).toEqual(['custom-id-1']);
    });
  });

  describe('query', () => {
    it('finds nearest vectors', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [
          [0.95, 0.05, 0.1],
          [0.1, 0.9, 0.15],
          [0.1, 0.15, 0.95]
        ],
        metadata: [{ label: 'dark' }, { label: 'light' }, { label: 'hoppy' }],
        ids: ['v1', 'v2', 'v3']
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.9, 0.1, 0.1],
        topK: 2
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.id).toBe('v1');
      expect(results[0]!.score).toBeGreaterThan(0);
      expect(results[0]!.metadata).toEqual({ label: 'dark' });
    });

    it('returns vectors when includeVector is true', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.5, 0.5, 0.5]],
        ids: ['v1']
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.5, 0.5, 0.5],
        topK: 1,
        includeVector: true
      });

      expect(results[0]!.vector).toBeDefined();
      expect(results[0]!.vector).toHaveLength(DIMENSION);
    });
  });

  describe('deleteVector', () => {
    it('deletes a single vector', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.5, 0.5, 0.5]],
        ids: ['to-delete']
      });

      await vector.deleteVector({ indexName: INDEX_NAME, id: 'to-delete' });

      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.count).toBe(0);
    });
  });

  describe('deleteVectors', () => {
    it('deletes multiple vectors by ids', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
          [0.7, 0.8, 0.9]
        ],
        ids: ['a', 'b', 'c']
      });

      await vector.deleteVectors({ indexName: INDEX_NAME, ids: ['a', 'c'] });

      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.count).toBe(1);
    });
  });

  describe('updateVector', () => {
    it('updates metadata by id', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.5, 0.5, 0.5]],
        metadata: [{ label: 'old' }],
        ids: ['update-me']
      });

      await vector.updateVector({
        indexName: INDEX_NAME,
        id: 'update-me',
        update: { metadata: { label: 'new' } }
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.5, 0.5, 0.5],
        topK: 1
      });
      expect(results[0]!.metadata).toEqual({ label: 'new' });
    });
  });

  describe('deleteIndex', () => {
    it('deletes an index', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.deleteIndex({ indexName: INDEX_NAME });
      const indexes = await vector.listIndexes();
      expect(indexes).not.toContain(INDEX_NAME);
    });
  });
});
