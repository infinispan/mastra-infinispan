import { MastraVector } from '@mastra/core/vector';
import type {
  CreateIndexParams,
  DeleteIndexParams,
  DeleteVectorParams,
  DeleteVectorsParams,
  DescribeIndexParams,
  IndexStats,
  QueryResult,
  QueryVectorParams,
  UpdateVectorParams,
  UpsertVectorParams
} from '@mastra/core/vector';

import * as ispn from 'infinispan';
import * as protobuf from 'protobufjs';

const METRIC_MAPPING: Record<string, string> = {
  cosine: 'COSINE',
  euclidean: 'L2',
  dotproduct: 'INNER_PRODUCT'
};

const REVERSE_METRIC_MAPPING: Record<string, 'cosine' | 'euclidean' | 'dotproduct'> = {
  COSINE: 'cosine',
  L2: 'euclidean',
  INNER_PRODUCT: 'dotproduct'
};

const PROTO_PACKAGE = 'mastra';
const TYPE_ID = 2000000;
const VECTOR_FIELD = 'embedding';
const METADATA_FIELD = 'metadata_json';

export interface InfinispanVectorConfig {
  id: string;
  host?: string;
  port?: number;
  uri?: string;
  username?: string;
  password?: string;
}

interface IndexMeta {
  dimension: number;
  metric: string;
  protoTypeName: string;
  cacheCreated: boolean;
}

export class InfinispanVector extends MastraVector {
  private config: InfinispanVectorConfig;
  private indexMeta = new Map<string, IndexMeta>();

  constructor(config: InfinispanVectorConfig) {
    super({ id: config.id });
    this.config = {
      host: 'localhost',
      port: 11222,
      ...config
    };
  }

  private getAuthOpts(): Record<string, any> {
    if (!this.config.username) return {};
    return {
      authentication: {
        enabled: true,
        saslMechanism: 'SCRAM-SHA-256',
        userName: this.config.username,
        password: this.config.password || ''
      }
    };
  }

  private getConnectionArgs(): { host: string; port: number } | string {
    if (this.config.uri) return this.config.uri;
    return { host: this.config.host!, port: this.config.port! };
  }

  private async connectAdmin(): Promise<any> {
    const args = this.getConnectionArgs();
    if (typeof args === 'string') {
      return ispn.client(args, { ...this.getAuthOpts(), topologyUpdates: false });
    }
    return ispn.client(args, { ...this.getAuthOpts(), topologyUpdates: false });
  }

  private async connectMeta(): Promise<any> {
    const args = this.getConnectionArgs();
    const opts = {
      ...this.getAuthOpts(),
      cacheName: '___protobuf_metadata',
      dataFormat: { keyType: 'text/plain', valueType: 'text/plain' },
      topologyUpdates: false
    };
    if (typeof args === 'string') {
      return ispn.client(args, opts);
    }
    return ispn.client(args, opts);
  }

  private async connectCache(cacheName: string, root: protobuf.Root, typeName: string, typeId: number): Promise<any> {
    const args = this.getConnectionArgs();
    const opts = {
      ...this.getAuthOpts(),
      cacheName,
      topologyUpdates: false,
      dataFormat: {
        keyType: 'text/plain',
        valueType: 'application/x-protostream'
      }
    };
    let client: any;
    if (typeof args === 'string') {
      client = await ispn.client(args, opts);
    } else {
      client = await ispn.client(args, opts);
    }
    client.registerProtostreamRoot(root);
    client.registerProtostreamType(typeName, typeId);
    return client;
  }

  private buildProtoSchema(indexName: string, dimension: number, metric: string): string {
    const similarity = METRIC_MAPPING[metric] || 'COSINE';
    return `syntax = "proto3";
package ${PROTO_PACKAGE};
/**
 * @TypeId(${TYPE_ID})
 * @Indexed
 */
message ${this.protoMessageName(indexName)} {
    /** @Keyword(projectable = true) */
    string doc_id = 1;
    /** @Vector(dimension = ${dimension}, similarity = ${similarity}) */
    repeated float ${VECTOR_FIELD} = 2;
    /** @Keyword(projectable = true) */
    string ${METADATA_FIELD} = 3;
}`;
  }

  private buildCacheConfig(indexName: string): string {
    const entityName = `${PROTO_PACKAGE}.${this.protoMessageName(indexName)}`;
    return (
      '<distributed-cache>' +
      '<encoding><key media-type="text/plain"/><value media-type="application/x-protostream"/></encoding>' +
      '<indexing enabled="true" storage="filesystem" startup-mode="AUTO">' +
      `<indexed-entities><indexed-entity>${entityName}</indexed-entity></indexed-entities>` +
      '</indexing></distributed-cache>'
    );
  }

  private protoMessageName(indexName: string): string {
    return `MastraVector_${indexName.replace(/[^a-zA-Z0-9]/g, '_')}`;
  }

  private fullTypeName(indexName: string): string {
    return `.${PROTO_PACKAGE}.${this.protoMessageName(indexName)}`;
  }

