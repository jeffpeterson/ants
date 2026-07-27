# Historical colony benchmarks

This document defines how to compare historical algorithm families without confusing
algorithm behavior with graph generation, resource changes, or measurement drift. It
also records one exploratory, read-only screen that motivated a larger experiment.

The screen is evidence about specific revisions under a narrow protocol. It is not a
claim that one family is universally better, and it did not reproduce a 50-fold
throughput difference.

## Benchmark contract

Historical modules cannot be passed directly to the current evaluator. Graph recipes,
parameter names, ant state, pheromone storage, random-seed handling, and event payloads
all changed. A benchmark adapter must provide this revision-independent interface:

```text
adapter = {
  id,
  revision,
  defaults,
  initialize({ graph, graphSeed, runSeed, resources }),
  step(state, dt),
  moveFood(state, source, destination),
  observe(previous, next)
}
```

Every adapter must satisfy the following requirements:

1. **Accept a graph snapshot.** The benchmark owns the nodes, edges, lengths, sorted
   adjacency, edge lookup, hill, and food locations. A family may not regenerate or
   reinterpret the graph.
2. **Keep resources external.** Ant count `N` and physical speed `v` are benchmark
   resources, not tunable algorithm parameters. Every comparison uses the same values.
3. **Retain family defaults.** All behavioral settings come from the revision being
   tested. Current sanitization must not fill, drop, or rename historical settings.
   Parameters with similar names but different semantics are not interchangeable.
4. **Separate random streams.** `graphSeed` selects the shared graph. `runSeed`
   initializes colony decisions and ant roles. An adapter advances `runSeed` through any
   family-specific initialization draws, such as permanent scout assignments.
5. **Initialize native state shapes.** Ant state and empty pheromone fields must match
   the family: undirected edges, directed arcs, nested scalar fields, or flat scalar
   fields. Missing keys must not be synthesized lazily during the run.
6. **Preserve transition semantics.** `step` and `moveFood` call the historical
   implementation. Observation code must not consume randomness, change choices, or
   mutate simulation state.
7. **Expose comparable observations.** At minimum, the adapter reports discoveries and
   deliveries. Homing and cycle-efficiency comparisons also require ant identity, pickup
   food, pickup time, delivery time, outbound distance, and total traveled distance.
8. **Prove instrumentation neutrality.** For revisions without public cycle events, an
   instrumented build is acceptable only when stripping observations after every step
   produces the same simulation state as the uninstrumented module for deterministic
   test runs.
9. **Record provenance.** Every result includes the algorithm revision, graph snapshot
   recipe or hash, behavioral parameters, resources, graph and run seeds, time step,
   horizons, adapter version, and metric version.

Using a very small time step to infer pickup and delivery transitions is not a
substitute for event instrumentation. On large graphs, a short edge can permit multiple
crossings within one browser frame and conceal intermediate state transitions.

## Two graph lanes

The experiment has two intentionally separate lanes.

### Common current-graph lane

Generate each graph once with the current graph generator, freeze the snapshot, and give
that same snapshot to every family adapter. This lane answers:

> How do the algorithms compare on the maps the current playground must handle?

It is the only lane used to rank historical algorithms for present use. The graph
generator consumes only `graphSeed`; algorithm initialization begins from the
independent `runSeed`.

### Native graph lane

Let each revision generate its own graph from its own defaults and seed. This lane
answers:

> Can we reproduce the behavior and feel of that historical version?

It diagnoses interactions between an algorithm and the topology for which it was
written. It cannot rank revisions because the routes, edge counts, bottlenecks, shortest
distance, and sometimes graph-size limits differ. Native-lane results must never be
pooled with common-lane results.

## Algorithm milestone manifest

These revisions identify structural families, not merely parameter presets:

