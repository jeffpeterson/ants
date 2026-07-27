# Colony evaluation and optimization

This document fixes the evaluation criteria and working hypotheses before the automated
parameter search. Results belong in a separate section so predictions remain
distinguishable from observations.

Hypotheses were locked on 2026-07-26, before evaluating candidate configurations.

## What effectiveness means

Graph shape, ant count, and speed are environmental resources, not algorithm quality.
Optimization therefore holds ant count and speed fixed and evaluates every candidate on
the same seeded maps. Let:

- `L*` be the shortest home-to-food distance;
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
home distance, then runs for another `24u`.

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

| Parameter                      | Current | Predicted best | Reason                                                                                                    |
| ------------------------------ | ------: | -------------: | --------------------------------------------------------------------------------------------------------- |
| Enter scouting                 |    0.02 |           0.03 | A small continuing exploration budget should repair stale routes without dissolving recruitment.          |
| Stop scouting                  |  0.12/s |         0.16/s | Multi-edge random walks should last long enough to leave a branch but usually rejoin a discovered trail.  |
| Persistent bias while scouting |       0 |           -1.2 | Mild avoidance should spread search traffic into less-covered branches.                                   |
| Unmarked branch floor          |      0% |           100% | The base term is already small; enabling it fully should permit rare correction without swamping a trail. |
| U-turn weight                  |    0.18 |           0.15 | Immediate reversals waste distance, but a nonzero escape probability prevents trapping.                   |
| Straight-ahead bias            |     1.6 |            1.2 | Local geometry is useful, but a strong heading preference can skip a good side branch.                    |
| Short-edge bias                |     1.0 |            1.3 | Short edges should increase lap frequency and favor shorter routes without becoming deterministic.        |
| Outbound food pull             |     3.2 |            4.0 | Once a route exists, moderate concentration-following should produce stable recruitment.                  |
| Outbound food polarity         |       0 |           -1.5 | Carrier deposits are fresher nearer home, so descending the local food gradient may point toward food.    |
| Homebound food pull            |     1.0 |            0.5 | Food concentration is expected to be less reliable than the home-sourced persistent field for homing.     |
| Homebound persistent pull      |     8.0 |            8.0 | Strong attraction to the shared home field should reduce return wandering.                                |
| Homebound food polarity        |       0 |              0 | Food slope may conflict with homing and is predicted to add little.                                       |
| Homebound persistent polarity  |     4.0 |            4.0 | The persistent field attenuates away from home, making its local slope meaningful.                        |
| Persistent half-life           |    42 s |           70 s | The home field should survive long enough to cover large maps and bridge sparse traffic.                  |
| Food half-life                 |     9 s |            8 s | Rapid decay should shed obsolete routes while still permitting reinforcement.                             |

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
   error correction while preserving proportional, local choice. Because the existing
   base term is only `0.06`, the point prediction is a `100%` floor multiplier.
2. **Locally saturating food deposits may improve adaptation.** Reducing each new
   deposit as the local node level rises should limit lock-in without consulting a
   route, shortest path, or global maximum.
3. **One-junction exploration may improve steady throughput but hurt initial
   discovery.** It will be evaluated as a countermodel, not assumed superior: the
   playground deliberately permits multi-edge random walks after an ant enters scouting.
4. **Undirected edge food pheromone will probably improve route identification and is
   now an explicit countermodel.** Classical ant-colony optimization commonly stores
   pheromone per edge. A hybrid can retain the scalar node-based persistent home field
   while putting the food trail on undirected edges. An ant would still read only its
   incident options, and the stored signal would contain no direction. This model must
   beat the node model on held-out effectiveness—not merely produce a cleaner-looking
   trail—before replacing it. The predicted best structural combination is edge food
   storage plus the fully enabled unmarked-branch floor; edge storage should primarily
   improve throughput and cycle efficiency, while the floor should primarily improve
   adaptation.
5. **Trip-quality reinforcement is also excluded.** Scaling deposits by a completed
   route's length would give strong artificial-ACO feedback, but requires personal
   odometry or route memory beyond the local pheromone-only decision model.
