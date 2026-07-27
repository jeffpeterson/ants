import {
  addFood,
  arcKey,
  choiceProbabilities,
  createSimulation,
  decayPheromones,
  dominantFoodRoute,
  edgeKey,
  foodDepositForReturn,
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

Deno.test("trail choices follow pheromone while exploration ignores it", () => {
  const pheromones = {
    slow: { [edgeKey(0, 1)]: 0, [edgeKey(0, 2)]: 0 },
    fast: { [arcKey(0, 1)]: 0.1, [arcKey(0, 2)]: 2 },
  };
  const params = {
    baseWeight: 0.05,
    slowAvoidance: 0,
    slowExponent: 1,
    fastInfluence: 3,
  };
  const worker = choiceProbabilities(
    0,
    [1, 2],
    pheromones,
    params,
  );
  const exploring = choiceProbabilities(
    0,
    [1, 2],
    pheromones,
    params,
    true,
  );
  const expectedRatio = (0.05 + 3 * 2) / (0.05 + 3 * 0.1);
  assert(
    Math.abs(
      worker[1].probability / worker[0].probability - expectedRatio,
    ) < 1e-9,
    "Food pheromone response must remain linear",
  );
  assertEquals(exploring.map(({ probability }) => probability), [0.5, 0.5]);
});

Deno.test("coverage steers exploration while trail choices respond only to food", () => {
  const params = {
    baseWeight: 0.05,
    slowAvoidance: 1,
    slowExponent: 1,
    fastInfluence: 1,
  };
  const covered = {
    slow: {
      [arcKey(0, 1)]: 0,
      [arcKey(1, 0)]: 0,
      [arcKey(0, 2)]: 1,
      [arcKey(2, 0)]: 1,
    },
    fast: { [arcKey(0, 1)]: 0, [arcKey(0, 2)]: 0 },
  };
  const workers = choiceProbabilities(0, [1, 2], covered, params);
  const repelled = choiceProbabilities(0, [1, 2], covered, params, true);
  assertEquals(workers.map(({ probability }) => probability), [0.5, 0.5]);
  assert(repelled[0].probability > repelled[1].probability);

  const confirmedFood = {
    slow: {
      [arcKey(0, 1)]: 0,
      [arcKey(1, 0)]: 0,
      [arcKey(0, 2)]: 10,
      [arcKey(2, 0)]: 0,
    },
    fast: { [arcKey(0, 1)]: 0, [arcKey(0, 2)]: 0.5 },
  };
  const attracted = choiceProbabilities(0, [1, 2], confirmedFood, params);
  assert(attracted[1].probability > 0.9);
});

Deno.test("the whole colony starts finite discovery tours immediately", () => {
  const initial = createSimulation({ seed: 41 });
  const started = stepSimulation(initial, 1 / 30);
  const moving = started.ants.filter(({ edge }) => edge !== null);
  assertEquals(moving.length, initial.ants.length);
  assert(
    moving.every(({ searchState, edge }) =>
      searchState.kind === "explore" &&
      searchState.left >= 0 &&
      edge.exploring
    ),
  );
});

Deno.test("dominant trails favor near-shortest routes across graph seeds", () => {
  const ratios = Array.from({ length: 12 }, (_, seed) => {
    const initial = createSimulation({ seed: seed + 1 });
    const final = Array.from({ length: 720 }).reduce(
      (state) => stepSimulation(state, 0.25),
      initial,
    );
    const dominant = dominantFoodRoute(final);
    assert(dominant !== null, `Seed ${seed + 1} has no complete food trail`);
    return dominant.distance / final.stats.shortestDistance;
  });
  assert(
    ratios.filter((ratio) => ratio <= 1.1).length >= 9,
    `Dominant route ratios: ${ratios.map((ratio) => ratio.toFixed(3))}`,
  );
});

Deno.test("faint residue is not mistaken for a usable food trail", () => {
  const initial = createSimulation({ seed: 17 });
  const node = initial.graph.hill;
  const neighbor = initial.graph.adjacency[node][0];
  const withFast = (amount) => ({
    ...initial,
    pheromones: {
      ...initial.pheromones,
      fast: {
        ...initial.pheromones.fast,
        [arcKey(node, neighbor)]: amount,
      },
    },
  });
  assertEquals(foodProbabilitiesForNode(withFast(1e-8), node), []);
  assert(foodProbabilitiesForNode(withFast(1), node).length > 0);
});

Deno.test("temporary one-edge choices either rejoin signal or retrace", () => {
  const initial = createSimulation({ seed: 1 });
  const runChecked = (start, count) =>
    Array.from({ length: count }).reduce(
      ({ state, sawBacktrack }) => {
        const next = stepSimulation(state, 1 / 30);
        const backtracks = next.ants.filter(
          ({ edge }) => edge?.backtrackFrom !== undefined,
        );
        backtracks.forEach((ant) => {
          assert(ant.edge.backtrackTo < ant.edge.backtrackFrom);
          assertEquals(ant.edge.to, ant.route[ant.edge.backtrackTo]);
        });
        assert(
          next.ants
            .filter(({ mode }) => mode === "return")
            .every(({ edge }) => edge?.exploring !== true),
          "Food carriers must never enter exploration mode",
        );
        assert(
          next.ants
            .filter(({ searchState }) =>
              ["explore", "probe"].includes(searchState.kind)
            )
            .every(({ searchState }) => searchState.left >= 0),
          "Every exploration mode must have a finite remaining budget",
        );
        return {
          state: next,
          sawBacktrack: sawBacktrack || backtracks.length > 0,
        };
      },
      { state: start, sawBacktrack: false },
    );
  const result = runChecked(initial, 5_400);
  const final = result.state;
  assert(
    Math.abs(final.stats.bestDistance - final.stats.shortestDistance) < 1e-9,
    "Expected local exploration to find the shortest route",
  );
  assert(
    result.sawBacktrack,
    "Expected a failed one-edge choice to retrace its breadcrumb",
  );
  assert(
    final.ants.every(({ exploreChoices, followChoices }) =>
      exploreChoices > 0 && followChoices > 0
    ),
    "Every ant should alternate between exploring and following",
  );

  assert(dominantFoodRoute(final) !== null);
});

Deno.test("return deposit encodes food direction, gradient, and completed-trip length", () => {
  const graph = {
    edgeById: {
      [edgeKey(0, 1)]: { length: 1 },
      [edgeKey(1, 2)]: { length: 1 },
    },
  };
  const nearFoodAnt = {
    route: [0, 1, 2],
    returnIndex: 2,
    tripDistance: 2,
    edge: { from: 2, to: 1 },
  };
  const nearHillAnt = {
    ...nearFoodAnt,
    returnIndex: 1,
    edge: { from: 1, to: 0 },
  };
  const longerTripAnt = { ...nearFoodAnt, tripDistance: 4 };
  const params = { fastDeposit: 1, foodGradientFloor: 0.25 };
  const nearFood = foodDepositForReturn(nearFoodAnt, graph, params);
  const nearHill = foodDepositForReturn(nearHillAnt, graph, params);
  const longerTrip = foodDepositForReturn(longerTripAnt, graph, params);
  assertEquals(nearFood.key, arcKey(1, 2));
  assertEquals(nearHill.key, arcKey(0, 1));
  assert(nearFood.amount > nearHill.amount);
  assert(
    nearFood.amount > longerTrip.amount,
    "An ant's shorter completed trip should deposit more food signal",
  );
});

Deno.test("simulation transitions are immutable and eventually deliver food", () => {
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
  const final = Array.from({ length: 1800 }).reduce(
    (state) => stepSimulation(state, 1 / 30),
    initial,
  );
  assertEquals(JSON.stringify(initial), snapshot, "Previous state was mutated");
  assert(final.stats.discoveries > 0, "Expected at least one food discovery");
  assert(final.stats.deliveries > 0, "Expected at least one completed delivery");
  assert(Object.values(final.pheromones.slow).some((value) => value > 0));
  assert(Object.values(final.pheromones.fast).some((value) => value > 0));
  const returning = final.ants.filter(({ mode, edge }) =>
    mode === "return" && edge !== null
  );
  assert(returning.length > 0);
  assert(
    returning.every(({ edge }) =>
      edge.nextReturnIndex < edge.returnIndex &&
      final.pheromones.slow[arcKey(edge.from, edge.to)] > 0
    ),
    "Food carriers must follow a hillward coverage arc",
  );
  assert(
    Math.abs(final.stats.bestDistance - final.stats.shortestDistance) < 1e-9,
    "Expected temporary exploration to discover the shortest route",
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
      exploreRate: 0.3,
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
