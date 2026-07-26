# Formic

Formic is a browser-based ant-colony pathfinding playground. A seeded random graph gives
ants a hill, a food source, and several competing routes. The simulation has a pure
functional core and a small imperative canvas/DOM shell.

## Run it

```sh
deno task dev
```

Open <http://localhost:4173>. Run the tests with:

```sh
deno task test
```

## Algorithm

The graph is a random geometric graph made connected by a minimum spanning tree, then
given extra short edges. Ants move at a constant physical speed, so a route of length
`D` naturally permits laps at a rate proportional to `1 / D`.

The colony maintains two fields:

- `slow[e]` is an undirected, long-lived trace deposited on every completed edge.
- `fast[u → v]` is a directed, short-lived food signal. A successful ant retraces its
  loop-erased route and deposits on the reverse arc, pointing toward food. Deposit
  strength increases with route distance from the hill, so the field has an explicit
  foodward gradient.

A worker at node `u` samples neighbor `v` in proportion to:

```text
base + slowInfluence · slow[e]^α + fastInfluence · fast[u → v]^β
```

Scouts sample uniformly. There is no global route heuristic and no inverse-length term
in that choice. Short routes win because their ants return and reinforce them more
often.

All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