6. **Bounded incremental home reinforcement should turn local swarming into useful
   coverage pressure without adding a field.** The current `max` update fills the
   distance-attenuated value on the first traversal, so later ants cannot reinforce the
   persistent home signal. For a search traversal `u → v`, the candidate rule is:

   ```text
   cap = H(u) × exp(-λd)
   H'(v) = H(v) + r × max(0, cap - H(v))
   ```

   The cap remains strictly below the source, preserving the peak-free home gradient.
   Repeated traffic raises a branch toward that cap; therefore explorers descending the
   field should increasingly avoid already-swarmed branches, while carriers can climb
   the same field. The predicted best rate is `r = 0.25`: enough signal for a returning
   discoverer, but enough headroom for later ants to add information. Rates `0.05`,
   `0.1`, `0.25`, `0.5`, and the existing one-pass behavior `1` will be screened.

## Search protocol

The first search will use seeded Latin hypercube sampling over behavioral controls,
including explicit zero-valued anchor configurations, followed by two rounds of
shrinking perturbations around the leading candidates. This gives broad coverage of
bounded, discontinuous controls without the extra assumptions of a covariance model.

The current defaults and the point prediction above are always included. The optimizer
may emit a suggested preset but must never rewrite defaults automatically. A candidate
is promoted only after the held-out and `1/60 s` validation results are recorded here.

## Results and promotion

The first Latin-hypercube search and two refinement rounds completed on 2026-07-27. The
search used 48 initial samples, six elites, three perturbations per elite, and separate
graph and colony seeds. Four finalists from each food-storage model reached the 24-map
validation pass.

At the search time step (`dt = 0.25 s`), the leading exact node and edge candidates were
close overall but had different strengths:

| Validation result | Node winner | Edge winner |
| ----------------- | ----------: | ----------: |
| Total score       |       32.42 |       31.57 |
| Discovery `D`     |       0.817 |       0.775 |
| Throughput `Q`    |       0.232 |       0.228 |
| Efficiency `E`    |       0.381 |       0.409 |
| Homing `H`        |       0.912 |       0.925 |
| Adaptation `A`    |       0.240 |       0.296 |
| Stranded maps     |        2/24 |        3/24 |

Edge storage improved route efficiency and adaptation, especially on small, dense, or
low-variation maps. Node storage was more reliable on large, sparse, and highly varied
maps. Because the total difference is small and both models dropped from training to
validation, this table is selection evidence rather than a claim of universal
superiority.

The exact node winner was rounded only to precision reproducible by the playground
controls. The rounded configuration was then compared with the previous defaults and the
rounded edge candidate at the browser's `1/60 s` step:

| Browser-cadence validation | Legacy | Balanced node | Adaptive edge |
| -------------------------- | -----: | ------------: | ------------: |
| Total score                |  10.88 |         36.20 |         28.34 |
| Discovery `D`              |  0.591 |         0.847 |         0.719 |
| Throughput `Q`             |  0.172 |         0.216 |         0.217 |
| Efficiency `E`             |  0.304 |         0.363 |         0.384 |
| Homing `H`                 |  0.620 |         0.912 |         0.893 |
| Adaptation `A`             |  0.178 |         0.291 |         0.316 |
| Stranded maps              |   7/24 |          1/24 |          4/24 |
| No-delivery maps           |   1/24 |          0/24 |          0/24 |
| No-adaptation maps         |   2/24 |          0/24 |          0/24 |

The independent four-map boundary suite reinforced the choice. Balanced node scored
`41.43` with no failures. Adaptive edge scored `10.08`, with one no-adaptation map and
one stranded map. These are deliberately harsh endpoints: 8 to 1,200 nodes, minimum to
maximum connection density, and minimum to maximum variation. The final browser and
stress reports use evaluation version 2, which permits the physically valid boundary
inventory of ants already mid-cycle when a finite throughput window opens.

Two final local refinements were rejected:

- Raising short-edge bias from `0.41` to `0.50` made 10 rather than 9 of the original 12
  demo seeds show a leading trail within 25% of shortest, but browser score fell from
  `36.20` to `32.70` and stress score fell from `41.43` to `38.78`.
- A `25%` unmarked-branch floor was the best coarse floor ablation, but at browser
  cadence it scored `30.16` versus `36.20` for zero and stranded on 3 rather than 1 of
  24 maps. Its stress score was also lower (`39.80` versus `41.43`).

