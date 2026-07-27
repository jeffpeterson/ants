import { CURRENT_ENGINE_ID, getEngine, getStateEngine } from "./engines/registry.js";

export {
  choiceProbabilities,
  clamp,
  decayPheromones,
  DEFAULTS,
  edgeKey,
  explorationStopProbability,
  generateGraph,
  homewardProbabilities,
  isConnected,
  nextRandom,
  sanitizeParams,
  shortestRoute,
  shortestRouteToFood,
  trailGradient,
} from "./engines/current.js";
export {
  CURRENT_ENGINE_ID,
  CURRENT_ENGINE_VERSION,
  ENGINES,
  getEngine,
  getStateEngine,
} from "./engines/registry.js";

const tagState = (state, engine) => ({
  ...state,
  engineId: engine.id,
  engineVersion: engine.version,
});

const invoke = (state, method, ...args) => {
  const engine = getStateEngine(state);
  return engine[method](state, ...args);
};

export const createSimulation = (options = {}) => {
  const engine = getEngine(options.engineId ?? CURRENT_ENGINE_ID);
  return tagState(engine.createSimulation(options), engine);
};

export const stepSimulation = (state, seconds) =>
  invoke(state, "stepSimulation", seconds);

export const updateParams = (state, patch) => invoke(state, "updateParams", patch);

export const resetRun = (state) => invoke(state, "resetRun");

export const clearPheromones = (state) => invoke(state, "clearPheromones");

export const moveFood = (state, sourceId, destinationId) =>
  invoke(state, "moveFood", sourceId, destinationId);

export const addFood = (state, nodeId) => invoke(state, "addFood", nodeId);

export const removeFood = (state, nodeId) => invoke(state, "removeFood", nodeId);

export const setEndpoint = (state, kind, nodeId) =>
  invoke(state, "setEndpoint", kind, nodeId);

export const deriveMetrics = (state) => invoke(state, "deriveMetrics");

export const dominantFoodRoute = (state) => invoke(state, "dominantFoodRoute");

export const foodProbabilitiesForNode = (state, nodeId) =>
  invoke(state, "foodProbabilitiesForNode", nodeId);
