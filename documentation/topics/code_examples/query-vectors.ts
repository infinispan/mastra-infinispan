const results = await store.query({
  indexName: 'documents',
  queryVector: queryEmbedding,
  topK: 5,
});

for (const result of results) {
  console.log(`${result.id} (score: ${result.score}) - ${result.metadata?.title}`);
}