The first promoted balanced-node settings were therefore:

| Lever                      | Default |
| -------------------------- | ------: |
| Enter scouting             |   0.007 |
| Stop scouting              | 0.083/s |
| Scout persistent bias      |   -1.10 |
| Unmarked branch floor      |       0 |
| U-turn weight              |   0.045 |
| Straight-ahead bias        |    1.58 |
| Short-edge bias            |    0.41 |
| Outbound food pull         |    4.56 |
| Outbound food polarity     |   +0.78 |
| Homebound food pull        |    1.10 |
| Homebound persistent pull  |    3.09 |
| Homebound food polarity    |   -1.40 |
| Homebound persistent slope |   +4.00 |
| Persistent half-life       |  22.2 s |
| Food half-life             |  14.4 s |
| Food storage               |    node |

Ant count (`64`) and speed (`0.17 u/s`) remain fixed resources, not optimized algorithm
parameters. The playground includes three immutable built-ins: the promoted balanced
node configuration, the adaptive edge candidate, and the pre-optimization baseline.
Personal presets remain separate.

### Hypothesis audit

| Preregistered prediction                                    | Outcome                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Negative outbound food polarity                             | Contradicted for nodes: both node finalists selected a positive climb; edge polarity is inapplicable.                       |
| Persistent avoidance helps exploration                      | Supported in sign: both model winners selected a negative scout bias, though its isolated effect was not measured.          |
| Full unmarked-branch floor is the highest-impact correction | Contradicted: the edge winner selected zero, and the browser-cadence node ablation favored zero over 25%.                   |
| Edge storage improves throughput and efficiency             | Partial: efficiency and adaptation improved, throughput was nearly tied, and sparse-map failures erased the aggregate gain. |
| Slow/food half-lives near 70/8 seconds                      | Contradicted: the promoted values are 22.2/14.4 seconds.                                                                    |
| Strong persistent homing is useful                          | Mixed: maximum positive persistent polarity survived, but node pull fell to 3.09 while edge pull rose to 9.48.              |
| The robust winner will avoid extremes                       | Mixed: most values were interior, but homebound persistent polarity remained at its upper bound.                            |
| Saturating deposits and one-junction exploration            | Untested; neither rule was needed for the first promoted result.                                                            |

These verdicts distinguish causal ablations from parameter values merely selected
together. The validation maps participated in finalist ranking, so future iterations
should add fresh graph seeds and repeated colony seeds before making smaller claims
about improvements over the promoted default.

## Uncharted scouting and pheromone-only homing

A follow-up visual audit compared the first promoted model with commit `1347975`. That
historical carrier did not merely follow better pheromone: it stored a loop-erased
personal route, considered only earlier breadcrumbs while returning, and always fell
back to its previous breadcrumb. Its persistent signal was also stored on directed
homeward arcs. That combination guaranteed monotone return but violated the later
pheromone-only, no-route-memory invariant.

Evaluation version 3 instead makes two local changes:

1. Scouts reduce a charted option's weight when an adjacent zero-coverage endpoint
   exists. The new uncharted-priority lever controls that reduction. With all adjacent
   endpoints charted, the default scout samples randomly apart from the existing U-turn
   penalty.
2. Carriers ignore the food field by default and follow only the persistent home field.
   This removes a conflicting cue without adding a route, visited set, stored direction,
   coordinate, or graph-wide query.

The carrier correction was isolated first. On six screening maps, disabling its food cue
raised homing from `0.906` to `0.985` and cycle efficiency from `0.468` to `0.535`. On
24 validation maps it raised score from `27.37` to `38.99`, raised homing from `0.922`
to `0.958`, and eliminated both stranded and no-adaptation maps. Raising persistent pull
from `3.09` to `10` was less robust, so that lever remains unchanged.

An uncharted-priority sweep then compared `25%`, `50%`, `75%`, and `100%`. The `75%`
candidate had the strongest combined validation and boundary performance:

| Version-3 result      | 75% priority | 100% priority |
| --------------------- | -----------: | ------------: |
| Validation score      |        42.97 |         38.99 |
| Validation throughput |        0.252 |         0.243 |
| Validation homing     |        0.966 |         0.958 |
| Browser score         |        34.38 |         38.41 |
| Browser throughput    |        0.245 |         0.238 |
| Browser homing        |        0.965 |         0.968 |
| Boundary score        |        40.59 |         35.30 |
| Boundary throughput   |        0.256 |         0.247 |

