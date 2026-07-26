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

- `slow[u → v]` is directed, long-lived coverage signal. Explorers deposit on the
  homeward arc of every crossing, so it points toward the hill.
- `fast[u → v]` is a directed, short-lived food signal. A successful ant retraces its
  loop-erased route and deposits on the reverse arc, pointing toward food. Deposit
  strength increases with route distance from the hill, so the field has an explicit
  foodward gradient.

Scouts prefer locally uncovered edges:

```text
scoutWeight(u, v) =
  base / (1 + slowAvoidance · (slow[u → v] + slow[v → u])^α)
```

Workers wait at the hill until a local food signal exists, then sample adjacent arcs by
`base + fastInfluence · fast[u → v]^β`. A worker that reaches the end of a stale signal
uses its own breadcrumb route to head home. Food carriers follow adjacent hillward
coverage arcs that monotonically move backward through their own loop-erased
breadcrumbs; the immediately previous breadcrumb is the guaranteed fallback.

No routing decision reads the precomputed shortest route, graph-wide distance, or node
coordinates. Ants inspect only adjacent signals and their own route memory. The
shortest-path calculation is display-only. Short routes win because their ants return
and reinforce them more often.

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
