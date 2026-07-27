import {
  addFood,
  choiceProbabilities,
  createSimulation,
  decayPheromones,
  dominantFoodRoute,
  edgeKey,
  familiarityProbabilities,
  fieldGradient,
  foodProbabilitiesForNode,
  generateGraph,
  isConnected,
  moveFood,
  nextRandom,
  removeFood,
  stepSimulation,
} from "../src/colony.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const run = (state, steps, dt = 0.25) =>
  Array.from({ length: steps }).reduce(
    (current) => stepSimulation(current, dt),
    state,
  );

const field = (nodes, edges) => ({ nodes, edges });

Deno.test("seeded random values are reproducible and explicit", () => {
  assertEquals(nextRandom(42), nextRandom(42));
  assert(nextRandom(42)[1] !== 42);
});

Deno.test("generated graphs are deterministic, connected, and have distinct endpoints", () => {
  const [first] = generateGraph(8128, { nodeCount: 22, density: 0.4 });
  const [second] = generateGraph(8128, { nodeCount: 22, density: 0.4 });
  assertEquals(first, second);
  assert(isConnected(first));
  assert(first.foods.length === 1);
  assert(first.hill !== first.foods[0]);
  assert(first.edges.length >= first.nodes.length - 1);
});

Deno.test("maximum-size graphs stay sparse, connected, and quick to generate", () => {
  const startedAt = performance.now();
  const [graph] = generateGraph(77, { nodeCount: 1_200, density: 0.9 });
  const duration = performance.now() - startedAt;
  assertEquals(graph.nodes.length, 1_200);
  assertEquals(graph.edges.length, 3_302);
  assertEquals(new Set(graph.edges.map(({ id }) => id)).size, graph.edges.length);
  assert(graph.edges.every(({ a, b, length }) => a !== b && length > 0));
  assert(graph.nodes.every(({ x, y }) =>
    Number.isFinite(x) && Number.isFinite(y) &&
    x > 0 && x < 1 && y > 0 && y < 1
  ));
  assert(isConnected(graph));
  assert(duration < 1_500, `Max graph took ${duration.toFixed(0)}ms`);
});

Deno.test("the graph backbone has no bridge-connected islands", () => {
  const [graph] = generateGraph(91, { nodeCount: 120, density: 0.05 });
  const reachableWithout = (excludedId) => {
    const visit = (frontier, seen) => {
      if (frontier.length === 0) return seen;
      const [node, ...rest] = frontier;
      if (seen.includes(node)) return visit(rest, seen);
      const neighbors = graph.adjacency[node].filter((neighbor) =>
        edgeKey(node, neighbor) !== excludedId
      );
      return visit([...rest, ...neighbors], [...seen, node]);
    };
    return visit([graph.nodes[0].id], []).length;
  };
  assert(
    graph.edges.every(({ id }) => reachableWithout(id) === graph.nodes.length),
  );
});

Deno.test("food pheromone fades faster than exploration pheromone", () => {
  const decayed = decayPheromones(
    {
      slow: field({ 0: 1 }, { edge: 1 }),
      fast: field({ 0: 1 }, { edge: 1 }),
    },
    { slowHalfLife: 40, fastHalfLife: 8 },
    8,
  );
  assert(decayed.fast.nodes[0] < decayed.slow.nodes[0]);
  assert(decayed.fast.edges.edge < decayed.slow.edges.edge);
  assert(Math.abs(decayed.fast.nodes[0] - 0.5) < 1e-9);
});

Deno.test("pheromone polarity is derived from scalar endpoint concentrations", () => {
  const pheromone = field(
    { 0: 0.2, 1: 0.7 },
    { [edgeKey(0, 1)]: 2 },
  );
  assert(fieldGradient(pheromone, 0, 1) > 0);
  assert(fieldGradient(pheromone, 1, 0) < 0);
  assertEquals(Object.keys(pheromone.edges), [edgeKey(0, 1)]);
});

Deno.test("food seekers climb the local food gradient linearly", () => {
  const pheromones = {
    slow: field(
      { 0: 0, 1: 0, 2: 0 },
      { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 0 },
    ),
    fast: field(
      { 0: 0.1, 1: 0.3, 2: 0.7 },
      { [edgeKey(0, 1)]: 1, [edgeKey(0, 2)]: 1 },
    ),
  };
  const params = {
    baseWeight: 0.05,
    slowInfluence: 0.5,
    slowExponent: 1,
    fastInfluence: 3,
    distanceInfluence: 0,
    reversePenalty: 1,
  };
  const choices = choiceProbabilities(0, [1, 2], pheromones, params);
  const expected = (0.05 + 3 * 0.6) / (0.05 + 3 * 0.2);
  assert(
    Math.abs(
      choices[1].probability / choices[0].probability - expected,
    ) < 1e-9,
  );
  assertEquals(choiceProbabilities(2, [0], pheromones, params), []);
});

Deno.test("persistent trails weakly recruit while novelty choices prefer uncovered edges", () => {
  const pheromones = {
    slow: field(
      { 0: 1, 1: 0.8, 2: 0.8 },
      { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 2 },
    ),
    fast: field(
      { 0: 0, 1: 0, 2: 0 },
      { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 0 },
    ),
  };
  const params = {
    baseWeight: 0.05,
    slowInfluence: 1,
    slowExponent: 1,
    fastInfluence: 1,
    distanceInfluence: 0,
    reversePenalty: 1,
  };
  const familiar = familiarityProbabilities(0, [1, 2], pheromones, params);
  const novel = choiceProbabilities(0, [1, 2], pheromones, params, true);
  assert(familiar[1].probability > familiar[0].probability);
  assert(novel[0].probability > novel[1].probability);
});

