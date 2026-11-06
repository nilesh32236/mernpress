/**
 * Isomorphic contracts and URL rules shared by the API, the admin and the
 * public site.
 *
 * Nothing here may import Node built-ins, React or the database: both the
 * Next.js edge middleware and the Fastify process evaluate this module.
 */
export * from './permalink.js';
export * from './admin-colors.js';
export * from './screen-options.js';
export * from './consent.js';
export * from './languages.js';
export * from './theme-strings.js';
