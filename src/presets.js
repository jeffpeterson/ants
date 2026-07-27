import { CURRENT_ENGINE_ID, DEFAULTS, getEngine } from "./colony.js";
import { ALGORITHM_KEYS, migrateAlgorithmPreset, selectParameters } from "./config.js";

const completeAlgorithm = (overrides = {}) =>
  Object.freeze(
    selectParameters({ ...DEFAULTS, ...overrides }, ALGORITHM_KEYS),
  );

const resolveParameters = (algorithm) =>
  algorithm.engineId === CURRENT_ENGINE_ID
    ? Object.freeze(
      Object.fromEntries(
        Object.entries({ ...DEFAULTS, ...algorithm.params }).filter(([key]) =>
          !getEngine(CURRENT_ENGINE_ID).graphParameterKeys.includes(key)
        ),
      ),
    )
    : Object.freeze({ ...algorithm.params });

const builtIn = (id, name, description, overrides = {}) =>
  Object.freeze({
    id,
    name,
    description,
    engineId: CURRENT_ENGINE_ID,
    params: completeAlgorithm(overrides),
  });

export const BUILT_IN_ALGORITHM_PRESETS = Object.freeze([
  builtIn(
    "balanced-node",
    "Balanced node trails",
    "Working scalar-trail default with uncharted-biased scouting and hill-only homing.",
  ),
  builtIn(
    "adaptive-edge",
    "Adaptive edge trails",
    "More efficient and adaptive on many dense maps, but less reliable on sparse maps.",
    {
      exploreRate: 0.018,
      stopExploreChance: 0.107,
      exploreSignalBias: -0.53,
      choiceFloor: 0,
      reversePenalty: 0.064,
      headingInfluence: 1.32,
      distanceInfluence: 0.31,
      fastInfluence: 2.2,
      outboundPolarity: 0,
      returnFastInfluence: 1.11,
      returnSlowInfluence: 9.48,
      returnFastPolarity: 0,
      returnSlowPolarity: 4,
      slowHalfLife: 28.3,
      fastHalfLife: 12.6,
      foodTrailModel: "edge",
    },
  ),
  builtIn(
    "legacy",
    "Legacy baseline",
    "The pre-optimization defaults, retained for direct comparison.",
    {
      exploreRate: 0.02,
      stopExploreChance: 0.12,
      exploreSignalBias: 0,
      unchartedPreference: 0,
      choiceFloor: 0,
      reversePenalty: 0.18,
      headingInfluence: 1.6,
      distanceInfluence: 1,
      fastInfluence: 3.2,
      outboundPolarity: 0,
      returnFastInfluence: 1,
      returnSlowInfluence: 8,
      returnFastPolarity: 0,
      returnSlowPolarity: 4,
      slowHalfLife: 42,
      fastHalfLife: 9,
      foodTrailModel: "node",
    },
  ),
]);

const builtInsById = Object.freeze(
  Object.fromEntries(
    BUILT_IN_ALGORITHM_PRESETS.map((preset) => [preset.id, preset]),
  ),
);

export const presetRef = (source, key) => `${source}:${key}`;

export const parsePresetRef = (value) => {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) return null;
  const source = value.slice(0, separator);
  const key = value.slice(separator + 1);
  return source === "builtin" || source === "user" ? { source, key } : null;
};

export const resolveAlgorithmPreset = (value, userLibrary = {}) => {
  const reference = parsePresetRef(value);
  if (reference?.source === "builtin") {
    return builtInsById[reference.key] ?? null;
  }
  if (
    reference?.source !== "user" ||
    !Object.hasOwn(userLibrary, reference.key)
  ) {
    return null;
  }
  const algorithm = migrateAlgorithmPreset(userLibrary[reference.key]);
  if (algorithm === null) return null;
  return {
    id: reference.key,
    name: reference.key,
    description: "Saved in this browser.",
    engineId: algorithm.engineId,
    params: resolveParameters(algorithm),
  };
};
