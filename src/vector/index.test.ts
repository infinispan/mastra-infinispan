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

    it('is idempotent when creating the same index twice', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await expect(
        vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' })
      ).resolves.not.toThrow();
    });

    it('creates an index with euclidean metric', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'euclidean' });
      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.metric).toBe('euclidean');
    });

    it('creates an index with dotproduct metric', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'dotproduct' });
      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.metric).toBe('dotproduct');
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

    it('overwrites an entry when upserting with the same id', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.1, 0.2, 0.3]],
        metadata: [{ label: 'first' }],
        ids: ['overwrite-me']
      });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.9, 0.8, 0.7]],
        metadata: [{ label: 'second' }],
        ids: ['overwrite-me']
      });

      const stats = await vector.describeIndex({ indexName: INDEX_NAME });
      expect(stats.count).toBe(1);

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.9, 0.8, 0.7],
        topK: 1
      });
      expect(results[0]!.metadata).toEqual({ label: 'second' });
    });

    it('inserts vectors without metadata', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      const ids = await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.5, 0.5, 0.5]],
        ids: ['no-meta']
      });
      expect(ids).toEqual(['no-meta']);

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.5, 0.5, 0.5],
        topK: 1
      });
      expect(results[0]!.metadata).toEqual({});
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

    it('filters results by metadata', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [
          [0.95, 0.05, 0.1],
          [0.1, 0.9, 0.15],
          [0.1, 0.15, 0.95]
        ],
        metadata: [
          { category: 'stout', country: 'Ireland' },
          { category: 'lager', country: 'Spain' },
          { category: 'ipa', country: 'USA' }
        ],
        ids: ['v1', 'v2', 'v3']
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.5, 0.5, 0.5],
        topK: 3,
        filter: { country: 'Spain' }
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.metadata).toEqual({ category: 'lager', country: 'Spain' });
    });

    it('throws when queryVector is missing', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await expect(
        vector.query({
          indexName: INDEX_NAME,
          topK: 1
        })
      ).rejects.toThrow('queryVector is required');
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

    it('does not error when deleting a non-existent id', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await expect(vector.deleteVector({ indexName: INDEX_NAME, id: 'does-not-exist' })).resolves.not.toThrow();
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

    it('throws when both ids and filter are provided', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await expect(
        vector.deleteVectors({
          indexName: INDEX_NAME,
          ids: ['a'],
          filter: { label: 'x' }
        } as any)
      ).rejects.toThrow('mutually exclusive');
    });

    it('throws when neither ids nor filter is provided', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await expect(vector.deleteVectors({ indexName: INDEX_NAME } as any)).rejects.toThrow(
        'Either ids or filter must be provided'
      );
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

    it('updates vector values by id', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.1, 0.1, 0.1]],
        metadata: [{ label: 'original' }],
        ids: ['update-vec']
      });

      await vector.updateVector({
        indexName: INDEX_NAME,
        id: 'update-vec',
        update: { vector: [0.9, 0.9, 0.9] }
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.9, 0.9, 0.9],
        topK: 1,
        includeVector: true
      });
      expect(results[0]!.id).toBe('update-vec');
      expect(results[0]!.metadata).toEqual({ label: 'original' });
    });

    it('updates both vector and metadata by id', async () => {
      await vector.createIndex({ indexName: INDEX_NAME, dimension: DIMENSION, metric: 'cosine' });
      await vector.upsert({
        indexName: INDEX_NAME,
        vectors: [[0.1, 0.1, 0.1]],
        metadata: [{ label: 'old' }],
        ids: ['update-both']
      });

      await vector.updateVector({
        indexName: INDEX_NAME,
        id: 'update-both',
        update: {
          vector: [0.9, 0.9, 0.9],
          metadata: { label: 'new' }
        }
      });

      const results = await vector.query({
        indexName: INDEX_NAME,
        queryVector: [0.9, 0.9, 0.9],
        topK: 1
      });
      expect(results[0]!.id).toBe('update-both');
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

    it('does not error when deleting a non-existent index', async () => {
      await expect(vector.deleteIndex({ indexName: 'does_not_exist' })).resolves.not.toThrow();
    });
  });
});
