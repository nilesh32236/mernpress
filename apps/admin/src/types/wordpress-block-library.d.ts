/**
 * `@wordpress/block-library` 12.0.0 ships `build-types` subpaths but no root
 * declaration and no `types` export condition. We only consume the
 * registration entrypoint, so a narrow local declaration is safer than a
 * blanket `any` shim.
 */
declare module '@wordpress/block-library' {
  export function registerCoreBlocks(options?: { silent?: boolean }): void;
}
