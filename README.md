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

The colony maintains two scalar pheromone fields. Each field stores one undirected
amount on every edge and one concentration at every node. It stores no directed arcs.
The apparent direction on an edge is computed when needed:

```text
gradient(field, u, v) = concentration[field, v] - concentration[field, u]
```

- The persistent field fades slowly. Searching ants extend it from a concentration
  maximum at the hill and weakly prefer familiar edges along its outward slope. A
  temporary novelty choice instead favors a less-covered adjacent edge.
- The food field fades quickly. A carrier extends it from a concentration maximum at
  food. Searching ants climb this field toward food; returning ants descend the same
  field toward the hill.

At the beginning, every ant immediately leaves the hill. Before a food field exists,
searchers spread along the persistent field. The first ant to find food cannot reverse a
food gradient that has not been laid yet, so it climbs the existing persistent gradient
to the hill while creating the first food gradient. Later trips use the food field in
both directions. If a volatile food gradient has a local gap, a carrier latches onto the
persistent hill gradient for that return.

```text
followWeight(u, v) =
  (base + influence · signedGradient(u, v))
  / edgeLength(u, v)^distanceInfluence

P(u → v) = followWeight(u, v) / Σ followWeight(u, option)
```

At each junction the ant samples a probability distribution over locally eligible edges.
An independent `exploreRate` choice is a one-edge “try this way” event, not a permanent
scout identity. If the food gradient is absent at the probed node, the ant can reverse
that one crossing and re-evaluate. This one-edge heading is not a stored route.

All food-return crossings deposit the same amount. Shorter routes win through
throughput: equal-speed ants complete and reinforce more short laps per minute. A linear
pheromone response keeps an early adequate route from gaining a superlinear lock-in.

## Model invariants

- A pheromone deposit has an amount and concentration, never a direction. Renderer
  arrows are derived from endpoint concentrations.
- Every ant leaves at the start. Later exploration is a one-edge choice, never a
  permanent caste.
- Only a successful carrier lays food pheromone, while returning to the hill.
- Searching ants climb the food field; established carriers descend the same field.
- Decisions use adjacent pheromone amounts, endpoint gradients, edge length, one-edge
  heading, mode, and seeded randomness. Ants have no route stack, map, coordinates, or
  shortest-path knowledge.
- Ant speed is constant in physical graph units. Long edges and routes take
  proportionally longer to traverse.
- Evaporation, rather than a hard pheromone ceiling, keeps signals finite and lets stale
  routes lose influence.

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
[Czaczkes et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC8837658/) found that naïve
_Lasius niger_ workers could not infer destination direction from pheromone alone on a
one-way trail. This playground therefore stores scalar concentrations and derives each
local gradient; it does not represent an ant depositing an arrow.

The probability rule follows the local proportional response measured by
[Perna et al.](https://doi.org/10.1371/journal.pcbi.1002592) and the linear-flow
conditions studied by [Garg et al.](https://doi.org/10.1073/pnas.2207959120). Trail
renewal and evaporation are summarized in
[Trail pheromone](https://en.wikipedia.org/wiki/Trail_pheromone).

Moving, adding, or removing food preserves ants, elapsed time, and both pheromone
fields. Returning ants finish trips from retired sources while old signals evaporate.
All simulation functions return new state, seeded randomness is threaded through each
transition, and the renderer only reads snapshots.
