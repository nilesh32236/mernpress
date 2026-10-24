# OpenCode tooling and model audit

Date: 2026-10-24. Scope: the installed OpenCode environment used for this project.
No credentials, tokens or secret values are recorded here. `auth.json` was never
copied or printed.

## 1. Installed OpenCode

| Item | Observed value | Evidence |
| --- | --- | --- |
| OpenCode version | **2.1.4** | `opencode --version` |
| Config directory | `/home/nilesh/.config/opencode` | `opencode debug paths` / directory listing |
| Main config | `~/.config/opencode/opencode.jsonc` | `opencode debug config` |
| Agent preset | `~/.config/opencode/oh-my-opencode-slim.json` | file |
| Node used by the CLI | v22.23.1 (local) | `node --version` |
| Session/model policy | default `opencode/deepseek-v4.1-flash-free` | `opencode debug config` |
| Config schema | `https://opencode.ai/config.json` | schema keys inspected |

The config uses both the deprecated singular `plugin` key and the v2 `plugins`
key. `opencode debug config` shows they are merged into one ordered list:

1. `superpowers@git+https://github.com/obra/superpowers.git`
2. `opencode-notify`
3. `@upstash/context7-opencode` (v0.2.1)
4. `oh-my-opencode-slim` (v3.0.6)

**No config changes were made in Phase 0.** The merged configuration is valid, and
editing a global config that is currently serving this session would add risk
without a concrete benefit. The duplication is recorded for a safe cleanup in a
later maintenance window.

## 2. Backup evidence

Before any optional tool installation, a timestamped backup of the non-secret
config files was created:

```text
/home/nilesh/.config/opencode/backups/20261024-232029/
  AGENTS.md
  MODELS.md
  cli.json
  oh-my-opencode-slim.json
  opencode.jsonc
  package.json
  tui.json
```

- Directory mode: `700`.
- File mode: `600`.
- `auth.json` and `service.json` were **not** copied (credentials/service state).
- The backup is a point-in-time copy, not a git history.

Rollback: copy the relevant file(s) back from the backup directory, then run
`opencode plugin list` and `opencode mcp list` to confirm the environment. Do not
copy `auth.json` or any secret file.

<a id="installed-tooling"></a>
## 3. Installed tooling

### 3.1 CodeGraph CLI 1.6.2 — installed, not wired

- Source: `@colbymchenry/codegraph` (MIT), installed globally with
  `npm i -g @colbymchenry/codegraph@1.6.2`.
- `codegraph --version` → `1.6.2`.
- Telemetry disabled with `codegraph telemetry off`; the command reported that
  buffered unsent data was deleted.
- It is **not** connected to OpenCode and no project index exists. This was
  deliberate: the new repository has only docs, and indexing the read-only
  reference trees would modify them (`.codegraph/`) or create a misleading index.
- Activation plan (Phase 1, after code exists):

  ```bash
  cd /home/nilesh/Documents/big-project/mernpress
  codegraph init
  codegraph status
  ```

  To wire the MCP server, the non-destructive snippet is:

  ```jsonc
  {
    "mcp": {
      "servers": {
        "codegraph": {
          "type": "local",
          "command": ["codegraph", "serve", "--mcp"],
          "disabled": false,
          "codemode": false
        }
      }
    }
  }
  ```

  Merge it into `~/.config/opencode/opencode.jsonc` (or a project config) only
  after a backup, then verify with `opencode mcp list`. `codegraph install
  --print-config opencode` produces the same snippet without writing files.
- Resource expectation: an index is local; the README claims 100% local operation
  and no code upload. Re-check the telemetry setting after upgrades.
- Uninstall: `codegraph uninstall --keep-cli` removes agent wiring; `npm rm -g
  @colbymchenry/codegraph` removes the CLI. Project indexes are removed with
  `codegraph uninit`.

### 3.2 Context7 — already installed and connected

- Plugin `@upstash/context7-opencode` v0.2.1 is loaded; `opencode mcp list` shows
  `context7 connected`.
- It is used for current library documentation. No paid key is configured.
- `list_mcp_resources` returned no resources; Context7 exposes tools, not MCP
  resources, so this is expected.

### 3.3 gh_grep — connected

- `opencode mcp list` shows `gh_grep connected`.
- Used for read-only public GitHub code search during the audit.

### 3.4 opencode_console — connected

- The OpenCode Console MCP is connected. It was used only to enumerate model
  cost metadata, not to change workspace settings.

### 3.5 GitHub MCP — failed

