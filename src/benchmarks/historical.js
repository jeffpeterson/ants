import { HISTORICAL_ENGINES } from "../engines/historical/engines.js";

const benchmarkEngine = (engine) =>
  Object.freeze({
    id: engine.id,
    version: engine.version,
    name: engine.name,
    revision: engine.revision,
    family: engine.family,
    defaults: engine.defaults,
    capabilities: engine.capabilities,
    initialize: ({
      lane,
      graphSnapshot,
      graphSeed,
      graphParams,
      runSeed,
      resources,
    }) =>
      engine.createSimulation({
        ...(lane === "common" ? { graph: graphSnapshot } : {}),
        graphSeed,
        graphParams,
        params: graphParams,
        runSeed,
        resources,
      }),
    step: engine.stepSimulation,
    inspect: (state) => ({
      elapsed: state.elapsed,
      deliveries: state.stats.deliveries,
      shortestDistance: state.stats.shortestDistance,
      graph: state.graph,
    }),
  });

export const HISTORICAL_BENCHMARK_ENGINES = Object.freeze(
  HISTORICAL_ENGINES.map(benchmarkEngine),
);
