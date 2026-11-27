import { Mastra } from '@mastra/core';
import { InfinispanVector } from '@infinispan/mastra';

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