- `opencode mcp list` shows `github` failed: the configured package
  `@github/github-mcp-server` returns npm 404.
- This does not block research; `gh_grep` works.
- Do not silently rewrite the config. Options for a later maintenance window:
  remove the `github` MCP entry, or point it at a currently published GitHub MCP
  package after checking the official repository. Keep the token in an environment
  variable, never in the config file.

## 4. Model inventory and free-status evidence

`opencode models` lists the models configured for this installation. The OpenCode
model catalog (`tools.opencode.models`) exposes per-model cost metadata. The
following models returned **all-zero input/output/cache cost**:

| Model | Status | Cost evidence | Notes |
| --- | --- | --- | --- |
| `opencode/flint-40b-free` | active | all zero | Generic/small; not selected for code |
| `opencode/beam-free` | active | all zero | Fast; used by the explorer agent preset |
| `opencode/deepseek-v4.1-flash-free` | active | all zero | All-rounder; used for the free-model review |
| `opencode/mimo-v2.6-flash-free` | active | all zero | Image reading; 20k context per local notes |
| `opencode/nemotron-3.5-super-vl-free` | active | all zero | Vision; long context |
| `opencode/big-pickle` | active | all zero | Unknown quality; not used |
| `opencode-go/beam-free` | active | all zero | Same Beam model under the Go provider; higher rate limits per local notes |

The CLI also lists `opencode/glm-5.3-flash-free`,
`opencode/nemotron-3-ultra-free` and `opencode/nemotron-3.5-lightning-free`.
These did not appear in the cost-metadata response (possibly a catalog omission),
but the local `MODELS.md` lists them as free and `glm-5.3-flash-free` was used
successfully for the second review. Treat their free status as **verified by
successful use plus local policy, not by cost metadata**.

Paid/unknown models are present in the catalog (Claude, GPT, Gemini, Grok, Kimi,
Qwen, MiniMax, Mistral, OpenRouter routes). **None were called or configured for
this project.** No paid API key was added. A model being listed is not evidence
that it is free; the cost metadata is the check.

Limitations:

- Context windows differ. The local `MODELS.md` notes a 20k context cap for
  several free models; that is too small for large repository audits. The
  explorer agent preset uses `opencode/beam-free` for read-only searches.
- Free models can be rate-limited or changed by the provider. Record the model ID
  and date for any research claim.
- The model catalog can omit entries; cross-check `opencode models` with the cost
  metadata before relying on a "free" label.

## 5. Free-model cross-check for architecture decisions

Two distinct free models were asked the same three questions with no tools and no
repository access (to avoid contaminating the comparison):

- `opencode/deepseek-v4.1-flash-free`
- `opencode/glm-5.3-flash-free`

Results:

| Decision | DeepSeek | GLM | Final | Adjudication |
| --- | --- | --- | --- | --- |
| API | Fastify 5 | NestJS 12 + Fastify | Fastify 5 | Solo project; domain plugins are not HTTP plugins; services stay framework-agnostic |
| ORM | Drizzle | Drizzle | Prisma 7.10.1 | Prisma is stable, migrations/docs stronger; Drizzle is 0.x. Dissent recorded; Drizzle remains the fallback |
| Frontend | React Router 7 | React Router 7 | Next.js 16 | Incumbent knowledge + SEO/image ecosystem; theme components kept framework-agnostic. Dissent recorded |

