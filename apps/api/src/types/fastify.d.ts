import type {
  AuthService,
  ContentService,
  HookRegistry,
  ScheduleService,
  TaxonomyService,
  UserAdminService,
} from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseClient;
    auth: AuthService;
    content: ContentService;
    taxonomy: TaxonomyService;
    contentHooks: HookRegistry;
    users: UserAdminService;
    schedule: ScheduleService;
  }
}