  private schemaName(indexName: string): string {
    return `${PROTO_PACKAGE}/${this.protoMessageName(indexName)}.proto`;
  }

  async createIndex({ indexName, dimension, metric = 'cosine' }: CreateIndexParams): Promise<void> {
    const schema = this.buildProtoSchema(indexName, dimension, metric);
    const cacheConfig = this.buildCacheConfig(indexName);

    // Register the protobuf schema
    const metaClient = await this.connectMeta();
    try {
      await metaClient.put(this.schemaName(indexName), schema);
    } finally {
      await metaClient.disconnect();
    }

    // Create the indexed cache
    const adminClient = await this.connectAdmin();
    try {
      await adminClient.admin.getOrCreateCache(indexName, cacheConfig);
    } finally {
      await adminClient.disconnect();
    }

    this.indexMeta.set(indexName, {
      dimension,
      metric: metric,
      protoTypeName: this.fullTypeName(indexName),
      cacheCreated: true
    });
  }

  async listIndexes(): Promise<string[]> {
    const adminClient = await this.connectAdmin();
    try {
      const names: string[] = await adminClient.admin.cacheNames();
      // Filter out internal caches
      return names.filter((n: string) => !n.startsWith('___') && !n.startsWith('org.infinispan'));
    } finally {
      await adminClient.disconnect();
    }
  }

