import type { DatabaseClient } from '@mernpress/database';
import { requireCapability } from '../auth/capabilities.js';
import { ContentError } from '../content/errors.js';
import type { AdminPost, Principal } from '../content/types.js';
import type { ContentService } from '../content/service.js';

/**
 * Privacy policy page helpers (Settings → Privacy).
 *
 * WordPress offers two actions here: create a draft page from its suggested
 * privacy-policy template, and "Use This Page" for an existing page. MERNPress
 * keeps the same workflow but the template is original prose adapted to the
 * profile/comment model implemented here; it is a starting point, not legal
 * advice.
 */
export const PRIVACY_POLICY_OPTION = 'wp_page_for_privacy_policy';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function paragraph(text: string): string {
  return `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
}

function heading(text: string): string {
  return `<!-- wp:heading -->\n<h2 class="wp-block-heading">${text}</h2>\n<!-- /wp:heading -->`;
}

function list(items: string[]): string {
  const listItems = items
    .map((item) => `<!-- wp:list-item -->\n<li>${item}</li>\n<!-- /wp:list-item -->`)
    .join('\n');
  return `<!-- wp:list -->\n<ul class="wp-block-list">\n${listItems}\n</ul>\n<!-- /wp:list -->`;
}

/** Suggested privacy-policy blocks, parameterised by the site name. */
export function privacyPolicyTemplate(siteTitle = 'this site'): string {
  const site = escapeHtml(siteTitle);
  return [
    paragraph(
      `<em>This is a suggested privacy policy template. Review it with a qualified adviser and adapt it to what ${site} actually collects and does.</em>`,
    ),
    heading('Who we are'),
    paragraph(
      `${site} publishes articles and pages, and allows readers to comment where comments are open. The site administrator can be reached through the contact details published on this site.`,
    ),
    heading('What personal data we collect and why we collect it'),
    paragraph(
      'We collect the information you choose to submit and the technical data needed to serve and protect the site. We do not sell personal data.',
    ),
    heading('Comments'),
    paragraph(
      'When you leave a comment we store the name, email address, website (if provided), comment text, IP-derived abuse signals and the time of submission. Name, website and comment are shown publicly; the email address is not. Comments may be held for moderation.',
    ),
    heading('Media'),
    paragraph(
      'If you upload images, avoid images that contain embedded location data (EXIF GPS). Uploaded files are re-encoded and metadata is stripped by this site.',
    ),
    heading('Cookies'),
    paragraph(
      'Signing in sets session cookies for administrators and authors. The public site does not set advertising or analytics cookies. Comment forms may remember your details in your browser if you ask them to.',
    ),
    heading('Embedded content from other websites'),
    paragraph(
      'Articles may include embedded content (for example videos). Embedded content behaves as if you visited the other website, which may collect data about you under its own privacy policy. This installation does not embed third-party content by default.',
    ),
    heading('Analytics'),
    paragraph(
      'This site does not ship a third-party analytics service. Server logs record requests (IP address, path, time and user agent) for security and reliability, and are retained for a limited period.',
    ),
    heading('Who we share your data with'),
    paragraph(
      'We do not sell or rent personal data. Data may be processed by the hosting provider and by the email service configured by the site administrator, strictly to operate the site.',
    ),
    heading('How long we retain your data'),
    paragraph(
      'Comments and their metadata are retained for as long as the site keeps the article, so replies remain readable. Accounts are retained until deleted. Security logs and mail-delivery metadata are pruned on a fixed retention policy.',
    ),
    heading('What rights you have over your data'),
    paragraph(
      'You can request an export of the personal data this site holds about you, or ask for it to be erased. Administrators can create and complete those requests under Tools → Export Personal Data and Tools → Erase Personal Data.',
    ),
    list([
      'Ask what personal data this site holds about you.',
      'Ask for that data to be corrected or erased.',
      'Withdraw consent where processing is based on consent.',
    ]),
    heading('Where your data is sent'),
    paragraph(
      'Data stays on the server that hosts this site. Comment spam checks and email delivery, when configured, may send limited data to the services the administrator has chosen; this installation does not call visitor-tracking services.',
    ),
    heading('Contact'),
    paragraph(`Questions about this policy can be sent to the site administrator of ${site}.`),
  ].join('\n\n');
}

export interface PrivacyPolicyServiceOptions {
  prisma: DatabaseClient;
  content: ContentService;
}

export interface PrivacyPolicyResult {
  pageId: string | null;
}

export interface PrivacyPolicyCreateResult {
  pageId: string;
  page: AdminPost;
}

export function createPrivacyPolicyService({ prisma, content }: PrivacyPolicyServiceOptions) {
  async function siteTitle(): Promise<string> {
    const row = await prisma.option.findUnique({ where: { key: 'site_title' } });
    if (!row) return 'this site';
    try {
      const value = JSON.parse(row.value) as unknown;
      return typeof value === 'string' && value.trim() ? value.trim() : 'this site';
    } catch {
      return 'this site';
    }
  }

  async function writeOption(pageId: string | null): Promise<void> {
    await prisma.option.upsert({
      where: { key: PRIVACY_POLICY_OPTION },
      create: {
        key: PRIVACY_POLICY_OPTION,
        value: JSON.stringify(pageId),
        group: 'privacy',
      },
      update: { value: JSON.stringify(pageId) },
    });
  }

  /** Validate and select an existing page (or clear the selection). */
  async function setPolicyPage(
    principal: Principal,
    pageId: string | null,
  ): Promise<PrivacyPolicyResult> {
    requireCapability(principal, 'manage_options');
    if (pageId !== null) {
      if (!UUID_PATTERN.test(pageId)) {
        throw new ContentError('VALIDATION_ERROR', 'Select a valid page.', 400);
      }
      const page = await prisma.post.findUnique({
        where: { id: pageId },
        select: { type: true, status: true },
      });
      if (!page || page.status === 'TRASHED') {
        throw new ContentError('NOT_FOUND', 'Page not found.', 404);
      }
      if (page.type !== 'page') {
        throw new ContentError('VALIDATION_ERROR', 'The privacy policy must be a page.', 400);
      }
    }
    await writeOption(pageId);
    return { pageId };
  }

  /**
   * Create a draft privacy-policy page from the suggested template and select
   * it. Going through ContentService keeps slug allocation, validation, hooks
   * and the revision baseline consistent with pages created in the editor.
   */
  async function createPolicyPage(principal: Principal): Promise<PrivacyPolicyCreateResult> {
    requireCapability(principal, 'manage_options');
    const page = await content.createPost(principal, {
      type: 'page',
      title: 'Privacy Policy',
      content: privacyPolicyTemplate(await siteTitle()),
    });
    await writeOption(page.id);
    return { pageId: page.id, page };
  }

  return { createPolicyPage, setPolicyPage };
}

export type PrivacyPolicyService = ReturnType<typeof createPrivacyPolicyService>;
