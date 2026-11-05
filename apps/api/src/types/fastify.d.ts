import type {
  ApplicationPasswordService,
  AuthService,
  AutosaveService,
  ExportService,
  RedirectService,
  BackupService,
  BulkService,
  ContentService,
  HookRegistry,
  MailService,
  PasswordResetService,
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
    passwordResets: PasswordResetService;
    content: ContentService;
    taxonomy: TaxonomyService;
    contentHooks: HookRegistry;
    users: UserAdminService;
    schedule: ScheduleService;
    bulk: BulkService;
    media: MediaService;
    exports: ExportService;
    redirects: RedirectService;
    backups: BackupService;
    autosave: AutosaveService;
  }
}