The browser pass for `75%` had one no-adaptation map but no stranded maps; its
validation and boundary passes had neither failure. It is retained as the working
default because it improves useful traffic across two of the three suites and treats
“prefer” as a strong local weighting rather than an absolute exclusion.

The current overrides relative to the first promoted preset are:

| Lever                     | First promotion | Current |
| ------------------------- | --------------: | ------: |
| Scout persistent fallback |   `1.10×` avoid |  ignore |
| Uncharted priority        |             n/a |     75% |
| Homebound food pull       |          `1.10` |       0 |
| Homebound food polarity   | `1.40×` descend |  ignore |

## Home-potential and local-interaction hypotheses

The next iteration changes the information model before retuning its numeric controls.
These predictions are recorded before aggregate benchmarking:

1. Pinning home at `1` and accepting only attenuated destination improvements will
   eliminate persistent local maxima and prevent short loops from amplifying the home
   field.
2. Increasing the persistent half-life by roughly two orders of magnitude over the food
   half-life will improve sparse-field homing without preserving stale food routes.
3. Persistent edge coverage plus finite escape-to-home will reduce time spent in
   cul-de-sacs; the initial blocked-choice hypothesis predicted that a threshold near
   two choices would balance coverage and premature returns.
4. Food deposition accepted only on strictly homeward persistent-field moves will
   eliminate food mass laid by lost carriers and improve trail focus.
5. A moderate response to approaching opposite-direction traffic will improve early
   discovery and short-route adoption most when the chemical field is sparse; zero and
   very strong social response should perform worse.
6. A scout that encounters usable food signal should usually rejoin following, but an
   intermediate probability may adapt better after food moves than unconditional
   joining.

The blocked-choice hypothesis was rejected during the mechanism check: it limited valid
travel on established outbound trails. Shared coverage must remain a novelty cue rather
than a failure predicate. A first wave can chart an edge before the rest reaches it, so
covered branches descending the home field must remain valid without a time or choice
limit. Choosing an unwalked edge now arms one frontier bit; only an armed scout that
later finds neither an unwalked nor downhill non-U-turn branch is eligible to return.

The causal candidates are home-only, home plus escape, home plus food-progress gating,
home plus both, and cautious/balanced/eager social variants. Promotion requires all
local invariants to pass, no increase in stranded or no-delivery runs, improved
homebound progress, and better paired cycle efficiency on held-out maps. Aggregate score
remains secondary to those mechanism-specific checks.

### Frontier-phase mechanism check

The frontier bit was compared with the rejected blocked-choice rule before adding local
encounters. On 12 paired 200-node maps run for 80 simulated seconds, the corrected rule
expanded far-map coverage and delivery:

| Rule                     | Deliveries | Signaled nodes / 2,400 | Covered edges |
| ------------------------ | ---------: | ---------------------: | ------------: |
| Blocked-choice return    |         42 |                  1,310 |         2,132 |
| Frontier bit, 20%/s exit |        358 |                  2,345 |         3,133 |

On 24 paired 24-node held-out maps, the old rule delivered `7,390` loads versus `7,288`
for the frontier rule, a `1.4%` short-map advantage that does not justify restoring the
invalid outbound limit. Exit rates from `8.3%/s` through `95%/s` were screened
separately; `20%/s` had the best held-out delivery total among frontier candidates at
the 80-second horizon. Recruitment experiments should recover short-map convergence
without weakening the frontier invariant.

### Staggered pheromone writes

The first frontier-bit implementation advanced every ant against one pre-tick field.
That synchronous snapshot let a whole wave classify the same edge as unwalked and arm
itself before any coverage became visible. New ants now launch 1/60 second apart. Each
tick clones the decayed fields once, then ants in stable ID order write ordinary
edge-entry coverage into that working copy. Later ants therefore see the trail directly,
without a second coverage representation or any nonlocal state.

At browser fidelity on 12 paired default maps, the two-second launch window armed `733`
of `768` ants under the synchronous update and `60` with staggered writes; escape counts
fell from `4` to `0`. At 40 seconds the staggered version delivered `1,143` loads versus
`1,253`, while 200-node coverage was unchanged in a separate eight-map check. The later
recruitment experiment must recover that throughput without reintroducing synchronized
frontier classification.

