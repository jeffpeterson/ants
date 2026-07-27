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

At the beginning of a run, every ant immediately starts a finite discovery tour. An
exploring ant prefers locally uncovered, unvisited edges:

```text
exploreWeight(u, v) =
  base / (1 + slowAvoidance · (slow[u → v] + slow[v → u])^α)
```

Once a locally usable food signal exists, ants sample adjacent arcs with a linear
pheromone response and a local edge-length heuristic:

```text
followWeight(u, v) =
  (base + fastInfluence · fast[u → v]) / edgeLength(u, v)^distanceInfluence
```

At each later junction, an ant has an independent `exploreRate` chance to try one
less-covered edge, then immediately re-evaluates the food signal. This is a temporary
“try this way” choice, not a permanent scout identity. A failed choice reverses over
that edge; an exhausted discovery tour or stale trail retraces to the hill. Food
carriers follow adjacent hillward coverage arcs that monotonically move backward through
their own loop-erased breadcrumbs; the immediately previous breadcrumb is the guaranteed
fallback.

No routing decision reads the precomputed shortest route, graph-wide distance, or node
coordinates. Ants inspect only adjacent signals and their own route memory. The
shortest-path calculation is display-only. A carrier deposits `Q / L`, where `L` is the
length of its own completed outbound trip. This is the Ant System's route-quality
update, and it compounds the natural throughput advantage: equal-speed ants complete
shorter round trips more often. Pheromone response remains linear so an early adequate
route cannot turn a small signal lead into an irreversible superlinear lock-in.

## Model invariants

- Every ant leaves at the start; later exploration is a one-choice behavior, never a
  permanent caste.
- Only a successful carrier lays food signal, and only while traveling toward the hill.
- Coverage arcs point toward the hill; food arcs point toward food.
- Decisions use adjacent edge length and pheromone, the ant's own loop-free breadcrumbs
  and completed-trip length, and seeded randomness. They never use a global route.
- Ant speed is constant in physical graph units. Long edges and routes take
  proportionally longer to traverse.
- Evaporation, rather than a hard pheromone ceiling, keeps signals finite and lets stale
  routes lose influence.

## Research basis

The implementation draws on the trail renewal and evaporation behavior summarized in
[Trail pheromone](https://en.wikipedia.org/wiki/Trail_pheromone), the locally
proportional response measured by
[Perna et al.](https://doi.org/10.1371/journal.pcbi.1002592), and the linear-flow
conditions studied by [Garg et al.](https://doi.org/10.1073/pnas.2207959120). The
`Q / L` update and adjacent-edge visibility follow the original
[Ant System](https://doi.org/10.1109/3477.484436). The long-lived channel remains an
explicit coverage breadcrumb in this playground rather than claiming to reproduce a
particular ant species' exploration pheromone.

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