  async describeIndex({ indexName }: DescribeIndexParams): Promise<IndexStats> {
    const meta = this.indexMeta.get(indexName);

    if (!meta) {
      // Try to read schema from server to recover metadata
      const metaClient = await this.connectMeta();
      try {
        const schema = await metaClient.get(this.schemaName(indexName));
        if (!schema) {
          throw new Error(`Index "${indexName}" not found`);
        }
        const dimMatch = schema.match(/dimension\s*=\s*(\d+)/);
        const simMatch = schema.match(/similarity\s*=\s*(\w+)/);
        const dimension = dimMatch ? parseInt(dimMatch[1], 10) : 0;
        const similarity = simMatch ? simMatch[1] : 'COSINE';

        this.indexMeta.set(indexName, {
          dimension,
          metric: REVERSE_METRIC_MAPPING[similarity] || 'cosine',
          protoTypeName: this.fullTypeName(indexName),
          cacheCreated: true
        });
      } finally {
        await metaClient.disconnect();
      }
    }

    const recovered = this.indexMeta.get(indexName)!;

    // Get count via query
    const { root, MessageType } = this.buildProtobufRoot(indexName, recovered.dimension, recovered.metric);
    const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);
    try {
      const count = await client.size();
      return {
        dimension: recovered.dimension,
        count,
        metric: recovered.metric as IndexStats['metric']
      };
    } finally {
      await client.disconnect();
    }
  }

  async deleteIndex({ indexName }: DeleteIndexParams): Promise<void> {
    // Remove the cache
    const adminClient = await this.connectAdmin();
    try {
      try {
        await adminClient.admin.removeCache(indexName);
      } catch {
        // Cache may not exist
      }
    } finally {
      await adminClient.disconnect();
    }

    // Remove the schema
    const metaClient = await this.connectMeta();
    try {
      try {
        await metaClient.remove(this.schemaName(indexName));
      } catch {
        // Schema may not exist
      }
    } finally {
      await metaClient.disconnect();
    }

    this.indexMeta.delete(indexName);
  }

  async upsert({ indexName, vectors, metadata, ids }: UpsertVectorParams): Promise<string[]> {
    const meta = await this.ensureIndexMeta(indexName);
    const vectorIds = ids || vectors.map(() => crypto.randomUUID());

    const { root, MessageType } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
    const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

    try {
      for (let i = 0; i < vectors.length; i++) {
        const msg = MessageType.create({
          docId: vectorIds[i],
          embedding: vectors[i],
          metadataJson: metadata?.[i] ? JSON.stringify(metadata[i]) : '{}'
        });
        await client.put(vectorIds[i], msg);
      }
      return vectorIds;
    } finally {
      await client.disconnect();
    }
  }

  async query({
    indexName,
    queryVector,
    topK = 10,
    filter,
    includeVector = false
  }: QueryVectorParams): Promise<QueryResult[]> {
    if (!queryVector) {
      throw new Error('queryVector is required for Infinispan queries');
    }

    const meta = await this.ensureIndexMeta(indexName);
    const { root, MessageType } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
    const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

    try {
      const entityName = `${PROTO_PACKAGE}.${this.protoMessageName(indexName)}`;
      const vecStr = `[${queryVector.join(', ')}]`;

      const queryString =
        `select e.doc_id, e.${METADATA_FIELD}, score(e)` +
        ` from ${entityName} e where e.${VECTOR_FIELD} <-> ${vecStr}~${topK}` +
        (filter ? ` filtering ${this.buildFilterClause(filter)}` : '');

      const results = await client.query({ queryString });

      const queryResults: QueryResult[] = results.map((row: any[]) => {
        const result: QueryResult = {
          id: row[0] as string,
          score: (row[2] as number) || 0,
          metadata: row[1] ? JSON.parse(row[1] as string) : {}
        };
        return result;
      });

      if (includeVector && queryResults.length > 0) {
        for (const result of queryResults) {
          const entry = await client.get(result.id);
          if (entry && entry.embedding) {
            result.vector = Array.isArray(entry.embedding)
              ? (entry.embedding as number[])
              : [entry.embedding as number];
          }
        }
      }

      return queryResults;
    } finally {
      await client.disconnect();
    }
  }

  async updateVector(params: UpdateVectorParams): Promise<void> {
    const { indexName, update } = params;
    const id = 'id' in params ? params.id : undefined;
    const filter = 'filter' in params ? params.filter : undefined;

    if (!update.vector && !update.metadata) {
      throw new Error('No updates provided');
    }

    if (id) {
      const meta = await this.ensureIndexMeta(indexName);
      const { root, MessageType } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
      const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

      try {
        const existing = await client.get(id);
        if (!existing) {
          throw new Error(`Vector with ID "${id}" not found`);
        }

        const currentMetadata = existing.metadataJson ? JSON.parse(existing.metadataJson) : {};
        const msg = MessageType.create({
          docId: id,
          embedding: update.vector || existing.embedding,
          metadataJson: JSON.stringify(update.metadata || currentMetadata)
        });
        await client.put(id, msg);
      } finally {
        await client.disconnect();
      }
    } else if (filter) {
      // Query matching entries, then update each
      const meta = await this.ensureIndexMeta(indexName);
      const { root, MessageType } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
      const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

      try {
        const entityName = `${PROTO_PACKAGE}.${this.protoMessageName(indexName)}`;
        const filterClause = this.buildFilterClause(filter);
        const queryString = `select e.doc_id from ${entityName} e where ${filterClause}`;
        const results = await client.query({ queryString });

        for (const row of results) {
          const docId = row[0] as string;
          const existing = await client.get(docId);
          if (!existing) continue;

          const currentMetadata = existing.metadataJson ? JSON.parse(existing.metadataJson) : {};
          const msg = MessageType.create({
            docId,
            embedding: update.vector || existing.embedding,
            metadataJson: JSON.stringify(update.metadata || currentMetadata)
          });
          await client.put(docId, msg);
        }
      } finally {
        await client.disconnect();
      }
    } else {
      throw new Error('Either id or filter must be provided');
    }
  }

  async deleteVector({ indexName, id }: DeleteVectorParams): Promise<void> {
    const meta = await this.ensureIndexMeta(indexName);
    const { root } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
    const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

    try {
      await client.remove(id);
    } finally {
      await client.disconnect();
    }
  }

  async deleteVectors({ indexName, ids, filter }: DeleteVectorsParams): Promise<void> {
    if (ids && filter) {
      throw new Error('ids and filter are mutually exclusive');
    }
    if (!ids && !filter) {
      throw new Error('Either ids or filter must be provided');
    }

    const meta = await this.ensureIndexMeta(indexName);
    const { root } = this.buildProtobufRoot(indexName, meta.dimension, meta.metric);
    const client = await this.connectCache(indexName, root, this.fullTypeName(indexName), TYPE_ID);

    try {
      if (ids) {
        for (const id of ids) {
          await client.remove(id);
        }
      } else if (filter) {
        const entityName = `${PROTO_PACKAGE}.${this.protoMessageName(indexName)}`;
        const filterClause = this.buildFilterClause(filter);
        const queryString = `select e.doc_id from ${entityName} e where ${filterClause}`;
        const results = await client.query({ queryString });

        for (const row of results) {
          await client.remove(row[0] as string);
        }
      }
    } finally {
      await client.disconnect();
    }
  }

  private async ensureIndexMeta(indexName: string): Promise<IndexMeta> {
    let meta = this.indexMeta.get(indexName);
    if (meta) return meta;

    // Recover from server
    await this.describeIndex({ indexName });
    meta = this.indexMeta.get(indexName);
    if (!meta) {
      throw new Error(`Index "${indexName}" not found`);
    }
    return meta;
  }

  private buildProtobufRoot(
    indexName: string,
    dimension: number,
    metric: string
  ): { root: protobuf.Root; MessageType: protobuf.Type } {
    const schema = this.buildProtoSchema(indexName, dimension, metric);
    const root = new protobuf.Root();
    protobuf.parse(schema, root);
    const MessageType = root.lookupType(this.fullTypeName(indexName));
    return { root, MessageType };
  }

  private buildFilterClause(filter: Record<string, any>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'string') {
        parts.push(`e.${METADATA_FIELD} like '%"${key}":"${value}"%'`);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        parts.push(`e.${METADATA_FIELD} like '%"${key}":${JSON.stringify(value)}%'`);
      }
    }

    return parts.length > 0 ? parts.join(' and ') : '';
  }
}
