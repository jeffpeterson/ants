import {
  addFood,
  createSimulation,
  CURRENT_ENGINE_ID,
  ENGINES,
  getEngine,
  moveFood,
  stepSimulation,
  updateParams,
} from "../src/colony.js";
import {
  activeFoodsFor,
  createPlaygroundSimulation,
  engineLabel,
  engineNote,
  engineSwitchNotice,
  engineTooltip,
  shortRevision,
  switchSimulationEngine,
} from "../src/playground.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const map = {
  seed: 71,
  params: {
    nodeCount: 16,
    density: 0.4,
    mapVariation: 0.83,
  },
};

const graphContract = ({ nodes, edges, adjacency, edgeById, hill, foods }) => ({
  nodes,
  edges,
  adjacency,
  edgeById,
  hill,
  foods,
});

const populatedSimulation = () => {
  let simulation = createPlaygroundSimulation({
    params: { antCount: 8, speed: 0.3 },
    map,
  });
  const secondFood =
    simulation.graph.nodes.find(({ id }) =>
      id !== simulation.graph.hill &&
      !simulation.graph.foods.includes(id)
    ).id;
  simulation = addFood(simulation, secondFood);
  return Array.from({ length: 8 }).reduce(
    (state) => stepSimulation(state, 0.25),
    simulation,
  );
};

Deno.test("engine selector copy carries labels, commits, and A0 constraints", async () => {
  ENGINES.forEach((engine) => {
    assert(engineLabel(engine).includes(engine.id));
    assert(engineLabel(engine).includes(engine.name));
    assert(engineLabel(engine).includes(shortRevision(engine)));
    assert(engineTooltip(engine).includes(engine.revision));
    assert(engineNote(engine).includes(shortRevision(engine)));
    assert(!/recommended/iu.test(engineLabel(engine)));
  });
  assert(/one active food/iu.test(engineTooltip(getEngine("A0"))));
  assert(/resets/iu.test(engineNote(getEngine("A0"))));
  assert(/preserved/iu.test(engineSwitchNotice(getEngine("A0"))));

  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const app = await Deno.readTextFile(new URL("../src/app.js", import.meta.url));
  const css = await Deno.readTextFile(new URL("../styles.css", import.meta.url));
  assert(html.includes('id="engineId"'));
  assert(html.includes('id="engine-note"'));
  assert(app.includes("input.disabled = !supported"));
  assert(css.includes('.slider-row[data-supported="false"]'));
});

Deno.test("every historical URL path uses the latest common graph recipe", () => {
  const current = createPlaygroundSimulation({
    engineId: CURRENT_ENGINE_ID,
    map,
  });

  ENGINES.filter(({ id }) => id !== CURRENT_ENGINE_ID).forEach((engine) => {
    const historical = createPlaygroundSimulation({
      engineId: engine.id,
      map,
    });
    assertEquals(
      graphContract(historical.graph),
      graphContract(current.graph),
      `${engine.id} did not receive the current graph`,
    );
    assertEquals(historical.adapter.lane, "common");
    assert(Object.isFrozen(historical.graph));
    assert(Object.isFrozen(historical.graph.nodes));
    assertEquals(historical.graphParams, current.graphParams);
    ["nodeCount", "density"].forEach((key) =>
      assertEquals(historical.params[key], current.graphParams[key])
    );
  });
});

Deno.test("engine switching preserves the environment and resets the colony", () => {
  const source = populatedSimulation();
  const graph = graphContract(source.graph);

  ENGINES.filter(({ id }) => id !== CURRENT_ENGINE_ID).forEach((engine) => {
    const switched = switchSimulationEngine(source, engine.id);
    assertEquals(graphContract(switched.graph), graph, engine.id);
    assert(switched.graph.nodes === source.graph.nodes);
    assert(switched.graph.edges === source.graph.edges);
    assert(switched.graph.adjacency === source.graph.adjacency);
    assert(switched.graph.edgeById === source.graph.edgeById);
    assert(switched.graph.foods === source.graph.foods);
    assertEquals(switched.engineId, engine.id);
    assertEquals(switched.elapsed, 0);
    assertEquals(switched.stats.discoveries, 0);
    assertEquals(switched.stats.deliveries, 0);
    assert(switched.ants !== source.ants);
    assert(switched.pheromones !== source.pheromones);

    const restored = switchSimulationEngine(switched, CURRENT_ENGINE_ID);
    assertEquals(graphContract(restored.graph), graph);
    assert(restored.graph.nodes === source.graph.nodes);
    assert(restored.graph.foods === source.graph.foods);
    assertEquals(restored.params.mapVariation, source.graphParams.mapVariation);
  });
});

Deno.test("historical switches start from archived policy defaults", () => {
  const current = createPlaygroundSimulation({
    params: {
      antCount: 12,
      speed: 0.29,
      exploreRate: 0.27,
      fastInfluence: 9,
      distanceInfluence: 1.8,
      reversePenalty: 0.02,
    },
    map,
  });

  ["A4", "B0"].forEach((engineId) => {
    const engine = getEngine(engineId);
    const switched = switchSimulationEngine(current, engineId);
    Object.entries(engine.defaults).forEach(([key, value]) => {
      if (
        ["antCount", "speed"].includes(key) ||
        engine.graphParameterKeys.includes(key)
      ) {
        return;
      }
      assertEquals(switched.params[key], value, `${engineId}.${key}`);
    });
    assertEquals(switched.params.antCount, 12);
    assertEquals(switched.params.speed, 0.29);

    const overridden = switchSimulationEngine(current, engineId, {
      fastInfluence: 1.23,
    });
    assertEquals(overridden.params.fastInfluence, 1.23);
  });
});

Deno.test("unsupported historical levers are rejected at the facade", () => {
  const state = createSimulation({
    engineId: "A0",
    seed: 7,
    params: {
      speed: 0.2,
      outboundPolarity: 4,
    },
  });

  assertEquals(state.params.speed, 0.2);
  assert(!Object.hasOwn(state.params, "outboundPolarity"));
  assert(updateParams(state, { outboundPolarity: -3 }) === state);
  assertEquals(updateParams(state, { speed: 0.3 }).params.speed, 0.3);
});

Deno.test("A0 keeps parked food but resets when its active food moves", () => {
  let state = switchSimulationEngine(populatedSimulation(), "A0");
  assertEquals(state.graph.foods.length, 2);
  assertEquals(activeFoodsFor(state), [state.graph.foods[0]]);
  state = Array.from({ length: 4 }).reduce(
    (simulation) => stepSimulation(simulation, 0.25),
    state,
  );
  const oldAnts = state.ants;
  const oldPheromones = state.pheromones;
  const parked = state.graph.foods[1];
  const destination =
    state.graph.nodes.find(({ id }) =>
      id !== state.graph.hill && !state.graph.foods.includes(id)
    ).id;

  assert(moveFood(state, state.graph.food, parked) === state);
  const moved = moveFood(state, state.graph.food, destination);
  assertEquals(moved.graph.foods, [destination, parked]);
  assertEquals(moved.graph.food, destination);
  assertEquals(moved.elapsed, 0);
  assert(moved.ants !== oldAnts);
  assert(moved.pheromones !== oldPheromones);
  assertEquals(moved.stats.discoveries, 0);
  assertEquals(moved.stats.deliveries, 0);
});
