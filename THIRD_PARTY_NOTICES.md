# Third-party notices and dependency licence inventory

**Status:** updated 2026-11-17 with a tool-generated scan of all installed
workspace dependencies. This is a catalogue for the owner, not legal advice.
The deduplicated inventory is
`docs/legal/license-inventory-2026-11-17.json`. A GPL distribution review is
still required before publishing (see `docs/legal/compliance-review.md`).

## 1. MERNPress itself

- **Licence:** GPL-3.0-or-later. See the `LICENSE` file in the project root.
- **Chosen by:** the owner, 2026-11-17. Reason: the project can be shared, and a
  copyleft licence stays coherent with the GPL-licensed WordPress editor
  packages the admin actually depends on.
- The name "MERNPress" and this clean-room implementation are the project's own;
  they are not WordPress code.

## 2. Licences confirmed by the project's own audit

Source: `docs/research/reference-codebase-audit.md`, section 9 ("Licensing
observations").

| Material | Licence | How MERNPress uses it | What it means |
| --- | --- | --- | --- |
| WordPress 7.1.3 | GPLv2 or later | Behavioural reference only — no core code copied | Do not copy WordPress source into MERNPress; copying would create GPL obligations |
| `@wordpress/*` packages (block editor) | GPL-2.0-or-later | Real npm dependencies of the admin editor | Using them is normal; distributing a build that bundles them triggers GPL notice and source-offer duties — review before shipping |
| Next.js, Fastify | MIT | Public web app and API framework | Permissive; keep the copyright notices |
| React | MIT | Admin and web UI | Permissive; keep notices |
| Prisma (`prisma`, `@prisma/client`, adapter) | Apache-2.0 | Database client and migrations | Permissive; keep notices and the patent terms |
| CodeGraph | MIT | Developer tooling, telemetry disabled | Permissive; keep notices |
| Zod, `@node-rs/argon2`, Turborepo, TypeScript, ESLint, Prettier, Vitest | Permissive (MIT / Apache-2.0 family) | Validation, hashing, build and test tooling | Confirm each exact licence in the generated inventory |

## 3. Tool-generated licence scan (2026-11-17)

**Command:** `pnpm licenses list --json`, run separately in each workspace —
`apps/api`, `apps/admin`, `apps/web`, `packages/cms-core`, `packages/database`,
`packages/block-system`. A root-only scan is **not** sufficient: `pnpm licenses`
reports the current project's dependencies, so running it at the root misses
workspace-only packages such as `@wordpress/*`. All six scans exited 0. The
results were deduplicated by name+version into
`docs/legal/license-inventory-2026-11-17.json` (**530 unique packages**).

| Licence | Unique packages | Notes |
| --- | ---: | --- |
| MIT | 380 | Permissive; keep notices |
| GPL-2.0-or-later | 60 | All `@wordpress/*` editor/runtime packages |
| Apache-2.0 | 30 | Permissive; keep patent terms |
| ISC | 25 | Permissive |
| BSD-3-Clause | 9 | Permissive |
| BSD-2-Clause | 8 | Permissive |
| MPL-2.0 | 5 | `lightningcss`, `mediabunny` — file-level copyleft |
| LGPL-3.0-or-later | 1 | `@img/sharp-libvips-linux-x64` (native libvips) |
| MIT-0 | 2 | Permissive |
| Unlicense | 2 | `postgres`, `robust-predicates` |
| CC0-1.0 | 1 | Permissive |
| CC-BY-4.0 | 1 | `caniuse-lite` data — attribution required |
| BlueOak-1.0.0 | 1 | `lru-cache` |
| EPL-2.0 | 1 | `elkjs` — weak copyleft |
| 0BSD | 1 | Permissive |
| Apache-2.0 WITH LLVM-exception | 1 | Permissive |
| MIT and ISC | 1 | Dual licence string |
| (MPL-2.0 OR Apache-2.0) | 1 | `dompurify` — use under Apache-2.0 |

No **UNLICENSED**, unknown, AGPL or custom licences were found.

### What the GPL-family entries mean

- The 60 **GPL-2.0-or-later** packages are all `@wordpress/*` editor/runtime
  packages pulled in by `apps/admin`. MERNPress itself is GPL-3.0-or-later,
  which is compatible with a combined distribution; the GPL-2.0 notices and the
  corresponding source must still accompany any build that bundles them.
- The single **LGPL-3.0-or-later** package is `@img/sharp-libvips-linux-x64`, a
  native image library used by the media pipeline. Ship its licence text and
  source/offer with any distribution that includes it.
- `dompurify` reports `(MPL-2.0 OR Apache-2.0)`; choosing Apache-2.0 avoids MPL
  file-level copyleft. `elkjs` (EPL-2.0) and `caniuse-lite` (CC-BY-4.0) carry
  notice/attribution duties that must be included in any distribution.

### Bundle-level check (2026-11-17)

A fresh `pnpm --filter @mernpress/admin build` confirmed the bundling boundary:
`dist/index.html` loads only the 383 kB main chunk, which contains **no**
`@wordpress` string literals. All GPL-family code lives in the lazy
`BlockCanvas-*.js` editor chunk (5.98 MB, plus vips/video-conversion worker
sub-chunks), reached only from the editor route (`ContentEditor.tsx` lazy
import). Every GPL-family package in that chunk is `@wordpress/*` and
GPL-2.0-or-later. The LGPL-3.0-or-later `@img/sharp-libvips-linux-x64` is a
server-side dependency of `apps/api` and `packages/cms-core`, not the admin
bundle. No UNLICENSED or custom-licensed package was found in the admin graph.

**Still outstanding:** supply the required licence texts and source offer with
any distribution, and obtain a GPL distribution review before publishing.
Whether serving compiled JS to browsers counts as "conveying" under the GPL is
the network/ASP question flagged in `docs/legal/compliance-review.md`; get
advice before a public launch.

## 4. Reference material that is NOT part of MERNPress

These were read as references only and must not be copied into this repository.
Each has **no root LICENSE file and no `package.json` licence field**, so treat
them as proprietary/unclear until the owner confirms otherwise:

- `../qrolic-cms-main`
- `../qrolichealth-cms-main`
- `../qrolic-frontend-main`
- `../qrolichealth-main`

Design lessons and independently written implementations are allowed; copying
large source blocks is not (see `AGENTS.md` section 3).

### Local WordPress source copy (`docs/wordpress/`)

A local copy of the WordPress source (7.1.4) is kept at `docs/wordpress/`
strictly as a read-only reference. Unlike the Qrolic archives above, it **is**
licensed: WordPress is GPLv2-or-later and that directory carries its own
`license.txt`. It is nevertheless **excluded from version control** via
`.gitignore` and is not part of any MERNPress distribution. No source from it is
copied into `apps/` or `packages/`. If it were ever distributed, the GPLv2 terms
for that subtree would apply in full.

## 5. Plain-language summary

- You may use and share MERNPress under GPL-3.0-or-later.
- If you ship a build that includes the WordPress editor packages, you must
  honour their GPL terms too — supply the licence text, the corresponding source
  and the required notices. A full package scan tells you exactly which ones
  are included.
- Do not copy code from the Qrolic reference projects; their licensing is
  unclear.
