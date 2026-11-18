# How to improve MERNPress next — owner review, November 2026

This is a shortlist for **you**, not a work order. Each item says what it would
give you, where the evidence came from, and roughly how big it is. The repository
rule is one slice at a time with your approval, so please pick one to start.

## Where things stand

MERNPress already covers a lot: sign-in and roles, posts and pages, a WordPress-style
admin, a block editor, media with image processing, public pages with SEO, revisions,
preview and scheduled publishing. See `TASKS.md` and
`docs/design/capability-gap-matrix.md`. The items below are what is still missing or
weak, ordered by value to you rather than by code.

## Priority list

| # | Improvement | What it gives you | Evidence | Size |
| --- | --- | --- | --- | --- |
| 1 | **Finish the legal package** (licence scan + notices) | Confidence to share or deploy without a licensing surprise | `docs/legal/compliance-review.md`, `THIRD_PARTY_NOTICES.md` | Small |
| 2 | **Password reset by email + two-factor sign-in** | Accounts can be recovered and protected; today a lost admin password needs a manual recovery procedure | threat model §8; `TASKS.md` P2-06 | Large (needs email delivery) |
| 3 | **Backup / restore button and drill** | Protect your content before anything goes wrong; currently an operator runbook only | threat model §8, pre-deploy gate `X-01` | Medium |
| 4 | **Audit-log screen** — **done 2026-11-17 (D-154)** | Administrator-only `/admin/audit` + `GET /api/admin/audit` over the 14 recorded auth/user events; deny-by-default metadata. Content-change auditing is still absent | capability gap §4, item 3 | Small–medium |
| 5 | **Public archive, category/tag and search pages** | Readers can browse and find old posts; today the public site is mostly home, single posts and pages | capability gap §5, remaining gaps 6 | Medium |
| 6 | **Theme system / visual customisation** | Change how the site looks without editing code | `TASKS.md` Phase 10; gap §5 "Theme system" | Large |
| 7 | **Better media workflow** (where-used view + a proper media picker in the editor) | Reuse and replace images without guesswork | gap §2 "Usage tracking", remaining gap 1 | Medium |
| 8 | **Automatic dependency updates and security checks** | Known vulnerabilities are flagged without you watching | `TASKS.md` X-03 | Small |
| 9 | **Comments and site menus** | Reader interaction and editable navigation | `TASKS.md` P11-01/P11-02 | Large |
| 10 | **Scheduled-publishing updates to existing posts** | Change the publish time after a post exists, not only on first publish | `TASKS.md` P8-04, ADR 0008 §4 | Medium |

## Two notes on the current state

- The capability-gap matrix (dated 2026-10-29) lists bulk actions, autosave UI and
  some editor pieces as partial, while `TASKS.md` lists parts of them as done at a
  similar date. Verify the actual behaviour in the running app before treating
  those as outstanding.
- "Improvement" here does not mean "rewrite". Most items build on what already
  exists — for example, the audit-log screen only needs a view over recorded
  events.

## Suggested next slice

Start with **item 1** (legal scan) because it is small and removes a real
blocker to publishing, then **item 4** (audit-log screen) as a first, contained
feature that adds visible value. Do not start items 2 or 6 until you have decided
the audience, data and hosting model.

## What this review deliberately did not change

No new feature phase was started, no dependencies were installed or upgraded, and
no existing source code was rewritten. The additions were the project licence,
the third-party notices, the compliance review and this shortlist — plus small
documentation updates so the README and decision log agree with the new licence.
