import * as current from "../engines/current.js";
import { CURRENT_ENGINE_ID, getEngine } from "../engines/registry.js";

const runtime = getEngine(CURRENT_ENGINE_ID);

const comparableGraph = (graph) => ({
  nodes: graph.nodes,
  edges: graph.edges,
  adjacency: graph.adjacency,
  edgeById: graph.edgeById,
  hill: graph.hill,
  foods: graph.foods,
});

const sameGraph = (first, second) =>
  JSON.stringify(comparableGraph(first)) === JSON.stringify(comparableGraph(second));

const initialize = ({
  lane,
  graphSnapshot,
  graphSeed,
  graphParams,
  runSeed,
  resources,
}) => {
  const simulation = runtime.createSimulation({
    seed: graphSeed,
    runSeed,
    params: {
      ...runtime.defaults,
      ...graphParams,
      ...resources,
    },
  });
  if (lane === "native") return simulation;
  if (!sameGraph(simulation.graph, graphSnapshot)) {
    throw new Error("Current engine cannot initialize the supplied common graph");
  }
  return { ...simulation, graph: graphSnapshot };
};

export const CURRENT_BENCHMARK_ENGINE = Object.freeze({
  id: runtime.id,
  version: runtime.version,
  name: runtime.name,
  revision: "bce2a56529cfa6f3778dd21f7007de9b9a497330",
  family: "local-scalar",
  defaults: runtime.defaults,
  initialize,
  step: runtime.stepSimulation,
  inspect: (state) => ({
    elapsed: state.elapsed,
    deliveries: state.stats.deliveries,
    shortestDistance: state.stats.shortestDistance,
    graph: state.graph,
  }),
});

export const currentGraphScenario = (scenario) => {
  const [graph] = current.generateGraph(scenario.seed, scenario.graph);
  return Object.freeze({
    id: scenario.id,
    graphSeed: scenario.seed,
    runSeed: scenario.runSeed,
    graphParams: scenario.graph,
    graphSnapshot: graph,
    shortestDistance: current.shortestRouteToFood(graph).distance,
  });
};
