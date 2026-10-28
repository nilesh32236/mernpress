# Editor model benchmark — 2026-10-28

A small, reproducible comparison of the three zero-cost models used during the
Phase 5 editor mission. The task was deliberately isolated from the repository:
each model received the same specification and wrote its own solution in
`/tmp/opencode/bench/<lane>/`. Outputs were then graded by the orchestrator with
an independent harness.

This is a microbenchmark, not a general model ranking. It measures one
well-specified algorithmic task on one machine.

## Task

Implement `flattenBlocks(blocks: ParsedBlock[]): OutlineItem[]`:

- depth-first pre-order, top-level depth 1;
- `name = blockName ?? 'freeform'`;
- heading blocks with an integer `attrs.level` 1–6 label `H{n}`, freeform
  labels `Freeform`, otherwise the block name;
- strictly iterative (20 000 nested blocks must not overflow);
- must not throw on malformed entries;
- 50 000 blocks must finish well under 2 s;
- tests must run with `node --experimental-strip-types --test`.

Full prompt, solutions and harness: `/tmp/opencode/bench/` (outside the repo).

## Results

Harness: 3 runs per lane, values are averages. Node 24.22.1, single Linux host.
`deep` = 20 000 nested blocks; `wide` = 50 000 top-level blocks; `mixed` =
5 000 parents × 9 children.

| Lane | Model | Tests | Order/labels | Malformed input | Deep ms | Wide ms | Mixed ms |
| --- | --- | ---: | --- | --- | ---: | ---: | ---: |
| beam | `opencode-go/beam-free#high` | 7 | pass | pass | 6.07 | 7.96 | 17.23 |
| deepseek | `opencode-go/deepseek-v4.1-flash#high` | 10 | pass | pass | 3.00 | 4.92 | 4.94 |
| muse | `opencode-go/muse-spark-1.3-contributor#high` | 7 | pass | **fail** | 2.58 | 18.63 | 6.45 |

## Findings

- **deepseek** produced the most complete tests (10), the best balanced timings
  (fastest on wide/mixed, within 0.5 ms of the fastest on deep), and handled
  non-string `blockName` values by normalising them to freeform. Selected as the
  reference behaviour for this benchmark.
- **beam** was correct on the specified malformed cases and fastest on the wide
  tree, but treats a non-string `blockName` as a value rather than normalising
  it. Its test suite covered the required cases with fewer assertions.
- **muse** was fastest on the deep chain, but accepted array entries as blocks
  (an array passes `typeof === 'object'`), producing one extra outline item and
  failing the malformed-input check. Wide-tree flattening was ~3.8× slower than
  deepseek.

## Caveats

- Single machine, three runs, one task. Timing differences under ~5 ms are
  noise; the array-entry defect is a correctness signal, not a timing one.
- All three models were run with `#high` reasoning and the same prompt. Model
  routing is subject to provider load.
- The benchmark code is not part of the product and was not committed.
