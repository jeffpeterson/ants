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

The graph uses jittered spatial cells, a local random spanning tree, and extra nearby
edges. This stays sparse and connected from 8 through 1,200 nodes. Ants move at one
constant physical speed: crossing an edge takes `edge.length / speed`, so a route of
length `D` naturally permits laps at a rate proportional to `1 / D`.

The colony maintains two fields:

- `slow[e]` is undirected, long-lived coverage memory deposited on every completed edge.
  Searching ants prefer edges with less of it.
- `fast[u → v]` is a directed, short-lived food signal. A successful ant retraces its
  loop-erased route and deposits on the reverse arc, pointing toward food. Deposit
  strength increases with route distance from the hill, so the field has an explicit
  foodward gradient.

A worker at node `u` samples neighbor `v` in proportion to:

```text
base / (1 + slowAvoidance · slow[e]^α)
  + fastInfluence · fast[u → v]^β
```

Scouts sample uniformly. Fast attraction is not divided by slow avoidance, so a
confirmed food route overrides the coverage preference. There is no global route
heuristic and no inverse-length term in that choice. Short routes win because their ants
return and reinforce them more often.

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
