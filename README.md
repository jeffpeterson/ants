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

## Algorithm

The graph uses jittered spatial cells, a bridge-free local grid backbone, and extra
nearby edges. This stays sparse and connected from 8 through 1,200 nodes. Ants move at
one constant physical speed: crossing an edge takes `edge.length / speed`, so a route of
length `D` naturally permits laps at a rate proportional to `1 / D`.

The colony maintains two fields:

- `slow[u → v]` is directed, long-lived coverage signal. Each crossing deposits on the
  ant's local homeward arc, so it points toward the hill.
- `fast[u → v]` is a directed, short-lived food signal. A successful ant retraces its
  loop-erased route and deposits on the reverse arc, pointing toward food. Deposit
  strength increases with route distance from the hill, so the field has an explicit
  foodward gradient.

Before any food signal reaches the hill, ants use staggered local wait timers to take
turns on finite discovery tours. An exploring ant prefers locally uncovered, unvisited
edges:

```text
exploreWeight(u, v) =
  base / (1 + slowAvoidance · (slow[u → v] + slow[v → u])^α)
```

Other ants wait at the hill until a locally usable food signal exists, then sample
adjacent arcs by `base + fastInfluence · fast[u → v]^β`. Signal weaker than the baseline
choice weight is treated as expired. Once a trail exists, every ant has a local chance
at each junction to enter a bounded three-edge exploration burst. This is a temporary
“try another way” decision, not a permanent scout identity.

At a normal trail junction, the marginal choice is
`(1 - exploreRate) · foodDistribution + exploreRate · coverageDistribution`.

A successful probe rejoins the food signal. A failed probe retraces its own breadcrumbs
to its branch point; an exhausted discovery tour or stale trail retraces to the hill.
This latched recovery prevents ants from oscillating at the end of obsolete signal. Food
carriers follow adjacent hillward coverage arcs that monotonically move backward through
their own loop-erased breadcrumbs; the immediately previous breadcrumb is the guaranteed
fallback.

No routing decision reads the precomputed shortest route, graph-wide distance, or node
coordinates. Ants inspect only adjacent signals and their own route memory. The
shortest-path calculation is display-only. Short routes win because their ants return
and reinforce them more often.

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
