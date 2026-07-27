# Formic

Formic is a browser-based ant-colony pathfinding playground. A seeded random graph gives
ants a home, one or more food sources, and competing routes. Food can move while the
colony is running so obsolete signals visibly fade as the ants adapt. The simulation has
a pure functional core and a small imperative canvas/DOM shell.

## Run it

```sh
deno task dev
```

Open <http://localhost:4173>. Run the tests with:

```sh
deno task test
```

Run the reproducible colony scorecard or parameter optimizer with:

```sh
deno task evaluate
deno task optimize -- --out=.runs/colony-search.json
```

Run every historical engine on the same current graph fixtures, then summarize the
existing report without rerunning it:

```sh
deno task benchmark -- \
  --lane=common \
  --run-seeds=90001,194730,299459,404188,508917 \
  --out=.runs/historical-common.json
deno task benchmark:summary -- --input=.runs/historical-common.json
```

## Current algorithm

The generator blends an even low-discrepancy layout toward increasingly loose, clustered
placement, then builds a minimum-length connected backbone and adds seeded local or
occasional long connections. One map-variation control changes spatial and topological
irregularity without exposing implementation-shaped island controls. Every map remains
connected from 8 through 1,200 nodes. Ants move at one physical speed: crossing an edge
takes `edge.length / speed`, so shorter routes permit more laps and more reinforcement
per minute. The separate simulation-rate control scales the entire simulation clock,
including movement, pheromone decay, and per-second decisions, so it changes playback
speed without changing algorithm behavior.

The colony stores a scalar persistent level at every node and a bounded coverage mark on
every undirected edge:

- Home is the sole fixed source at level `1`.
- A searching traversal `u → v` can propose only `persistent[u] × exp(-2 × edge.length)`
  at `v`.
- The destination keeps the maximum of its decayed level and that attenuated proposal. A
  loop therefore cannot amplify itself, and the initial outbound trail already rises
  toward home rather than depending on deposit freshness.

Food pheromone is deposited at pickup and then only by a loaded ant crossing to a
strictly higher home-potential endpoint. A playground lever stores it either as scalar
node levels or on undirected edges; both live fields are maintained so the model can
change without resetting the colony. There are no directional pheromone records.

In node mode, option `u → v` reads the food level at the opposite endpoint `v`. The
renderer interpolates endpoint levels along the edge and can draw their current slope:

```text
visibleSlope(field, u, v) = level[field, v] - level[field, u]
```

That slope is a visualization, not an instruction. A carrier deposits later near home,
so freshness can make food concentration rise homeward. In edge mode, option `u → v`
instead reads the single scalar on undirected edge `{u,v}` and food polarity has no
effect because the edge stores no direction.

Pheromone marks stay visually static between simulation updates so the ants are the only
moving marks on the graph.

Normal outbound and homebound choices use the same local weighted mixer:

```text
relativeSlope(field, u, v) =
  (level[field, v] - level[field, u])
  / (level[field, v] + level[field, u])

cue(channel, u, v) =
  level[channel, v]             for node fields
  level[channel, {u,v}]         for an undirected edge field

weight(u, v) =
  (base + Σ attraction[channel] · cue(channel, u, v))
  · exp(Σ polarity[channel] · relativeSlope(channel, u, v))
  · headingBias(u, v)
  · edgeLength(u, v)^(-shortEdgeBias)
  · uTurnWeight(u, v)

P(u → v) = weight(u, v) / Σ weight(u, option)
```

When another branch has signal, the unmarked-branch floor controls how much of the small
base term an unmarked option retains. Zero reproduces hard trail following; positive
values permit rare local error correction without putting an ant into scouting mode.

Outbound and homebound ants have independent attraction and polarity settings. Setting
an attraction or polarity control to zero removes that cue. At food, an ant reverses its
incoming edge once, then resumes local choices; it does not retrace a stored path. The
default carrier ignores the food field and follows only the persistent home field. This
avoids reinforcing a mistaken food-marked branch during return. Homeward priority
controls how strongly branches that fail to increase the home potential are suppressed;
the default permits only locally homeward options.

Every ant starts in scouting mode. Later, an independent enter-scouting chance can
switch a follower back into it. When an incident edge has no persistent coverage mark,
the default scout prefers those unwalked options. Unwalked-edge priority can soften that
preference. Scouts otherwise descend the endpoint-derived persistent slope by default,
so exploration tends away from home while homing follows increasing levels.

An explorer counts consecutive junctions without an unwalked non-reverse edge. At the
configured limit—or by an adjustable per-second chance while locally blocked—it enters
escape mode and strictly follows increasing persistent levels home. The ant stores only
that small counter, one mode bit, and its incoming edge; it has no route or visited set.
Escape traffic does not refresh persistent coverage.

## Current-engine invariants

