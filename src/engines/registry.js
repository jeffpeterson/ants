import * as current from "./current.js";
import { HISTORICAL_ENGINES } from "./historical/engines.js";

export const CURRENT_ENGINE_ID = "scalar-field";
export const CURRENT_ENGINE_VERSION = 1;
export const CURRENT_ENGINE_REVISION = "bce2a56529cfa6f3778dd21f7007de9b9a497330";

const currentEngine = Object.freeze({
  id: CURRENT_ENGINE_ID,
  version: CURRENT_ENGINE_VERSION,
  name: "Local scalar fields",
  revision: CURRENT_ENGINE_REVISION,
  family: "local-scalar",
  traits: Object.freeze([
    "local-memory",
    "node-and-edge-fields",
    "temporary-exploration",
    "selectable-home-field",
    "finite-escape",
    "live-food",
  ]),
  defaults: current.DEFAULTS,
  graphParameterKeys: Object.freeze([
    "nodeCount",
    "density",
    "mapVariation",
  ]),
  capabilities: Object.freeze({
    commonGraph: true,
    nativeGraph: true,
    multipleFoods: true,
    liveFood: "preserve",
    exactCycleDistance: true,
  }),
  createSimulation: current.createSimulation,
  stepSimulation: current.stepSimulation,
  updateParams: current.updateParams,
  resetRun: current.resetRun,
  clearPheromones: current.clearPheromones,
  moveFood: current.moveFood,
  addFood: current.addFood,
  removeFood: current.removeFood,
  setEndpoint: current.setEndpoint,
  deriveMetrics: current.deriveMetrics,
  dominantFoodRoute: current.dominantFoodRoute,
  foodProbabilitiesForNode: current.foodProbabilitiesForNode,
});

export { HISTORICAL_ENGINES };

export const ENGINES = Object.freeze([
  currentEngine,
  ...HISTORICAL_ENGINES,
]);

const enginesById = Object.freeze(
  Object.fromEntries(ENGINES.map((engine) => [engine.id, engine])),
);

export const getEngine = (id) => {
  const engine = enginesById[id];
  if (engine === undefined) {
    throw new Error(`Unknown colony engine: ${id}`);
  }
  return engine;
};

export const getStateEngine = (state) => {
  const engine = getEngine(state.engineId);
  if (state.engineVersion !== engine.version) {
    throw new Error(
      `Unsupported ${engine.id} state version: ${state.engineVersion}`,
    );
  }
  return engine;
};

export const supportsEngineParameter = (engine, key) =>
  Object.hasOwn(engine.defaults, key);

export const selectEngineParameters = (engine, values = {}) =>
  Object.fromEntries(
    Object.entries(values).filter(([key]) => supportsEngineParameter(engine, key)),
  );
