import { InfinispanVector } from '@infinispan/mastra';

const store = new InfinispanVector({
  id: 'my-store',
  host: 'localhost',
  port: 11222,
  username: 'admin',
  password: 'password',
});
