const ids = await store.upsert({
  indexName: 'documents',
  vectors: [embedding1, embedding2],
  metadata: [
    { title: 'Introduction', source: 'doc.pdf' },
    { title: 'Chapter 1', source: 'doc.pdf' },
  ],
  ids: ['doc-1', 'doc-2'],
});