| Revision  | Family                           | Relevant semantics                                                                                                                                                                                        |
| --------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `d83ab83` | Initial edge trails              | Permanent scout scores; slow pheromone on undirected edges; fast pheromone on directed arcs; original grid-like graph recipe.                                                                             |
| `1347975` | Coherent breadcrumb return       | Loop-erased personal route and strictly decreasing return index; directed slow and fast arcs; carrier pheromone choices are restricted to earlier personal breadcrumbs.                                   |
| `48495cd` | Temporary corrective exploration | Replaces the permanent scout caste with temporary search states while retaining loop-erased routes, exact backtracking, and monotone carrier return.                                                      |
| `3d6fd02` | Short-route breadcrumbs          | Sends the whole colony on finite initial discovery tours; uses one-junction corrective probes, short-edge weighting, distance-scaled reinforcement, and monotone breadcrumb return.                       |
| `97a4679` | First scalar gradients           | Removes route and visited memory; derives navigation from scalar node/edge levels and local gradients; carrier return no longer has the breadcrumb invariant.                                             |
| `0cb8c83` | Configurable scalar navigation   | Introduces time-based temporary scouting and separate outbound/homebound local signal controls on the island-era graph recipe.                                                                            |
| `aa002b9` | Cycle observations               | Adds an independent colony `runSeed`, public `lastEvents`, ant IDs, and delivery distances needed by the current cycle evaluator. It is an instrumentation milestone rather than a new navigation family. |
| `a36bbb6` | Optimized scalar baseline        | Promotes the optimized node-trail defaults on the current varied connected-graph recipe. This is the baseline used by the exploratory screen below.                                                       |
| `29e6d75` | Recorded optimized baseline      | Documentation-only descendants leave the `a36bbb6` simulation behavior unchanged through this revision.                                                                                                   |
| `530a042` | Purposeful scouting and homing   | Prioritizes uncharted local options during scouting and removes the food field from default carrier homing. It postdates the exploratory screen.                                                          |
| `89fbab4` | Independent simulation rate      | Adds a complete-clock playback-rate control on top of `530a042`. This revision has not yet been measured by the historical protocol.                                                                      |

The breadcrumb families are valid local-memory algorithms, but they are structurally
different from the current pheromone-only model, whose invariant forbids route and
visited state. A benchmark may compare those families without treating one as a
parameter preset for the other.

## Hypotheses for the full experiment

These hypotheses apply to the next benchmark and must be retained unchanged through its
browser-fidelity and adaptation stages. They were written after the exploratory screen,
so they are not predictions of that already observed result.

1. On common current graphs, `3d6fd02` will have higher steady throughput and cycle
   efficiency than scalar-gradient families because successful carriers cannot wander
   away from their outbound route and one-junction probes have exact error correction.
2. `1347975` will have lower discovery throughput than `3d6fd02` because only its
   permanent scouts initially search, but its strictly decreasing return index will
   produce similarly high homing reliability after pickup.
3. The breadcrumb advantage will be largest on sparse, irregular, and larger graphs,
   where a scalar hill field is more likely to contain weak sections or local maxima.
4. Native-lane gaps will be smaller than common-current-graph gaps because each
   historical graph recipe co-evolved with its navigation rules.
5. Scalar families may retain an adaptation advantage after food moves because they do
   not require an outbound ant to possess a complete personal route before reinforcing a
   new source. This must be measured rather than inferred from the static screen.
6. A `0.25 s` screening step will preserve broad rankings but not precise effect sizes.
   Any promoted result must survive the browser's `1/60 s` step.
7. The reported 50-fold gap may occur on a particular graph, run seed, or early visual
   window where the scalar baseline makes very few deliveries. The preregistered
   aggregate prediction is only that a material paired gap exists; no 50-fold aggregate
   effect is assumed.

## Metrics

Let:

- `L*` be the shortest hill-to-food distance on the shared graph;
- `v` be ant speed;
- `N` be ant count; and
- `u = L* / v` be one ideal one-way travel time.