### Food-trail locality

Node concentration alone made a carrier's arrival level appear on every edge incident to
that node. The carrier had already recorded its traversed food edge, but the node
navigator and renderer ignored it. Node food levels now use that undirected edge field
as a support mask: endpoint levels still derive polarity, while only carrier-traversed
edges expose or display the signal. An untouched side branch cannot acquire food
attraction merely because it shares a junction with the return path.

### Local trail recruitment

Hypothesis 6 predicted that temporary scouts should be able to stop random walking when
they encounter usable food pheromone, but that unconditional joining would impede
relocation. The new junction-local probability uses the same food choices already
available to the ant. It adds no route memory, caste, destination knowledge, or
additional field.

The corrected food-locality engine was evaluated on 24 validation scenarios. All rows
retained perfect pickup, initial-delivery, homing, stranded, and invalid-run rates. `6%`
produced the best aggregate result without a relocation failure:

| Join chance | Score | Throughput | Efficiency | Adaptation | No relocated delivery |
| ----------: | ----: | ---------: | ---------: | ---------: | --------------------: |
|          0% | 58.64 |      0.367 |      0.746 |      0.459 |                    0% |
|        2.5% | 65.94 |      0.471 |      0.798 |      0.542 |                    0% |
|          5% | 67.89 |      0.532 |      0.817 |      0.530 |                    0% |
|          6% | 69.03 |      0.547 |      0.817 |      0.550 |                    0% |
|          7% | 68.81 |      0.558 |      0.829 |      0.526 |                    0% |
|         10% | 59.87 |      0.566 |      0.829 |      0.490 |                  4.2% |
|         25% | 55.23 |      0.599 |      0.848 |      0.330 |                  4.2% |

At browser cadence on six screening scenarios, `6%` scored `77.36` versus `70.10` for
zero recruitment, while `7%` scored `77.42`. A fresh 24-map confirmation suite then
scored `56.62`, `67.86`, and `64.98` for `0%`, `6%`, and `7%`, respectively, with no
failures. This initially promoted `6%`, but a visual mechanism audit rejected treating
the per-encounter probability as though it were the eventual follower fraction. Repeated
encounters accumulate: after `n` usable encounters the probability of having joined is
`1 - (1 - p)^n`.

At 80 seconds on 12 varied maps, `6%` left an average of `14.2` ants scouting, `30.6`
following, and `19.3` carrying, with `95` deliveries. Raising the local hazard to `25%`
left `6.3` scouting or frontier ants, `35` following, and `22.8` carrying, with `126.2`
deliveries. Higher rates barely reduced the residual scouts because those ants had not
encountered a usable trail. The default therefore uses `25%` to express
majority-following behavior; `6%` remains the cautious-recruitment preset and `0%`
remains the causal control. Finite-food experiments must recheck the relocation tradeoff
rather than hiding it in an aggregate score. Older URLs and saved algorithms that
predate this lever migrate to `0%`; explicitly saved values remain unchanged. Reproduce
an evaluator row with:

```sh
deno task evaluate -- \
  --suite=confirmation \
  --candidate=defaults \
  --set=trailJoinChance=0.06
```

## New-food competition

The preregistered mechanism hypothesis was that the weak-route failure occurs after
successful discovery and deposition: raw additive food signal lets a mature route
outweigh the first mark on a newly added route by roughly `100:1`. The promotion gates
were:

- use only signal at the ant's current node and its immediate neighbors;
- give a newly returned, locally marked branch meaningful traffic;
- preserve the 12-map shortest-route regression;
- avoid a material stable-throughput or moved-food regression.

A deterministic home-junction fixture confirmed the failure. With mature signal `72` and
one new deposit `0.72`, the new branch received `0.47%` in node mode and `1.01%` in edge
mode. Several broad corrections were rejected:

