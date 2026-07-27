import { CURRENT_BENCHMARK_ENGINE } from "./current.js";
import { HISTORICAL_BENCHMARK_ENGINES } from "./historical.js";

export const BENCHMARK_ENGINES = Object.freeze([
  CURRENT_BENCHMARK_ENGINE,
  ...HISTORICAL_BENCHMARK_ENGINES,
]);

const enginesById = Object.freeze(
  Object.fromEntries(BENCHMARK_ENGINES.map((engine) => [engine.id, engine])),
);

export const getBenchmarkEngine = (id) => {
  const engine = enginesById[id];
  if (engine === undefined) throw new Error(`Unknown benchmark engine: ${id}`);
  return engine;
};