- Persistent pheromone is one scalar home potential per node plus one bounded coverage
  mark per undirected edge. Food pheromone is either one scalar per node or per
  undirected edge. None stores direction; renderer arrows derive only from endpoint
  slopes.
- Home is pinned to `1`; every accepted non-home persistent write is attenuated from the
  live level at the edge's other endpoint. Persistent traffic is never additive.
- Food pheromone is written only at pickup or by a loaded ant making strict local
  home-potential progress. Outbound followers, scouts, and wandering carriers never
  write it.
- Every ant scouts at the start. Scouting is a temporary stochastic mode, not a caste.
- “Unwalked” means an incident edge has no persistent coverage mark; it is not a
  personal visited set or a graph-wide query. Shared coverage is only a novelty cue,
  never proof of a dead end. A scout is locally blocked only when every non-U-turn
  branch is both charted and higher in the home field.
- A decision reads adjacent endpoint levels, the incoming edge, local branch geometry,
  incident-edge coverage, edge length, mode, a bounded failure count, and seeded
  randomness. It never reads a route, visited set, shortest-path result, or graph-wide
  statistic.
- Ant speed is constant in physical graph units. Long edges and routes take
  proportionally longer to traverse.
- Simulation rate scales the complete clock rather than ant movement alone, preserving
  the relationship between travel, decay, and stochastic decisions.
- Every generated map has a minimum spanning backbone, so irregular clusters and
  bottlenecks never become disconnected components.
- Food edits preserve the running ants and both fields. Old food signal evaporates while
  the colony searches for the new source.

## Historical engines

The engine selector runs the live `Current — Home potential` engine and seven
behavior-changing revisions, A0–A4 and B0–B1, inside the latest playground. B1 remains
an unchanged benchmark; Current is its actively developed successor. Switching engines
preserves the exact graph, home, and placed food, but resets ants and trails because
their state schemas are incompatible. Historical source files are byte-checked against
their Git blobs.

The selector starts each revision from its archived behavioral defaults while retaining
only shared resources such as ant count and speed. Unsupported current-engine controls
are disabled. A0 supports one active food: additional sources remain visibly parked, and
moving the active source reproduces A0's reset behavior.

The five-seed common-graph screen found:

- A4 (`3d6fd02`) was the overall throughput leader, but it uses a loop-erased personal
  route and is therefore ineligible as the pheromone-only default.
- B0 (`97a4679`) was the highest-throughput strict-local candidate, but it usually
  collapsed on the sparse 160-node fixture.
- The current scalar-field engine remained the robust strict-local default because it
  delivered in every steady window.

See the [historical benchmark protocol and results](docs/historical-benchmarks.md) for
the complete paired table, hypotheses, commands, and limitations.

## Research basis

This is an algorithmic synthesis rather than a claim that every ant species behaves this
way. [Dussutour et al.](https://pubmed.ncbi.nlm.nih.gov/19617426/) report a long-lasting
exploration pheromone with weak recruitment and a short-lived food trail with strong
recruitment in _Pheidole megacephala_. The persistent field here plays that
shared-network role and also supplies the home potential needed by a deliberately
pheromone-only graph model.

Straight pheromone need not encode polarity.
[Jackson et al.](https://doi.org/10.1038/nature03105) found that Pharaoh's ants obtain
trail polarity from branch geometry, while
[Sakamoto and Sakiyama](https://pmc.ncbi.nlm.nih.gov/articles/PMC8837658/) found that
naïve _Lasius niger_ workers initially chose directions at random when joining a one-way
trail. The default heading bias represents local geometry; every polarity control
remains optional.

The probability rule follows the local proportional response measured by
[Perna et al.](https://doi.org/10.1371/journal.pcbi.1002592) and the linear-flow
conditions studied by [Garg et al.](https://doi.org/10.1073/pnas.2207959120). Trail
renewal and evaporation are summarized in
[Trail pheromone](https://en.wikipedia.org/wiki/Trail_pheromone).

The [research library](docs/README.md) archives downloadable papers and annotates
additional work on pheromone decay, error correction, directional cues, shortest paths,
and artificial ant systems.

The [evaluation and optimization protocol](docs/optimization.md) defines effectiveness,
locks parameter hypotheses before experimentation, and separates training maps from
held-out validation.

On the current engine, moving, adding, or removing food preserves ants, elapsed time,
and both pheromone fields. Returning ants finish trips from retired sources while old
signals evaporate. The default balanced node-trail algorithm was selected by the
reproducible evaluator. Built-in presets retain that configuration, an adaptive
edge-trail candidate, and the pre-optimization baseline. Personal algorithm presets and
map presets remain separate in browser storage. Loading a preset for the active engine
preserves live ants and trails; loading a preset for another engine performs the same
graph-preserving colony reset as the engine selector.

The active engine, its parameters, deterministic map recipe, home, and food locations
are also encoded in the URL hash for reproducible sharing. All simulation functions
return new state, seeded randomness is threaded through each transition, and the
renderer only reads snapshots.
