# Colony evaluation and optimization

This document fixes the evaluation criteria and working hypotheses before the automated
parameter search. Results belong in a separate section so predictions remain
distinguishable from observations.

Hypotheses were locked on 2026-07-26, before evaluating candidate configurations.

## What effectiveness means

Graph shape, ant count, and speed are environmental resources, not algorithm quality.
Optimization therefore holds ant count and speed fixed and evaluates every candidate on
the same seeded maps. Let:

- `L*` be the shortest hill-to-food distance;
- `v` be ant speed;
- `N` be ant count; and
- `u = L* / v` be one ideal one-way travel time.

The scorecard has five independently reported dimensions:

1. **Discovery (`D`)** — how quickly any ant reaches food. Full credit is near `u`; no
   discovery by `8u` receives zero.
2. **Throughput (`Q`)** — steady deliveries per second divided by the physical upper
   bound `Nv / (2L*)`.
3. **Cycle efficiency (`E`)** — mean `2L* / (outbound distance + return distance)` over
   completed food cycles.
4. **Homing reliability (`H`)** — the fraction of pickups delivered within `8u`,
   excluding pickups too near the end of a run to observe fairly.
5. **Adaptation (`A`)** — after food moves without a reset, a geometric combination of
   rediscovery speed, delivery throughput over time, and recovered late throughput.
   Old-food cargo is tagged and excluded.

A static scenario runs for `32u`; throughput is measured over `[20u, 32u]`. A moving
food scenario warms for `24u`, moves food to a topologically distant node of comparable
hill distance, then runs for another `24u`.

Each dimension is aggregated across maps as:

```text
robust(values) = 0.7 · mean(values) + 0.3 · tenthPercentile(values)
```

The optimization ranking is:

```text
100 · D^0.15 · Q^0.25 · E^0.20 · H^0.15 · A^0.25
```

Failures remain visible and apply multiplicative penalties: no pickup, no delivery, no
delivery after food moves, invalid state, or more than 10% overdue cargo. The full
metric vector and per-scenario observations are retained; the total is never the only
reported result.

Training uses balanced map sizes, densities, and variation levels. Promotion requires
improvement on disjoint held-out maps and a separately reported boundary stress suite.
Candidate ranking uses common random seeds. Screening may use a larger fixed time step
only after a time-step audit; final validation uses the browser's `1/60 s` step.

## Preregistered configuration hypotheses

The point prediction below is intentionally specific. It is a hypothesis, not a new
default:

| Parameter                      | Current | Predicted best | Reason                                                                                                     |
| ------------------------------ | ------: | -------------: | ---------------------------------------------------------------------------------------------------------- |
| Enter scouting                 |    0.02 |           0.03 | A small continuing exploration budget should repair stale routes without dissolving recruitment.           |
| Stop scouting                  |  0.12/s |         0.16/s | Multi-edge random walks should last long enough to leave a branch but usually rejoin a discovered trail.   |
| Persistent bias while scouting |       0 |           -1.2 | Mild avoidance should spread search traffic into less-covered branches.                                    |
| U-turn weight                  |    0.18 |           0.15 | Immediate reversals waste distance, but a nonzero escape probability prevents trapping.                    |
| Straight-ahead bias            |     1.6 |            1.2 | Local geometry is useful, but a strong heading preference can skip a good side branch.                     |
| Short-edge bias                |     1.0 |            1.3 | Short edges should increase lap frequency and favor shorter routes without becoming deterministic.         |
| Outbound food pull             |     3.2 |            4.0 | Once a route exists, moderate concentration-following should produce stable recruitment.                   |
| Outbound food polarity         |       0 |           -1.5 | Carrier deposits are fresher nearer the hill, so descending the local food gradient may point toward food. |
| Homebound food pull            |     1.0 |            0.5 | Food concentration is expected to be less reliable than the hill-sourced persistent field for homing.      |
| Homebound persistent pull      |     8.0 |            8.0 | Strong attraction to the shared hill field should reduce return wandering.                                 |
| Homebound food polarity        |       0 |              0 | Food slope may conflict with homing and is predicted to add little.                                        |
| Homebound persistent polarity  |     4.0 |            4.0 | The persistent field attenuates away from the hill, making a strong climb locally meaningful.              |
| Persistent half-life           |    42 s |           70 s | The hill field should survive long enough to cover large maps and bridge sparse traffic.                   |
| Food half-life                 |     9 s |            8 s | Rapid decay should shed obsolete routes while still permitting reinforcement.                              |