| Candidate                         | Confirmation throughput | Outcome                                   |
| --------------------------------- | ----------------------: | ----------------------------------------- |
| Existing additive field           |                   0.593 | Control                                   |
| Bounded field, cap `1`            |                       — | Failed the 12-map shortest-route gate     |
| Bounded field, cap `5`            |                   0.469 | Preserved route gate but lost throughput  |
| 20% uniform marked-branch mixture |                   0.336 | Preserved ordering but taxed every choice |
| Square-root sensory response      |                   0.484 | Compressed useful lap-frequency evidence  |

The promoted rule changes deposition only when the pickup node is weak beside the
endpoint the ant just arrived from:

```text
carriedDeposit =
  max(normalDeposit, share × incomingSignal − foodNodeSignal)
```

At `share = 20%`, the 24-map confirmation score increased from `53.306` to `53.386`.
Throughput (`0.5932`) and efficiency (`0.8379`) were unchanged, while adaptation rose
from `0.3029` to `0.3047`; failure rates were unchanged. The 12-map leading-route gate
also passed.

A separate added-food fixture warmed each of 12 maps for 80 simulated seconds, added
food on an untouched edge adjacent to home, then measured the new branch. On the two
control maps exhibiting starvation, its immediate share changed from `0.52%` to `8.53%`
and from `0.68%` to `10.54%`. After 30 seconds those shares were `11.29%` and `33.93%`,
versus `0.39%` and `2.82%` in the control. Old saved algorithms migrate this lever to
zero so their behavior remains reproducible.

## Bounded home-field reinforcement

The preregistered structural hypothesis identified a semantic bug in the old update:
`max(current, cap)` filled the locally safe home potential on the first traversal, so a
swarm could not reinforce it further. The promoted rule instead fills a fraction of the
remaining gap:

```text
cap = H(source) × exp(-λ × edgeLength)
H'(destination) =
  H(destination) + reinforcement × max(0, cap - H(destination))
```

This is a convex step toward a value strictly below its source. It therefore retains a
higher local witness for every mark, cannot create a new peak, and cannot amplify a
loop. Repeated ants progressively raise a branch toward the same distance-derived cap.
At a covered gateway, a heavily swarmed internal branch consequently has more home
signal than a once-crossed bridge; an outward-biased scout locally favors the bridge
without a traffic field, route memory, or knowledge of the graph beyond that junction.

The preregistered screen compared rates `5%`, `10%`, `25%`, `50%`, and the old one-pass
rate `100%`. The `25%` prediction won and was promoted:

| Suite                    | Maps |   10% |   25% |   50% | 100% control |
| ------------------------ | ---: | ----: | ----: | ----: | -----------: |
| Screening                |    6 | 68.93 | 80.50 | 78.60 |        73.16 |
| Validation               |   24 | 51.79 | 73.21 | 66.08 |        55.25 |
| Fresh confirmation       |   24 |     — | 68.77 | 66.17 |        53.39 |
| Boundary stress          |    4 | 15.67 | 58.80 | 60.69 |        60.70 |
| Browser-cadence confirm. |    6 |     — | 78.27 |     — |        33.37 |

The `25%` candidate had no pickup, initial-delivery, relocated-delivery, stranded, or
invalid-run failures on screening, validation, and fresh confirmation. On boundary
stress it traded some homing reliability (`0.904` versus `1.0`) for better throughput
and efficiency, finishing about 3% below the old aggregate. The `50%` candidate matched
the old boundary score while remaining substantially better on the larger held-out
suites, so it is retained as the **Rapid home mapping** preset.

The playground exposes the rate directly. Saved algorithms and share URLs that predate
the lever migrate to `100%`, preserving their previous one-pass behavior; explicit
values remain unchanged.

### Long-distance dynamic range

Incremental reinforcement exposed an absolute-threshold bug. A fresh `k`-edge trail is
roughly proportional to `reinforcement^k`; on a long route its valid home potential can
therefore be far below `1e-9`. The engine previously:

- rounded persistent node levels below `1e-6` to zero during decay;
- treated slopes smaller than an absolute `1e-9` as flat; and
- hid rendered levels whose linear intensity was below `0.008`.

Those cutoffs erased a valid relative gradient. Carriers then had no signaled homeward
choice and stopped depositing food pheromone on the remote portion of their route.

