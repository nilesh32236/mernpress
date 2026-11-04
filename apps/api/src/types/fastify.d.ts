import type {
  ApplicationPasswordService,
  AuthService,
  AutosaveService,
  BulkService,
  ContentService,
  HookRegistry,
  MailService,
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
    mail: MailService;
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
