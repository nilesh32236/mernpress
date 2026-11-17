# Legal and compliance review — MERNPress

Date: 2026-11-17. Owner-facing. **Not legal advice** — this is a risk register and
a checklist, so a lawyer can be briefed with the right questions if needed.

## 1. In plain words

MERNPress is your own clean-room content management system, written in TypeScript
and inspired by WordPress. It is **not** WordPress and contains no WordPress
source code. The main legal points are:

1. **You now have a licence.** MERNPress is GPL-3.0-or-later (see `LICENSE`).
   Before this review there was no licence at all, which blocked sharing.
2. **The editor uses WordPress pieces.** The admin bundles official `@wordpress/*`
   packages, which are GPL-2.0-or-later. Sharing a build that contains them means
   honouring their GPL terms as well. This needs a real dependency scan first.
3. **The reference projects are not yours to copy.** The Qrolic projects have no
   clear licence; only independent implementations and design lessons were used.
4. **No compliance certification is claimed.** The project does not make GDPR,
   HIPAA, PCI or SOC 2 claims. What you put in it, and where you host it, remain
   your responsibility.

## 2. What was checked

| Area | Evidence | Finding |
| --- | --- | --- |
| Project licence | `README.md` "Licensing status"; no `LICENSE` or `license` field existed | Gap closed for MERNPress itself: GPL-3.0-or-later chosen and written |
| Reference material licences | `docs/research/reference-codebase-audit.md` §9 | WordPress GPLv2+; `@wordpress/*` GPL-2.0+; Qrolic references unclear — do not copy |
| Dependency inventory | `THIRD_PARTY_NOTICES.md` §3 and `docs/legal/license-inventory-2026-11-17.json` | Done: 530 unique packages scanned across all 6 workspaces on 2026-11-17; 60 GPL-2.0-or-later (`@wordpress/*`), 1 LGPL-3.0-or-later (`@img/sharp-libvips-linux-x64`), no UNLICENSED/unknown. Bundle-level GPL check and distribution review still outstanding |
| Data protection | `docs/security/threat-model.md` §8 and §11 | No HIPAA/GDPR/PCI claim; pseudonymous audit IDs; no automated privacy tooling |
| Security claims | `docs/security/threat-model.md` §11 | No "production-secure" claim, no pen test, no plugin sandbox, no WAF |
| Distribution readiness | `README.md` licensing note; `THIRD_PARTY_NOTICES.md` §3 | Scan and bundle-level GPL check done; still need licence texts, source offer and GPL distribution review before publishing |

## 3. The GPL position, explained simply

- **GPL-3.0-or-later for MERNPress** means anyone can use, change and share it,
  provided they keep the same licence and make source available when they
  distribute it.
- **Why this choice:** the editor already depends on GPL-licensed WordPress
  packages. Choosing a compatible copyleft licence for the whole project keeps
  the obligations consistent. A permissive licence such as MIT would be simpler,
  but would sit awkwardly beside bundled GPL code. If you later want a
  permissive proprietary product, the GPL editor dependency has to be revisited
  first.
- **Source-offer duty:** if you give someone a compiled build, you must also
  give them (or a written offer for) the corresponding source. For a web app the
  details depend on how it is served; get advice before a public launch.

## 4. Privacy and data protection

- The CMS stores user accounts, sessions, content and audit events. Audit and
  rate-limit identifiers are **pseudonymous, not anonymous** — a database plus
  the secret pepper can link activity to keys (threat model §8).
- There is **no GDPR data-export/erasure workflow**, no consent tooling, and no
  HIPAA/GDPR/PCI certification. Do not store regulated personal or health data
  without a separate review.
- Practical steps for an operator: collect only the data you need, set a
  retention policy for content and audit logs, protect the database and the
  pepper, use HTTPS, and publish a privacy notice appropriate to your audience.
- If you serve people in the EU/UK or handle health data, brief a lawyer with
  `docs/security/threat-model.md` and the list of data the app stores.

## 5. Security statements you must not overclaim

From `docs/security/threat-model.md` section 11, the model does **not** claim to:
make MERNPress "production-secure"; certify HIPAA, GDPR, PCI or SOC 2; sandbox
plugins/themes; or replace a professional security review. There is no WAF/DDoS
protection, no 2FA/password-reset/SSO, no malware scanning of uploads, no formal
penetration test and no automated backup/restore UI. Say what it does, not more.

## 6. Before you publish — checklist

- [x] Choose and write a project licence (`LICENSE`, GPL-3.0-or-later).
- [x] Record known third-party licences (`THIRD_PARTY_NOTICES.md`).
- [x] Run a full dependency licence scan after `pnpm install` and save the JSON
      (`docs/legal/license-inventory-2026-11-17.json`, 2026-11-17).
- [x] Confirm which GPL packages are actually bundled in the editor route
      (2026-11-17 build audit): every GPL-family package in the admin browser
      bundle is a `@wordpress/*` package (GPL-2.0-or-later), all inside the lazy
      `BlockCanvas` editor chunk; the 383 kB main bundle contains none. The
      LGPL libvips/sharp code is server-side only, not in the admin bundle.
- [ ] Provide licence texts and the required notices/source offer with any build.
- [ ] Confirm the licence of every image/font/asset you add later; use your own
      or clearly licensed placeholders.
- [ ] Decide the audience and applicable privacy regime; write a privacy notice.
- [ ] Do a backup/restore drill and a dependency security audit before launch.
- [ ] Keep design references independent; do not copy Qrolic source.

## 7. What could not be verified here

- The dependency scan was run on 2026-11-17 under Node 24.22.1 across all six
  workspaces (see `THIRD_PARTY_NOTICES.md` §3). It reflects the currently
  installed lockfile; a fresh scan is needed after any dependency change.
  Bundle-level GPL presence and source-offer packaging were not verified here.
- No legal advice was given. This document records what the project's own
  evidence says and what a professional review would need to cover.
- The exact set of GPL packages in the final built admin bundle depends on the
  build output, which was not produced in this environment.

## 8. Hobby-project status, naming and trademarks

- **MERNPress is a hobby/learning project, not a professional product.** It is
  maintained in the owner's free time, with no warranty, support contract, SLA,
  security certification or professional security review. A green build or test
  run is not a production-security claim. Do not store regulated, confidential
  or sensitive personal data in it without a separate review.
- **Canonical name:** MERNPress. Informal variants such as "meanpress" or
  "mearnpress" are not used in code, package manifests or documentation.
- **No affiliation:** MERNPress is not affiliated with, endorsed by, sponsored
  by or connected to WordPress or Automattic. "WordPress" is a trademark of its
  respective owner. It is used in this repository only to describe the
  behavioural reference and the features MERNPress deliberately resembles.
- **Naming risk:** the suffix "Press" is common in CMS names. Keep the
  unaffiliated statement visible in the README, use only the MERNPress name and
  wording in the admin and public site, and do not copy WordPress branding or
  trade dress. This reduces, but does not legally eliminate, confusion risk.
- **Local WordPress source copy:** `docs/wordpress/` holds a local copy of the
  WordPress source for reading and comparison only. It is GPLv2-or-later and its
  own `license.txt` applies to that directory. It is listed in `.gitignore` and
  must not be committed, copied into application code, or shipped as part of a
  MERNPress distribution. If a distribution ever included it, the GPLv2 notice
  and source obligations for that subtree would apply in full.
- This section is a risk register, not legal advice.
