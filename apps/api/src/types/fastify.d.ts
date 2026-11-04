import type {
  ApplicationPasswordService,
  AuthService,
  AutosaveService,
  BulkService,
  ContentService,
  HookRegistry,
  MediaService,
  ScheduleService,
  TaxonomyService,
  UserAdminService,
} from '@mernpress/cms-core';
import type { DatabaseClient } from '@mernpress/database';

declare module 'fastify' {
  interface FastifyInstance {
    database: DatabaseClient;
    auth: AuthService;
    appPasswords: ApplicationPasswordService;
    content: ContentService;
    taxonomy: TaxonomyService;
    contentHooks: HookRegistry;
    users: UserAdminService;
    schedule: ScheduleService;
    bulk: BulkService;
    media: MediaService;
    autosave: AutosaveService;
  }
}