Persistent node levels now keep every positive finite value. Homeward slope is evaluated
as `(there - here) / (there + here)`, with zero reserved for an unknown endpoint, and
homeward ordering uses strict scalar comparison. Escape choices normalize incident home
levels before weighting, so their probabilities do not depend on the field's absolute
scale. Scouts retain a `1e-6` local sensory floor: beyond it they explore randomly
rather than treating an imperceptible slope as endless outward progress. Food pheromone
and binary edge coverage retain their cleanup cutoff.

Rendering is intentionally separate from navigation: persistent levels use a logarithmic
display transform, while food concentration retains the linear transform. Thus a weak
distant home gradient remains visible without inflating its stored value or giving an
ant any nonlocal information.

Removing the cutoff changed the reinforcement model, so the old `25%` default was
re-screened rather than retained by assumption. `15%` was promoted as the robust
candidate:

| Reinforcement | Screen | Validation | Confirmation | Boundary stress |
| ------------: | -----: | ---------: | -----------: | --------------: |
|           10% |  81.47 |      68.22 |        66.95 |           52.36 |
|           15% |  78.50 |      73.46 |        71.98 |           59.18 |
|           20% |  80.97 |      73.76 |        72.91 |           27.94 |
|           25% |  81.58 |      66.46 |        72.38 |           30.86 |

The `20%` and `25%` boundary runs each missed relocation on one of four maps. The `15%`
candidate had perfect pickup, delivery, relocation-delivery, homing, stranded, and
validity rates on screening, validation, confirmation, and boundary stress. Against the
previous deployed `25%` cutoff model, it improved validation (`73.21 → 73.46`),
confirmation (`68.77 → 71.98`), and boundary stress (`58.80 → 59.18`). A six-map browser
cadence check scored `75.02`; the faster `50%` alternative remains available as the
**Rapid home mapping** preset.

## Productive-colony hypotheses

The next iteration targets colony utilization and changing food rather than home-field
correctness. These predictions are recorded before changing the mechanism or tuning its
parameters:

1. **Corrective scouts need a complete local lifecycle.** A scout that deliberately
   leaves usable food signal can currently remain in exploration forever if it never
   crosses an unwalked edge. Making that scout locally eligible to return, while keeping
   initial discovery scouts ineligible until they cross a frontier, should reduce idle
   scouting on fully covered graphs without shortening the first discovery wave.
2. **Outcome-only scoring hides wasted ants.** Time-averaged ant states, the share of
   ants completing a cycle, random-versus-signaled carrier movement, dominant-route
   stretch, and signal focus should expose configurations that deliver with a productive
   minority while most ants wander. Multiple colony seeds per graph and per-map
   promotion floors should prevent one favorable random trajectory or a high mean from
   hiding a weak map.
3. **A small follower floor should release stale routes smoothly.** With a zero floor,
   any positive food mark excludes every unmarked option until the mark is deleted.
   After fixing scout lifecycle and measuring utilization, a nonzero base probability
   should improve moved- and added-food adaptation. The best floor is predicted to be
   small enough that mature-route throughput and dominant-route stretch remain
   effectively unchanged.
4. **A diminishing carrier deposit can create a foodward scalar gradient.** A carrier
   can start with a scalar pheromone budget at food and reduce it as it travels home.
   This requires no route, visited set, directional edge record, or graph knowledge:
   every deposit still depends only on the ant's current budget and local movement.
   Depositing more near food should make positive outbound polarity meaningful while
   shorter paths retain their higher lap rate.
5. **Changing-food evaluation must match the playground.** Promotion must cover moving,
   adding, simultaneous, finite, exhausted, and newly spawned food without resetting
   ants or fields. The predicted robust policy keeps a minority exploration reserve
   after recruitment and shifts traffic to a new source before an old high-concentration
   trail fully disappears.

The implementation order is causal: repair scout lifecycle, add the missing
measurements, retune follower release, evaluate diminishing deposits, then introduce
finite and spawning food. Every stage must retain the local home-potential invariant and
pass fresh browser-cadence and boundary scenarios before changing the default.

### Follower-floor experiment plan

The scout-lifecycle mechanism and follower floor may interact: retiring exhausted scouts
increases useful traffic, while a floor may prevent that traffic from remaining locked
to stale food marks. Test the zero-floor control and `0.5%`, `1%`, `2%`, `5%`, and `10%`
relative unmarked-branch weights as a factorial with the deployed and completed scout
lifecycles.