### Interaction hypotheses

- Negative outbound food polarity will help only when food pull remains positive:
  polarity supplies local orientation while concentration keeps ants on the marked
  corridor.
- Persistent avoidance will help discovery and adaptation but hurt throughput if its
  magnitude or scouting-entry rate is too high.
- Strong persistent homing and low U-turn weight may strand carriers in local maxima;
  the best combination should retain a small reversal probability.
- Longer persistent lifetime should matter more on large or sparse maps, while shorter
  food lifetime should matter more after relocation.
- The best robust configuration will be less extreme than per-map winners. In
  particular, maximum polarity and maximum signal pull are expected to overfit.

### Structural hypotheses

These are recorded separately because they change a decision rule rather than merely
selecting slider values:

1. **A positive follower choice floor will be the highest-impact correction.** The
   current chooser removes every unmarked neighbor before applying `baseWeight`, so the
   documented base term cannot give an ordinary follower a small chance to correct onto
   a new branch. Keeping every adjacent branch eligible should improve relocation and
   error correction while preserving proportional, local choice.
2. **Locally saturating food deposits may improve adaptation.** Reducing each new
   deposit as the local node level rises should limit lock-in without consulting a
   route, shortest path, or global maximum.
3. **One-junction exploration may improve steady throughput but hurt initial
   discovery.** It will be evaluated as a countermodel, not assumed superior: the
   playground deliberately permits multi-edge random walks after an ant enters scouting.
4. **Undirected edge food pheromone will probably improve route identification and is
   now an explicit countermodel.** Classical ant-colony optimization commonly stores
   pheromone per edge. A hybrid can retain the scalar node-based persistent hill field
   while putting the food trail on undirected edges. An ant would still read only its
   incident options, and the stored signal would contain no direction. This model must
   beat the node model on held-out effectiveness—not merely produce a cleaner-looking
   trail—before replacing it.
5. **Trip-quality reinforcement is also excluded.** Scaling deposits by a completed
   route's length would give strong artificial-ACO feedback, but requires personal
   odometry or route memory beyond the local pheromone-only decision model.

## Search protocol

The first search will use seeded Latin hypercube sampling over behavioral controls,
including explicit zero-valued anchor configurations, followed by two rounds of
shrinking perturbations around the leading candidates. This gives broad coverage of
bounded, discontinuous controls without the extra assumptions of a covariance model.

The current defaults and the point prediction above are always included. The optimizer
may emit a suggested preset but must never rewrite defaults automatically. A candidate
is promoted only after the held-out and `1/60 s` validation results are recorded here.

## Run the evaluator

Compare the defaults and preregistered point prediction on the six screening maps:

```sh
deno task evaluate
```

Select another suite or retain every per-scenario observation:

```sh
deno task evaluate -- --suite=validation --candidate=defaults --full
```

Evaluate the winner from a saved optimizer report, including at browser fidelity:

```sh
deno task evaluate -- \
  --input=.runs/colony-search.json \
  --suite=validation \
  --dt=0.016666666666666666 \
  --out=.runs/winner-browser-fidelity.json
```

Run the deterministic Latin-hypercube search, elite refinement, full training pass, and
held-out validation:

```sh
deno task optimize -- --out=.runs/colony-search.json
```

Useful controls include `--samples`, `--rounds`, `--elite`, `--per-elite`,
`--finalists`, `--validate`, `--search-seed`, and `--dt`. Progress goes to stderr and
the versioned report goes to stdout as JSON. Graph seeds and colony random seeds are
separate, every candidate sees the same scenarios, and `antCount` and `speed` remain
fixed evaluation resources.
