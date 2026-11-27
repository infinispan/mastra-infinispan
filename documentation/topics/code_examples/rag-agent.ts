import { Agent } from '@mastra/core/agent';
import { InfinispanVector } from 'infinispan-mastra';
import { createVectorQueryTool } from '@mastra/rag';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';
import { Memory } from '@mastra/memory';

const infinispanVector = new InfinispanVector({
  id: 'infinispan-vector',
  host: 'localhost',
  port: 11222,
  username: 'admin',
  password: 'password',
});

const vectorQueryTool = createVectorQueryTool({
  vectorStore: infinispanVector,
  indexName: 'scifi-movies',
  model: new ModelRouterEmbeddingModel('openai/text-embedding-3-small'),
});

export const infinispanAgent = new Agent({
  id: 'infinispan-agent',
  name: 'Infinispan Agent',
  instructions: `You are a helpful assistant that answers questions
    based on the provided context. Base your answer only on the
    context provided by the tool.`,
  model: 'openai/gpt-5-nano',
  tools: { vectorQueryTool },
  memory: new Memory(),
});
