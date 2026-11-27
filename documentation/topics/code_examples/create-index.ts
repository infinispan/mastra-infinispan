await store.createIndex({
  indexName: 'documents',
  dimension: 1536,
  metric: 'cosine',
});
