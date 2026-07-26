import {
  addFood,
  arcKey,
  choiceProbabilities,
  createSimulation,
  decayPheromones,
  edgeKey,
  foodDepositForReturn,
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
  assertEquals(graph.edges.length, 3_005);
  assertEquals(new Set(graph.edges.map(({ id }) => id)).size, graph.edges.length);
  assert(graph.edges.every(({ a, b, length }) => a !== b && length > 0));
  assert(graph.nodes.every(({ x, y }) =>
    Number.isFinite(x) && Number.isFinite(y) &&
    x > 0 && x < 1 && y > 0 && y < 1
  ));
  assert(isConnected(graph));
  assert(duration < 1_500, `Max graph took ${duration.toFixed(0)}ms`);
});

Deno.test("fast pheromone fades faster than slow pheromone", () => {
  const params = { slowHalfLife: 40, fastHalfLife: 8 };
  const decayed = decayPheromones(
    { slow: { edge: 1 }, fast: { arc: 1 } },
    params,
    8,
  );
  assert(decayed.fast.arc < decayed.slow.edge);
  assert(Math.abs(decayed.fast.arc - 0.5) < 1e-9);
});

Deno.test("worker odds are proportional to pheromone while scouts stay uniform", () => {
  const pheromones = {
    slow: { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 0 },
    fast: { [arcKey(0, 1)]: 0.1, [arcKey(0, 2)]: 2 },
  };
  const params = {
    baseWeight: 0.05,
    slowAvoidance: 0,
    slowExponent: 1,
    fastInfluence: 3,
    fastExponent: 1,
  };
  const worker = choiceProbabilities(
    0,
    [1, 2],
    pheromones,
    params,
  );
  const scout = choiceProbabilities(
    0,
    [1, 2],
    pheromones,
    params,
    true,
  );
  assert(worker[1].probability > worker[0].probability * 10);
  assertEquals(scout.map(({ probability }) => probability), [0.5, 0.5]);
});

Deno.test("slow coverage repels workers but fast food signal overrides it", () => {
  const params = {
    baseWeight: 0.05,
    slowAvoidance: 1,
    slowExponent: 1,
    fastInfluence: 1,
    fastExponent: 1,
  };
  const covered = {
    slow: { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 2 },
    fast: { [arcKey(0, 1)]: 0, [arcKey(0, 2)]: 0 },
  };
  const repelled = choiceProbabilities(0, [1, 2], covered, params);
  assert(repelled[0].probability > repelled[1].probability);

  const confirmedFood = {
    slow: { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 10 },
    fast: { [arcKey(0, 1)]: 0, [arcKey(0, 2)]: 0.5 },
  };
  const attracted = choiceProbabilities(0, [1, 2], confirmedFood, params);
  assert(attracted[1].probability > 0.9);
});

Deno.test("return deposit points toward food and becomes stronger along the gradient", () => {
  const graph = {
    edgeById: {
      [edgeKey(0, 1)]: { length: 1 },
      [edgeKey(1, 2)]: { length: 1 },
    },
  };
  const ant = {
    route: [0, 1, 2],
    returnIndex: 2,
    tripDistance: 2,
  };
  const params = { fastDeposit: 1, foodGradientFloor: 0.25 };
  const nearFood = foodDepositForReturn(ant, graph, params, 2);
  const nearHill = foodDepositForReturn(ant, graph, params, 1);
  assertEquals(nearFood.key, arcKey(1, 2));
  assertEquals(nearHill.key, arcKey(0, 1));
  assert(nearFood.amount > nearHill.amount);
});

Deno.test("simulation transitions are immutable and eventually deliver food", () => {
  const initial = createSimulation({
    seed: 93,
    params: {
      nodeCount: 8,
      density: 0.8,
      antCount: 48,
      scoutRate: 0.4,
      speed: 0.6,
      fastHalfLife: 20,
    },
  });
  const snapshot = JSON.stringify(initial);
  const final = Array.from({ length: 1800 }).reduce(
    (state) => stepSimulation(state, 1 / 30),
    initial,
  );
  assertEquals(JSON.stringify(initial), snapshot, "Previous state was mutated");
  assert(final.stats.discoveries > 0, "Expected at least one food discovery");
  assert(final.stats.deliveries > 0, "Expected at least one completed delivery");
  assert(Object.values(final.pheromones.slow).some((value) => value > 0));
  assert(Object.values(final.pheromones.fast).some((value) => value > 0));
  assert(
    Math.abs(final.stats.bestDistance - final.stats.shortestDistance) < 1e-9,
    "Expected scouts to discover the shortest route",
  );

  const shortestArcs = final.stats.shortestRoute.slice(1).map((node, index) =>
    arcKey(final.stats.shortestRoute[index], node)
  );
  const average = (values) =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const onShortestRoute = shortestArcs.map((arc) => final.pheromones.fast[arc]);
  const offShortestRoute = Object.entries(final.pheromones.fast)
    .filter(([arc]) => !shortestArcs.includes(arc))
    .map(([, value]) => value);
  assert(
    average(onShortestRoute) > average(offShortestRoute),
    "Expected the shortest route to receive more food signal on average",
  );
});

const adaptationFixture = () => {
  const initial = createSimulation({
    seed: 93,
    params: {
      nodeCount: 8,
      density: 0.8,
      antCount: 16,
      scoutRate: 0.4,
      speed: 0.6,
      fastHalfLife: 2,
    },
  });
  return Array.from({ length: 600 }).reduce(
    (state) => stepSimulation(state, 1 / 30),
    initial,
  );
};

const assertColonyContinues = (before, after) => {
  assert(after.ants === before.ants, "Ant records should be preserved");
  assert(
    after.pheromones === before.pheromones,
    "Pheromone fields should be preserved",
  );
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
  assertEquals(removed.stats.bestRoute, []);
  assertEquals(removed.stats.bestDistance, null);
  assertEquals(JSON.stringify(warm), originalSnapshot, "Food edits mutated input");
});

Deno.test("old food signal fades while the uninterrupted colony adapts", () => {
  const warm = adaptationFixture();
  const source = warm.graph.foods[0];
  const destination = 6;
  const oldRoute = warm.stats.shortestRoute;
  const oldArc = arcKey(oldRoute.at(-2), oldRoute.at(-1));
  const oldSignal = warm.pheromones.fast[oldArc];
  const moved = moveFood(warm, source, destination);
  assertColonyContinues(warm, moved);

  const adapted = Array.from({ length: 600 }).reduce(
    (state) => stepSimulation(state, 1 / 30),
    moved,
  );
  const newRoute = adapted.stats.shortestRoute;
  const newArc = arcKey(newRoute.at(-2), newRoute.at(-1));
  assertEquals(adapted.stats.bestRoute, newRoute);
  assert(
    Math.abs(adapted.stats.bestDistance - adapted.stats.shortestDistance) < 1e-9,
  );
  assert(adapted.stats.deliveries > warm.stats.deliveries);
  assert(adapted.stats.discoveries > warm.stats.discoveries);
  assert(adapted.pheromones.fast[newArc] > adapted.pheromones.fast[oldArc]);
  assert(adapted.pheromones.fast[oldArc] < oldSignal / 2);
});
