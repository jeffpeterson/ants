# Formic

Formic is a browser-based ant-colony pathfinding playground. A seeded random graph gives
ants a hill, one or more food sources, and competing routes. Food can move while the
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

## Algorithm

The generator blends an even low-discrepancy layout toward increasingly loose, clustered
placement, then builds a minimum-length connected backbone and adds seeded local or
occasional long connections. One map-variation control changes spatial and topological
irregularity without exposing implementation-shaped island controls. Every map remains
connected from 8 through 1,200 nodes. Ants move at one physical speed: crossing an edge
takes `edge.length / speed`, so shorter routes permit more laps and more reinforcement
per minute.

The colony stores two scalar levels at every node:

- The persistent field is extended by searching ants carrying a hill-sourced chemical
  level that weakens with distance. It fades slowly.
- The food field is deposited only by an ant that has picked up food. It begins at food
  and is renewed as the carrier walks toward the hill. It fades quickly.

There are no directional pheromone records. At node `u`, the option `u → v` reads the
level at the opposite endpoint `v`. The renderer interpolates endpoint levels along the
edge and can draw their current slope:

```text
visibleSlope(field, u, v) = level[field, v] - level[field, u]
```

That slope is a visualization, not an instruction. A carrier deposits later near the
hill, so freshness can make food concentration rise hillward. Polarity affects a choice
only when its corresponding playground control is nonzero.

Pheromone marks stay visually static between simulation updates so the ants are the only
moving marks on the graph.

Normal outbound and homebound choices use the same local weighted mixer:

```text
relativeSlope(field, u, v) =
  (level[field, v] - level[field, u])
  / (level[field, v] + level[field, u])

weight(u, v) =
  (base + Σ attraction[channel] · level[channel, v])
  · exp(Σ polarity[channel] · relativeSlope(channel, u, v))
  · headingBias(u, v)
  · edgeLength(u, v)^(-shortEdgeBias)
  · uTurnWeight(u, v)

P(u → v) = weight(u, v) / Σ weight(u, option)
```

Outbound and homebound ants have independent attraction and polarity settings. Setting
an attraction or polarity control to zero removes that cue. At food, an ant reverses its
incoming edge once, then resumes local choices; it does not retrace a stored path.

Every ant starts in scouting mode. Later, an independent enter-scouting chance can
switch a follower back into it. A scout makes a random adjacent choice, modified only by
the configurable persistent-signal bias and U-turn weight. On every simulation update it
has an adjustable per-second chance to stop scouting. This memoryless exit rule is
stable across animation frame rates and stores no step count, timer, route, or visited
set.

## Model invariants

- Pheromone is one scalar per node per channel, never a stored direction. Renderer
  arrows are derived from endpoint levels.
- Only an ant carrying food deposits food pheromone. Outbound followers and scouts never
  do.
- Every ant scouts at the start. Scouting is a temporary stochastic mode, not a caste.
- A decision reads adjacent endpoint levels, the incoming edge, local branch geometry,
  edge length, mode, and seeded randomness. It never reads a route, visited set,
  shortest-path result, or graph-wide statistic.
- The persistent load carried from the hill is one chemical scalar, not a path record.
- Ant speed is constant in physical graph units. Long edges and routes take
  proportionally longer to traverse.
- Every generated map has a minimum spanning backbone, so irregular clusters and
  bottlenecks never become disconnected components.
- Food edits preserve the running ants and both fields. Old food signal evaporates while
  the colony searches for the new source.

## Research basis

This is an algorithmic synthesis rather than a claim that every ant species behaves this
way. [Dussutour et al.](https://pubmed.ncbi.nlm.nih.gov/19617426/) report a long-lasting
exploration pheromone with weak recruitment and a short-lived food trail with strong
recruitment in _Pheidole megacephala_. The persistent field here plays that
shared-network role and also supplies the hill potential needed by a deliberately
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

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
Algorithm presets and map presets are stored separately in browser storage. The active
algorithm, deterministic map recipe, hill, and food locations are also encoded in the
URL hash for reproducible sharing. All simulation functions return new state, seeded
randomness is threaded through each transition, and the renderer only reads snapshots.