Report each measure independently:

1. **Visible-window deliveries** — raw deliveries and deliveries per second over the
   exact elapsed-time window used to reproduce a playground observation.
2. **Discovery latency** — time to first pickup, expressed in `u`.
3. **Normalized steady throughput (`Q`)** — deliveries per second divided by the
   physical bound `Nv / (2L*)`.
4. **Cycle efficiency (`E`)** — mean `2L* / totalDistance` for completed cycles.
5. **Homing reliability (`H`)** — fraction of eligible pickups delivered within `8u`.
6. **Adaptation** — rediscovery latency, binned post-move throughput, and recovered late
   throughput after food moves without resetting ants or pheromone.
7. **Failures** — no pickup, no delivery, no post-move delivery, invalid state, and
   overdue cargo.
8. **Engineering cost** — simulation CPU time and peak memory, reported separately from
   colony effectiveness.

The static run lasts `32u`, with steady throughput measured over `[20u, 32u]`. With
`N = 64`, that window's physical denominator is:

```text
12u · Nv / (2L*) = 6N = 384 deliveries
```

Thus `Q` is exactly `steadyDeliveries / 384` under the screening resources. Raw counts
remain in every report so normalization cannot conceal a large practical difference. For
paired ratios, report the numerator and denominator when either is zero rather than
adding a pseudocount or claiming an infinite effect.

## Staged protocol

### 0. Adapter conformance

- Validate graph connectivity, endpoints, edge lengths, pheromone keys, ant count, and
  speed before stepping.
- Run deterministic purity and finite-value checks.
- Verify adapter observation against cumulative discovery and delivery counters.
- For instrumented historical builds, compare stripped state with the uninstrumented
  module after every step.

### 1. Reproduce the reported gap

Capture the exact playground graph snapshot, hill, food, behavioral settings, graph
seed, run seed, elapsed-time window, and simulation time step. Compare `3d6fd02`,
`1347975`, the screened optimized scalar baseline, and current main on that snapshot.

Report both the user's visible window, such as `[0 s, 30 s]`, and the normalized
`[20u, 32u]` steady window. Repeat with ten paired run seeds. This stage determines
whether the observed 50-fold difference is reproducible and whether it is an early-run
or steady-state effect.

### 2. Fast common-graph screen

Run the six seeded screening graphs with five independent colony seeds per graph at
`dt = 0.25 s`. Rank on paired throughput differences and ratios, while retaining
discovery and failure rates. Report mean, median, tenth percentile, per-scenario values,
and win rate. Do not use the aggregate optimization score to decide whether a throughput
regression exists.

Run the same revisions in the native lane as a reproduction check, but do not combine or
rank its results with the common lane.

### 3. Browser-fidelity validation

Advance the leading structural families to the 24 validation graphs with at least five,
preferably ten, fresh paired run seeds per graph at `dt = 1/60 s`. Use paired bootstrap
intervals over graph and run-seed units for absolute differences and positive
log-ratios. Retain per-map results and the worst decile.

### 4. Homing and adaptation

After exact cycle-event adapters pass conformance, run the full static scorecard. In a
separate branch of each trace, move food at `24u` to the same benchmark-selected
destination and continue for `24u` without resetting ants or trails. Report old-food
cargo separately.

### 5. Stress and attribution

Test common 8-, 300-, and 1,200-node boundary graphs spanning sparse, dense, regular,
and high-variation cases. Audit `0.25 s` against `1/60 s`.

Only after the family gap is confirmed should hybrid implementations isolate:

- breadcrumb return on versus off;
- directed arcs versus scalar signals;
- finite one-junction exploration versus time-based random walks; and
- historical versus current parameter sets.

That factorial comparison is needed to attribute causality. A comparison between two
whole commits cannot by itself separate route memory, pheromone representation,
exploration policy, graph recipe, and tuning.

## Exploratory six-scenario quick screen

