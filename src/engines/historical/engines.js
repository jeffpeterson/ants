import { HISTORICAL_ENGINE_MANIFEST } from "./manifest.js";
import * as SOURCE from "./source/index.js";
import { historicalEngine } from "./adapter.js";

const SCHEMAS = Object.freeze({
  A0: Object.freeze({
    singleFood: true,
    liveFood: false,
    hasBestRoute: true,
    antSchema: "permanent-role",
    pheromoneSchema: "edge-arc",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "ant",
  }),
  A1: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: true,
    antSchema: "permanent-role",
    pheromoneSchema: "edge-arc",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "ant",
  }),
  A2: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: true,
    antSchema: "permanent-role",
    pheromoneSchema: "arc-arc",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "ant",
  }),
  A3: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: true,
    antSchema: "temporary-route",
    pheromoneSchema: "arc-arc",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "food",
  }),
  A4: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: true,
    antSchema: "temporary-route",
    pheromoneSchema: "arc-arc",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "food",
  }),
  B0: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: false,
    antSchema: "scalar-gradient",
    pheromoneSchema: "nested-scalar",
    graphParams: Object.freeze(["nodeCount", "density"]),
    probabilities: "food",
  }),
  B1: Object.freeze({
    singleFood: false,
    liveFood: true,
    hasBestRoute: false,
    antSchema: "node-scalar",
    pheromoneSchema: "node-scalar",
    graphParams: Object.freeze([
      "nodeCount",
      "density",
      "islandCount",
      "islandSeparation",
      "islandLinks",
    ]),
    probabilities: "food",
  }),
});

export const HISTORICAL_ENGINES = Object.freeze(
  HISTORICAL_ENGINE_MANIFEST.map((metadata) =>
    historicalEngine(metadata, SOURCE[metadata.id], SCHEMAS[metadata.id])
  ),
);