Deno.test("the whole colony leaves immediately without route memory", () => {
  const initial = createSimulation({ seed: 41 });
  const started = stepSimulation(initial, 1 / 30);
  assertEquals(
    started.ants.filter(({ edge }) => edge !== null).length,
    initial.ants.length,
  );
  assert(
    started.ants.every((ant) =>
      !Object.hasOwn(ant, "route") &&
      !Object.hasOwn(ant, "returnIndex") &&
      ant.edge?.exploring === true
    ),
  );
});

Deno.test("first returns use the hill gradient and established returns reverse food", () => {
  let state = createSimulation({ seed: 8 });
  let sawSlow = false;
  let sawFast = false;
  for (let step = 0; step < 1_200 && !(sawSlow && sawFast); step += 1) {
    state = stepSimulation(state, 0.25);
    state.ants.filter((ant) => ant.mode === "return" && ant.edge).forEach((ant) => {
      const gradient = fieldGradient(
        state.pheromones[ant.edge.returnSignal],
        ant.edge.from,
        ant.edge.to,
      );
      if (ant.edge.returnSignal === "slow") {
        sawSlow = true;
        assert(gradient > 0, "Slow fallback must climb toward the hill");
      } else {
        sawFast = true;
        assert(gradient < 0, "Carriers must reverse the food gradient");
      }
    });
  }
  assert(sawSlow, "Expected a first-return slow-gradient carrier");
  assert(sawFast, "Expected a later carrier to reverse the food gradient");
});

Deno.test("dominant trails favor near-shortest routes across graph seeds", () => {
  const ratios = Array.from({ length: 12 }, (_, seed) => {
    const final = run(createSimulation({ seed: seed + 1 }), 720);
    const dominant = dominantFoodRoute(final);
    assert(dominant !== null, `Seed ${seed + 1} has no complete food trail`);
    return dominant.distance / final.stats.shortestDistance;
  });
  assert(
    ratios.filter((ratio) => ratio <= 1.1).length >= 10,
    `Dominant route ratios: ${ratios.map((ratio) => ratio.toFixed(3))}`,
  );
});

Deno.test("simulation is immutable, locally signaled, and productive", () => {
  const initial = createSimulation({
    seed: 93,
    params: {
      nodeCount: 8,
      density: 0.8,
      antCount: 48,
      exploreRate: 0.3,
      speed: 0.6,
      fastHalfLife: 20,
    },
  });
  const snapshot = JSON.stringify(initial);
  const final = run(initial, 240);
  assertEquals(JSON.stringify(initial), snapshot, "Previous state was mutated");
  assert(final.stats.discoveries > 0);
  assert(final.stats.deliveries > 0);
  assert(Object.values(final.pheromones.slow.edges).some((value) => value > 0));
  assert(Object.values(final.pheromones.fast.edges).some((value) => value > 0));
  assert(final.ants.every((ant) => !Object.hasOwn(ant, "route")));
});

const adaptationFixture = () =>
  run(
    createSimulation({
      seed: 93,
      params: {
        nodeCount: 8,
        density: 0.8,
        antCount: 16,
        exploreRate: 0.3,
        speed: 0.6,
        fastHalfLife: 2,
      },
    }),
    200,
  );

const assertColonyContinues = (before, after) => {
  assert(after.ants === before.ants);
  assert(after.pheromones === before.pheromones);
  assertEquals(after.rngSeed, before.rngSeed);
  assertEquals(after.elapsed, before.elapsed);
  assertEquals(after.stats.deliveries, before.stats.deliveries);
  assertEquals(after.stats.discoveries, before.stats.discoveries);
};

Deno.test("food mutations preserve the running colony", () => {
  const warm = adaptationFixture();
  const originalSnapshot = JSON.stringify(warm);
  const originalFood = warm.graph.foods[0];

  const added = addFood(warm, 1);
  assertColonyContinues(warm, added);
  assertEquals(added.graph.foods, [originalFood, 1]);

  const moved = moveFood(added, originalFood, 2);
  assertColonyContinues(added, moved);
  assertEquals(moved.graph.foods, [2, 1]);

  const removed = removeFood(moved, 1);
  assertColonyContinues(moved, removed);
  assertEquals(removed.graph.foods, [2]);
  assertEquals(removed.stats.bestDistance, null);
  assertEquals(JSON.stringify(warm), originalSnapshot);
});

Deno.test("obsolete food signal fades while the colony adapts", () => {
  const warm = adaptationFixture();
  const source = warm.graph.foods[0];
  const destination = 6;
  const oldEdge = edgeKey(...warm.stats.shortestRoute.slice(-2));
  const moved = moveFood(warm, source, destination);
  assertColonyContinues(warm, moved);

  const adapted = run(moved, 240);
  const newEdge = edgeKey(...adapted.stats.shortestRoute.slice(-2));
  assert(adapted.stats.deliveries > warm.stats.deliveries);
  assert(adapted.stats.discoveries > warm.stats.discoveries);
  assert(adapted.pheromones.fast.edges[newEdge] > 0);
  assert(
    adapted.pheromones.fast.edges[newEdge] > adapted.pheromones.fast.edges[oldEdge],
  );
  assert(
    adapted.pheromones.fast.nodes[destination] >
      adapted.pheromones.fast.nodes[source],
  );
  assert(foodProbabilitiesForNode(adapted, adapted.graph.hill).length > 0);
});