The following read-only screen loaded each historical `src/colony.js` directly from Git
and initialized its native ant and pheromone state around a frozen current-graph
snapshot. It used the exact six screening scenario graph seeds and graph parameters, one
paired run seed per scenario, `N = 64`, `v = 0.17`, `dt = 0.25 s`, and the `[20u, 32u]`
steady window.

The “optimized scalar” row is revision `a36bbb6`, whose simulation behavior is unchanged
through `29e6d75`. Later revisions `530a042` and `89fbab4` were not screened and do not
inherit these measurements.

| Revision  | Family                           |  Mean `Q` |       Range | No-delivery scenarios |
| --------- | -------------------------------- | --------: | ----------: | --------------------: |
| `3d6fd02` | Short-route breadcrumbs          | **0.858** | 0.789–0.917 |                   0/6 |
| `1347975` | Coherent breadcrumb return       | **0.737** | 0.682–0.867 |                   0/6 |
| `48495cd` | Temporary corrective exploration |     0.658 |     0–0.846 |                   1/6 |
| `97a4679` | First scalar gradients           |     0.407 | 0.003–0.826 |                   0/6 |
| `a36bbb6` | Optimized scalar baseline        |     0.350 | 0.057–0.612 |                   0/6 |
| `0cb8c83` | Configurable scalar navigation   |     0.179 | 0.026–0.339 |                   0/6 |
| `d83ab83` | Initial edge trails              |         0 |         0–0 |                   6/6 |

Across these six scenarios, the ratio of mean throughput for `3d6fd02` to the screened
optimized scalar baseline was:

```text
0.858 / 0.350 = 2.45
```

The largest observed paired gap was screening scenario 14, a sparse 160-node graph:
`3d6fd02` completed 330 steady-window deliveries (`Q = 0.859`), while `a36bbb6`
completed 22 (`Q = 0.057`). That fixture shows a 15-fold delivery difference, not a
50-fold difference.

A separate native-lane smoke fixture at default seed 1837 produced `Q = 0.818` for
`3d6fd02` and `Q = 0.781` for `a36bbb6`; even `d83ab83`, which made no delivery on the
common current graphs, produced `Q = 0.784` on its native graph. Those values are not a
cross-revision ranking. They demonstrate that graph compatibility can reverse the
apparent result and justify keeping the two lanes separate.

## Comparability limits

- **The exploratory screen has one run seed per graph.** It can identify large candidate
  regressions but cannot estimate stochastic uncertainty.
- **It uses the screening time step.** Precise values and rankings require `1/60 s`
  validation.
- **It measures static throughput only.** It does not establish comparative homing,
  adaptation, or cycle efficiency.
- **The latest main behavior is unmeasured.** Results for `a36bbb6`/`29e6d75` must not
  be relabeled as results for `530a042` or `89fbab4`.
- **Historical defaults are part of each family.** The screen does not isolate structure
  from tuning.
- **Random choices cannot be synchronized draw-for-draw.** Families consume randomness
  differently. Pairing means common starting seeds and repeated scenarios, not identical
  subsequent random values.
- **Boundary inventory affects finite windows.** Throughput windows may contain ants
  whose pickup preceded the window. Reports must use one declared boundary policy for
  every family.
- **Graph generators are not algorithms under test in the common lane.** Native-lane
  differences may be useful for reproduction but cannot support algorithm rankings.
- **Adapter correctness is a prerequisite.** A family failing on a common graph may be
  incompatible with that topology, incorrectly initialized, or behaviorally weak.
  Conformance and native reproduction must distinguish those cases.
- **Simulation cost is not colony throughput.** Faster code and more food deliveries are
  separate measurements.

The quick screen therefore justifies a controlled historical benchmark and identifies
`3d6fd02` and `1347975` as the first families to validate. It does not establish a
50-fold aggregate regression or authorize replacing the current local-knowledge model
without the staged comparisons above.
