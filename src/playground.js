import {
  createSimulation,
  CURRENT_ENGINE_ID,
  getEngine,
  selectEngineParameters,
} from "./colony.js";

const DEFAULT_GRAPH_SEED = 1837;
const RUN_SEED_SALT = 0x9e3779b9;

const freezeGraph = (graph) => {
  graph.nodes.forEach(Object.freeze);
  graph.edges.forEach(Object.freeze);
  Object.values(graph.adjacency).forEach(Object.freeze);
  Object.freeze(graph.nodes);
  Object.freeze(graph.edges);
  Object.freeze(graph.adjacency);
  Object.freeze(graph.edgeById);
  Object.freeze(graph.foods);
  return Object.freeze(graph);
};

export const shortRevision = (engine) => engine.revision.slice(0, 7);

export const engineLabel = (engine) =>
  `${engine.id} — ${engine.name} · ${shortRevision(engine)}`;

export const engineTooltip = (engine) => {
  const behavior = engine.id === "A0"
    ? " Uses one active food source; moving it resets ants and trails."
    : "";
  return `${engine.id} — ${engine.name}. Source commit ${engine.revision}. ${
    engine.traits.join(", ")
  }.${behavior}`;
};

export const engineNote = (engine) =>
  engine.id === "A0"
    ? `Commit ${
      shortRevision(engine)
    } · one active food; moving it resets the run. Other placed foods remain parked.`
    : `Commit ${shortRevision(engine)} · ${engine.traits.join(" · ")}`;

export const activeFoodsFor = (simulation) => {
  const engine = getEngine(simulation.engineId);
  return engine.capabilities.multipleFoods
    ? simulation.graph.foods
    : [simulation.graph.food ?? simulation.graph.foods[0]];
};

const runSeedFor = (simulation) =>
  simulation.runSeed ??
    ((simulation.graphSeed ^ RUN_SEED_SALT) >>> 0);

export const switchSimulationEngine = (
  simulation,
  engineId,
  overrides = {},
) => {
  if (simulation.engineId === engineId) return simulation;
  const engine = getEngine(engineId);
  const resources = {
    antCount: simulation.params.antCount,
    speed: simulation.params.speed,
  };
  const params = selectEngineParameters(engine, {
    ...engine.defaults,
    ...resources,
    ...overrides,
    ...simulation.graphParams,
  });
  return createSimulation({
    engineId,
    graph: simulation.graph,
    graphSeed: simulation.graphSeed,
    graphParams: simulation.graphParams,
    runSeed: runSeedFor(simulation),
    params,
    hill: simulation.graph.hill,
    foods: simulation.graph.foods,
  });
};

export const createPlaygroundSimulation = ({
  engineId = CURRENT_ENGINE_ID,
  params = {},
  map = {},
} = {}) => {
  const base = createSimulation({
    engineId: CURRENT_ENGINE_ID,
    seed: map.seed ?? DEFAULT_GRAPH_SEED,
    params: map.params,
    hill: map.hill,
    foods: map.foods,
  });
  const graph = freezeGraph(base.graph);
  return createSimulation({
    engineId,
    graph,
    graphSeed: base.graphSeed,
    graphParams: Object.freeze({ ...base.graphParams }),
    runSeed: base.rngSeed,
    params: {
      ...params,
      ...base.graphParams,
    },
    hill: graph.hill,
    foods: graph.foods,
  });
};

export const engineSwitchNotice = (engine) => {
  const reset =
    "The graph, home, and placed food were preserved; ants and trails reset.";
  const singleFood = engine.id === "A0"
    ? " A0 follows the first food only, parks the others, and resets again when that food moves."
    : "";
  return `Switched to ${engine.id} — ${engine.name}. ${reset}${singleFood}`;
};
