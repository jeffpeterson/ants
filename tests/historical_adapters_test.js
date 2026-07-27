import {
  addFood,
  clearPheromones,
  createSimulation,
  deriveMetrics,
  ENGINES,
  foodProbabilitiesForNode,
  getEngine,
  HISTORICAL_ENGINES,
  moveFood,
  removeFood,
  resetRun,
  setEndpoint,
  stepSimulation,
  updateParams,
} from "../src/colony.js";
import * as current from "../src/engines/current.js";
import * as HISTORICAL_SOURCE from "../src/engines/historical/source/index.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const deepFreeze = (value) => {
  if (value !== null && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const commonGraph = () => {
  const edge = { id: "0:1", a: 0, b: 1, length: 0.2 };
  return {
    nodes: [
      { id: 0, x: 0.2, y: 0.5 },
      { id: 1, x: 0.4, y: 0.5 },
    ],
    edges: [edge],
    adjacency: { 0: [1], 1: [0] },
    edgeById: { [edge.id]: edge },
    hill: 0,
    foods: [1],
  };
};

const largerCommonGraph = () =>
  current.generateGraph(71, {
    nodeCount: 12,
    density: 0.4,
    mapVariation: 0.6,
  })[0];

const coreState = (state) =>
  Object.fromEntries(
    [
      "graphSeed",
      "runSeed",
      "graphParams",
      "rngSeed",
      "elapsed",
      "params",
      "graph",
      "pheromones",
      "ants",
      "stats",
    ].flatMap((key) => Object.hasOwn(state, key) ? [[key, state[key]]] : []),
  );

const expectedTrailKeys = (graph) => ({
  nodes: graph.nodes.map(({ id }) => String(id)).toSorted(),
  edges: graph.edges.map(({ id }) => id).toSorted(),
  arcs: graph.edges
    .flatMap(({ a, b }) => [`${a}>${b}`, `${b}>${a}`])
    .toSorted(),
});

Deno.test("all historical engines satisfy the immutable registry contract", () => {
  assertEquals(HISTORICAL_ENGINES.map(({ id }) => id), [
    "A0",
    "A1",
    "A2",
    "A3",
    "A4",
    "B0",
    "B1",
  ]);
  assertEquals(new Set(ENGINES.map(({ id }) => id)).size, ENGINES.length);
  assert(Object.isFrozen(HISTORICAL_ENGINES));
  HISTORICAL_ENGINES.forEach((engine) => {
    assert(getEngine(engine.id) === engine);
    assert(Object.isFrozen(engine));
    assert(Object.isFrozen(engine.capabilities));
    assert(Object.isFrozen(engine.traits));
    assert(/^[0-9a-f]{40}$/u.test(engine.revision));
    assert(engine.defaults === HISTORICAL_SOURCE[engine.id].DEFAULTS);
    [
      "createSimulation",
      "stepSimulation",
      "updateParams",
      "resetRun",
      "clearPheromones",
      "moveFood",
      "addFood",
      "removeFood",
      "setEndpoint",
      "deriveMetrics",
      "dominantFoodRoute",
      "foodProbabilitiesForNode",
    ].forEach((method) =>
      assert(typeof engine[method] === "function", `${engine.id}.${method}`)
    );
  });
});

Deno.test("historical engines accept one frozen common graph without mutation", () => {
  const graph = deepFreeze(largerCommonGraph());
  const graphParams = deepFreeze({
    nodeCount: graph.nodes.length,
    density: 0.4,
    mapVariation: 0.6,
  });
  const graphSnapshot = JSON.stringify(graph);

  HISTORICAL_ENGINES.forEach((engine) => {
    const initial = engine.createSimulation({
      graph,
      graphParams,
      graphSeed: 71,
      runSeed: 503,
      resources: { antCount: 8, speed: 0.31 },
    });
    const stateSnapshot = JSON.stringify(initial);
    const next = engine.stepSimulation(initial, 0.25);
    const keys = expectedTrailKeys(initial.graph);

    assertEquals(JSON.stringify(graph), graphSnapshot, `${engine.id} mutated graph`);
    assertEquals(JSON.stringify(initial), stateSnapshot, `${engine.id} mutated state`);
    assertEquals(initial.adapter.lane, "common");
    assertEquals(initial.adapter.runSeed, 503);
    assert(initial.graphParams === graphParams);
    assertEquals(initial.ants.length, 8);
    assertEquals(initial.params.speed, 0.31);
    assertEquals(initial.graph.nodes, graph.nodes);
    assertEquals(initial.graph.edges, graph.edges);
    assertEquals(
      initial.graph.foods,
      engine.id === "A0" ? graph.foods.slice(0, 1) : graph.foods,
    );
    ["slow", "fast"].forEach((channel) => {
      assert(Object.isFrozen(initial.trailView[channel]));
      assertEquals(
        Object.keys(initial.trailView[channel].nodes).toSorted(),
        keys.nodes,
      );
      assertEquals(
        Object.keys(initial.trailView[channel].edges).toSorted(),
        keys.edges,
      );
      assertEquals(
        Object.keys(initial.trailView[channel].arcs).toSorted(),
        keys.arcs,
      );
    });
    assert(Number.isFinite(next.elapsed));
    assert(next.rngSeed !== undefined);
  });
});

Deno.test("historical common-graph transitions preserve archived source semantics", () => {
  const graph = largerCommonGraph();
  HISTORICAL_ENGINES.forEach((engine) => {
    let direct = engine.createSimulation({
      graph,
      graphSeed: 71,
      runSeed: 907,
      resources: { antCount: 8, speed: 0.27 },
    });
    let adapted = direct;

    Array.from({ length: 16 }).forEach(() => {
      direct = HISTORICAL_SOURCE[engine.id].stepSimulation(direct, 0.25);
      adapted = engine.stepSimulation(adapted, 0.25);
      assertEquals(
        coreState(adapted),
        coreState(direct),
        `${engine.id} adapter changed archived transition state`,
      );
    });
  });
});

Deno.test("historical graph and colony random streams stay independent", () => {
  HISTORICAL_ENGINES.forEach((engine) => {
    const first = engine.createSimulation({
      graphSeed: 101,
      runSeed: 201,
      params: { nodeCount: 8, density: 0.3 },
      resources: { antCount: 8, speed: 0.29 },
    });
    const second = engine.createSimulation({
      graphSeed: 101,
      runSeed: 202,
      params: { nodeCount: 8, density: 0.3 },
      resources: { antCount: 8, speed: 0.29 },
    });

    assertEquals(first.graph, second.graph);
    assertEquals(first.params, second.params);
    assertEquals(first.runSeed, 201);
    assertEquals(second.runSeed, 202);
    assert(first.rngSeed !== second.rngSeed);

    const advanced = engine.stepSimulation(first, 0.25);
    const reset = engine.resetRun(advanced);
    assertEquals(reset.graphSeed, first.graphSeed);
    assertEquals(reset.runSeed, first.runSeed);
    assertEquals(reset.rngSeed, first.rngSeed);
    assertEquals(reset.ants, first.ants);
  });
});

Deno.test("historical engines generate and step their native state schemas", () => {
  HISTORICAL_ENGINES.forEach((engine) => {
    let state = engine.createSimulation({
      graphSeed: 19,
      runSeed: 23,
      params: { nodeCount: 8, density: 0.25 },
      resources: { antCount: 8, speed: 0.3 },
    });
    Array.from({ length: 8 }).forEach(() => {
      state = engine.stepSimulation(state, 0.25);
    });

    assertEquals(state.adapter.lane, "native");
    assertEquals(
      Object.keys(state.graphParams).toSorted(),
      engine.id === "B1"
        ? [
          "density",
          "islandCount",
          "islandLinks",
          "islandSeparation",
          "nodeCount",
        ]
        : ["density", "nodeCount"],
    );
    Object.entries(state.graphParams).forEach(([key, value]) =>
      assertEquals(value, state.params[key])
    );
    assertEquals(state.ants.length, 8);
    assert(state.graph.nodes.length >= 8);
    assert(state.graph.edges.length >= state.graph.nodes.length - 1);
    assert(Number.isFinite(state.stats.shortestDistance));
    assert(Number.isFinite(state.elapsed));
    assertEquals(
      deriveMetrics({
        ...state,
        engineId: engine.id,
        engineVersion: engine.version,
      }),
      engine.deriveMetrics(state),
    );
  });
});

Deno.test("historical observations match source discovery and delivery deltas", () => {
  HISTORICAL_ENGINES.forEach((engine) => {
    let state = engine.createSimulation({
      graph: commonGraph(),
      graphSeed: 7,
      runSeed: 1,
      resources: { antCount: 8, speed: 0.65 },
    });
    let observedDiscoveries = 0;
    let observedDeliveries = 0;

    Array.from({ length: 80 }).forEach(() => {
      const before = state;
      state = engine.stepSimulation(state, 0.05);
      const discoveries = state.lastEvents.filter(({ type }) =>
        type === "discovery"
      ).length;
      const deliveries = state.lastEvents.filter(({ type }) =>
        type === "delivery"
      ).length;
      assertEquals(
        discoveries,
        state.stats.discoveries - before.stats.discoveries,
      );
      assertEquals(
        deliveries,
        state.stats.deliveries - before.stats.deliveries,
      );
      assertEquals(state.observations, { discoveries, deliveries });
      observedDiscoveries += discoveries;
      observedDeliveries += deliveries;
    });

    assert(observedDiscoveries > 0, `${engine.id} did not discover food`);
    assert(observedDeliveries > 0, `${engine.id} did not deliver food`);
    assertEquals(observedDiscoveries, state.stats.discoveries);
    assertEquals(observedDeliveries, state.stats.deliveries);
  });
});

Deno.test("historical facade operations retain identity and live-edit semantics", () => {
  HISTORICAL_ENGINES.forEach((engine) => {
    let state = createSimulation({
      engineId: engine.id,
      graph: commonGraph(),
      graphSeed: 41,
      runSeed: 43,
      resources: { antCount: 8, speed: 0.4 },
    });
    state = stepSimulation(state, 0.25);
    state = updateParams(state, { speed: 0.35 });
    state = clearPheromones(state);
    state = resetRun(state);

    assertEquals(state.engineId, engine.id);
    assertEquals(state.engineVersion, engine.version);
    assertEquals(state.params.speed, 0.35);
    assertEquals(state.stats.deliveries, 0);
    assertEquals(state.stats.discoveries, 0);
    assertEquals(
      foodProbabilitiesForNode(state, state.graph.hill),
      engine.foodProbabilitiesForNode(state, state.graph.hill),
    );

    if (engine.id === "A0") {
      assert(addFood(state, state.graph.hill) === state);
      assert(removeFood(state, state.graph.food) === state);
      const moved = moveFood(state, state.graph.food, state.graph.hill);
      assert(moved === state);
    } else {
      const unchanged = moveFood(
        state,
        state.graph.foods[0],
        state.graph.hill,
      );
      assert(unchanged === state);
      assert(removeFood(state, state.graph.foods[0]) === state);
    }

    assert(setEndpoint(state, "food", state.graph.hill) === state);
  });
});

Deno.test("historical food edits retain each source family's reset semantics", () => {
  const graph = largerCommonGraph();
  HISTORICAL_ENGINES.forEach((engine) => {
    let state = engine.createSimulation({
      graph,
      graphSeed: 71,
      runSeed: 503,
      resources: { antCount: 8, speed: 0.31 },
    });
    state = engine.stepSimulation(state, 0.25);
    const sourceFood = state.graph.foods[0];
    const destination = state.graph.nodes.find(({ id }) =>
      id !== state.graph.hill && !state.graph.foods.includes(id)
    ).id;
    const ants = state.ants;
    const pheromones = state.pheromones;
    const elapsed = state.elapsed;
    const moved = engine.moveFood(state, sourceFood, destination);

    assertEquals(moved.graph.foods, [destination]);
    if (engine.id === "A0") {
      assertEquals(moved.graph.food, destination);
      assertEquals(moved.elapsed, 0);
      assert(moved.ants !== ants);
      assert(moved.pheromones !== pheromones);
      assertEquals(moved.stats.discoveries, 0);
      assertEquals(moved.stats.deliveries, 0);
    } else {
      assertEquals(moved.elapsed, elapsed);
      assert(moved.ants === ants);
      assert(moved.pheromones === pheromones);
      assertEquals(moved.stats.foodChanges, state.stats.foodChanges + 1);
      const added = engine.addFood(moved, sourceFood);
      assertEquals(added.graph.foods, [destination, sourceFood]);
      assertEquals(engine.removeFood(added, sourceFood).graph.foods, [
        destination,
      ]);
    }
  });
});
