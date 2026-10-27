import type {
  AuthService,
  ContentService,
  HookRegistry,
  TaxonomyService,
} from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseClient;
    auth: AuthService;
    content: ContentService;
    taxonomy: TaxonomyService;
    contentHooks: HookRegistry;
  }
}