Both models flagged version uncertainties (Nest/Fastify majors, Prisma 8 RC,
Drizzle 1.0, Next self-hosting/caching). Those were checked against the npm
registry and official docs; see [stack-comparison.md](stack-comparison.md#12-free-model-cross-check).
The agreement on Drizzle/React Router is a real signal and is why those options
are documented as fallbacks rather than dismissed.

## 6. Evaluated but not installed

### 6.1 opencode-mem 2.33.0 — skipped

Repository: `tickernelz/opencode-mem` (MIT, active, ~1.8k stars at audit time).
It provides local persistent memory with Turso/libSQL vector search, local
embedding models, auto-capture and a web UI.

Why it was skipped in Phase 0:

- **Runtime/platform:** the README recommends Bun; Bun is not installed on this
  machine. Linux is CI-tested (this machine is Linux); Intel macOS is explicitly
  unsupported. Storage defaults to `~/.opencode-mem/data` (with an embedding cache
  under it); optional AES-256-GCM encryption is available.
- **Resources:** local embeddings need roughly 0.5–2 GB RAM while loaded, and the
  model cache is hundreds of MB to ~2 GB per model. This is disproportionate for a
  docs-only phase.
- **Privacy:** auto-capture requires a configured AI provider. Even with a free
  local model, memory content and profiles are stored on disk; the master prompt
  requires the repository to be the source of truth, not a memory store.
- **Value:** there is no code or session history yet to remember. The docs already
  capture the decisions.

It is a reasonable optional addition later, project-local, with
`databaseEncryptionEnabled: true` and a clear retention policy. Do not make it the
only copy of any decision. If installed, pin the version, verify the TUI companion,
and test a fresh session plus a restart.

### 6.2 CodeGraphContext — skipped

Repository: `CodeGraphContext/CodeGraphContext` (MIT, active). It is a Python/PyPI
MCP server and CLI that indexes code into a graph database (Neo4j or SQLite
backends). It overlaps with CodeGraph, adds a Python runtime and a graph database
decision, and would create a second index. CodeGraph is the smaller, local-first
choice for this project. Revisit only if CodeGraph's TypeScript coverage proves
insufficient.

### 6.3 Playwright MCP — skipped

Playwright will be a project dev dependency (Phase 1/5) with committed tests. A
global browser MCP would duplicate that and add a second browser-automation
surface. Use the project's Playwright suite and, if needed, a local MCP later.

### 6.4 Context7 — kept

Already installed and free in this setup; no additional install was needed. It is
used for current library docs, not as a source of truth for project decisions.

## 7. Disable / rollback

| Tool | How to disable/remove | Notes |
| --- | --- | --- |
| CodeGraph CLI | `codegraph uninstall --keep-cli` (agent wiring) then `npm rm -g @colbymchenry/codegraph`; `codegraph uninit` per project | No project index exists yet; telemetry already off |
| Context7 | Remove `@upstash/context7-opencode` from the `plugins` list after a backup; restart OpenCode; verify with `opencode plugin list` | Already installed before Phase 0; no config change made |
| superpowers / opencode-notify / oh-my-opencode-slim | Remove from `plugins` after a backup; restart | Do not remove during an active session unless required |
| GitHub MCP | Remove the `github` entry from `mcp.servers` or fix its package; keep the token in an env var | Currently fails with npm 404; gh_grep is the working alternative |
| opencode-mem | Not installed; no rollback needed | If added later, remove the plugin entry and delete `~/.opencode-mem/data` after exporting anything you need |
| Config restore | Copy the desired file(s) from `~/.config/opencode/backups/20261024-232029/` back; verify with `opencode plugin list` and `opencode mcp list` | Never copy `auth.json`/`service.json` from a backup |

Resource notes:

- CodeGraph: the npm package installed two packages; no index or background
  process is running. Index size/CPU depends on the repository and will be
  measured in Phase 1 if it is enabled.
- Context7/gh_grep/console: existing plugins/MCPs; no new local service.
- opencode-mem: would add 0.5–2 GB RAM while embeddings are loaded plus a
  hundreds-of-MB to ~2 GB model cache; not installed.

## 8. Verification checklist

Run these after any OpenCode tooling change:

```bash
opencode --version
opencode plugin list
opencode mcp list
opencode debug config | head -40
codegraph --version
codegraph status
```

Expected current state:

- OpenCode 2.1.4.
- Plugins: opencode-notify, context7 0.2.1, oh-my-opencode-slim 3.0.6, superpowers.
- MCP: context7 connected, gh_grep connected, opencode_console connected, github
  failed (known 404).
- CodeGraph 1.6.2 installed; not initialized in this repository.

## 9. Safety and privacy notes

- No credentials were printed, copied or committed. The backup excludes
  `auth.json` and `service.json`.
- CodeGraph telemetry was explicitly disabled. Re-check after upgrades.
- `opencode-mem` was not installed, so no project content is being embedded or
  stored outside the repository.
- The free models used for cross-checking received only the architecture question,
  not repository contents or secrets.
- Global config changes are out of scope until a maintenance window; any change
  must start with a new timestamped backup and end with `opencode plugin list` /
  `opencode mcp list` verification.

## 10. Sources

- Local commands and config inspection on 2026-10-24.
- [opencode-mem](https://github.com/tickernelz/opencode-mem), README and GitHub
  metadata, accessed 2026-10-24.
- [CodeGraph](https://github.com/colbymchenry/codegraph), README, telemetry section
  and GitHub metadata, accessed 2026-10-24.
- [CodeGraphContext](https://github.com/codegraphcontext/codegraphcontext), README
  and GitHub metadata, accessed 2026-10-24.
- [OpenCode plugins documentation](https://opencode.ai/docs/plugins/), accessed
  2026-10-24.
