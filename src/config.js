export const ALGORITHM_KEYS = Object.freeze([
  "antCount",
  "exploreRate",
  "stopExploreChance",
  "exploreSignalBias",
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

export const algorithmPreset = (simulation) =>
  selectParameters(simulation.params, ALGORITHM_KEYS);

export const mapPreset = (simulation) => ({
  seed: simulation.graphSeed,
  params: selectParameters(simulation.graphParams, GRAPH_KEYS),
  hill: simulation.graph.hill,
  foods: simulation.graph.foods,
});

export const sharedConfiguration = (simulation) => ({
  version: 1,
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

export const decodeConfiguration = (value) => {
  try {
    const configuration = JSON.parse(fromBase64Url(value));
    const valid = configuration?.version === 1 &&
      configuration.algorithm !== null &&
      typeof configuration.algorithm === "object" &&
      Number.isFinite(configuration.map?.seed) &&
      configuration.map.params !== null &&
      typeof configuration.map.params === "object";
    return valid ? configuration : null;
  } catch {
    return null;
  }
};
