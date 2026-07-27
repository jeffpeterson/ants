import { CURRENT_ENGINE_ID, getEngine } from "./colony.js";

export const ALGORITHM_KEYS = Object.freeze([
  "antCount",
  "exploreRate",
  "stopExploreChance",
  "exploreSignalBias",
  "unchartedPreference",
  "trailJoinChance",
  "choiceFloor",
  "foodTrailModel",
  "newTrailSignalShare",
  "reversePenalty",
  "speed",
  "headingInfluence",
  "distanceInfluence",
  "fastInfluence",
  "outboundPolarity",
  "returnFastInfluence",
  "returnSlowInfluence",
  "returnFastPolarity",
  "returnSlowPolarity",
  "homewardPreference",
  "slowHalfLife",
  "fastHalfLife",
]);

export const GRAPH_KEYS = Object.freeze([
  "nodeCount",
  "density",
  "mapVariation",
]);

export const selectParameters = (params, keys) =>
  Object.fromEntries(keys.map((key) => [key, params[key]]));

const omitParameters = (params, keys) => {
  const omitted = new Set(keys);
  return Object.fromEntries(
    Object.entries(params).filter(([key]) => !omitted.has(key)),
  );
};

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isEngineAlgorithm = (value) =>
  isRecord(value) &&
  typeof value.engineId === "string" &&
  value.engineId !== "" &&
  isRecord(value.params);

const migrateParams = (engineId, params) =>
  engineId === CURRENT_ENGINE_ID
    ? {
      ...params,
      ...(!Object.hasOwn(params, "trailJoinChance") ? { trailJoinChance: 0 } : {}),
      ...(!Object.hasOwn(params, "newTrailSignalShare")
        ? { newTrailSignalShare: 0 }
        : {}),
    }
    : params;

export const migrateAlgorithmPreset = (value) => {
  if (!isRecord(value)) return null;
  const tagged = Object.hasOwn(value, "engineId") ||
    Object.hasOwn(value, "params");
  if (tagged) {
    return isEngineAlgorithm(value)
      ? {
        engineId: value.engineId,
        params: migrateParams(value.engineId, value.params),
      }
      : null;
  }
  return {
    engineId: CURRENT_ENGINE_ID,
    params: migrateParams(CURRENT_ENGINE_ID, value),
  };
};

export const migrateAlgorithmPresetLibrary = (value) =>
  isRecord(value)
    ? Object.fromEntries(
      Object.entries(value).flatMap(([name, preset]) => {
        const migrated = migrateAlgorithmPreset(preset);
        return migrated === null ? [] : [[name, migrated]];
      }),
    )
    : {};

export const algorithmPreset = (simulation) => ({
  engineId: simulation.engineId,
  params: omitParameters(
    simulation.params,
    getEngine(simulation.engineId).graphParameterKeys,
  ),
});

export const mapPreset = (simulation) => ({
  seed: simulation.graphSeed,
  params: selectParameters(simulation.graphParams, GRAPH_KEYS),
  hill: simulation.graph.hill,
  foods: simulation.graph.foods,
});

export const sharedConfiguration = (simulation) => ({
  version: 2,
  algorithm: algorithmPreset(simulation),
  map: mapPreset(simulation),
});

const base64Url = (value) =>
  btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");

const fromBase64Url = (value) => {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  return atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
};

export const encodeConfiguration = (configuration) =>
  base64Url(JSON.stringify(configuration));

const validMap = (map) =>
  Number.isFinite(map?.seed) &&
  isRecord(map.params);

export const migrateConfiguration = (configuration) => {
  if (!isRecord(configuration) || !validMap(configuration.map)) return null;
  if (configuration.version === 1) {
    const algorithm = migrateAlgorithmPreset(configuration.algorithm);
    return algorithm === null ? null : { ...configuration, version: 2, algorithm };
  }
  if (configuration.version !== 2 || !isEngineAlgorithm(configuration.algorithm)) {
    return null;
  }
  const algorithm = migrateAlgorithmPreset(configuration.algorithm);
  return {
    ...configuration,
    algorithm,
  };
};

export const decodeConfiguration = (value) => {
  try {
    return migrateConfiguration(JSON.parse(fromBase64Url(value)));
  } catch {
    return null;
  }
};