Promote only a combination that improves moved-food adaptation and seed floor without
introducing a failed graph or materially reducing static throughput, route efficiency,
productive utilization, cycle participation, trail coherence, or signaled homing.
Screening and stress select finalists; validation, fresh confirmation, and browser
cadence decide promotion.

### Bounded food-potential experiment plan

Compare the additive node field with a bounded food-potential model. A carrier starts
with potential `1` at food. After traversing an edge of length `d`, its local budget is:

```text
cap = source × 2 ^ (-d / halfDistance)
```

The destination node then approaches, but never exceeds, that cap:

```text
destination' =
  destination + reinforcement × max(0, cap - destination)
```

This uses only the carrier's remaining pheromone, edge length, and destination level. It
stores no route or visited set, cannot create a non-food peak, and bounds the field
independently of population size.

Test half-distances `0.3`, `0.5`, and `1.0` with reinforcement rates `10%`, `25%`,
`50%`, and the `100%` Bellman-style control. Cross the best pairs with follower floors
`0%` and `1%`, then with the deployed and completed scout lifecycles. Begin at
half-distance `0.5` and reinforcement `25%`.

Before promotion, chain, loop, unequal-route, subdivided-edge, confluence, and
multiple-food tests must establish the local gradient invariants. Screening and stress
select finalists; validation, fresh confirmation, and browser cadence must improve
adaptation and seed floor without adding failures or materially regressing static
throughput, efficiency, utilization, participation, coherence, or signaled homing.

### Evaluator v6: colony health and repeated runs

The v6 evaluator adds mechanism health without changing the five outcome dimensions or
their score weights. Existing v5 scores therefore remain directly reproducible with one
run per graph.

Four steady-window and late-adaptation observations are reported:

- **Productive utilization** is the geometric mean of time spent following or carrying
  food in the steady and late-adaptation windows. Scouting, frontier, and escape shares
  remain separately visible.
- **Cycle participation** is the geometric mean of the fractions of ants that complete
  at least one delivery in those windows. This prevents a productive minority from
  hiding an idle majority.
- **Trail coherence** samples the geometric mean of dominant-route efficiency and food
  signal focus every two ideal travel units.
- **Signaled homing** is the fraction of carrier junction choices that use the home
  field rather than random fallback. The mandatory reversal at food is excluded.

Health values are promotion gates rather than new score terms. A candidate must avoid a
material paired utilization, participation, or coherence regression and must not reduce
signaled homing.

`--runs=N` repeats every graph with deterministic, candidate-independent colony seeds.
The aggregate now reports the ordinary all-run score plus:

- `seedFloorScore`: the robust aggregate of each graph's worst run;
- `seedScoreSpread`: the mean best-to-worst score range within each graph; and
- `failureGraphRates`: the fraction of graphs where any repeated run fails.

Screening may retain one run for speed. Finalists and promotions use at least three; no
candidate may introduce a failed graph or regress the seed floor. Full reports retain
every graph/run pair, so stochastic failures are inspectable rather than averaged away.

## Run the evaluator

Compare the defaults and preregistered point prediction on the six screening maps:

```sh
deno task evaluate
```

Compare one candidate on three colony runs per validation graph:

```sh
deno task evaluate -- \
  --suite=validation \
  --candidate=defaults \
  --runs=3 \
  --full
```

Evaluate one source-controlled playground preset:

```sh
deno task evaluate -- --preset=adaptive-edge --suite=validation
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

Use `--model=edge` to optimize the undirected-edge food-trail countermodel. Food
polarities are fixed to zero in that search because an undirected scalar has no slope:

```sh
deno task optimize -- --model=edge --out=.runs/edge-search.json
```

Useful controls include `--samples`, `--rounds`, `--elite`, `--per-elite`,
`--finalists`, `--validate`, `--search-seed`, and `--dt`. Progress goes to stderr and
the versioned report goes to stdout as JSON. Graph seeds and colony random seeds are
separate, every candidate sees the same scenarios, and `antCount` and `speed` remain
fixed evaluation resources.

For a controlled ablation, `evaluate` accepts comma-separated overrides:

```sh
deno task evaluate -- \
  --input=.runs/colony-search.json \
  --set=choiceFloor=1 \
  --suite=validation
```
