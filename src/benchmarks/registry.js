import { CURRENT_BENCHMARK_ENGINE } from "./current.js";

export const BENCHMARK_ENGINES = Object.freeze([CURRENT_BENCHMARK_ENGINE]);

const enginesById = Object.freeze(
  Object.fromEntries(BENCHMARK_ENGINES.map((engine) => [engine.id, engine])),
);

export const getBenchmarkEngine = (id) => {
  const engine = enginesById[id];
  if (engine === undefined) throw new Error(`Unknown benchmark engine: ${id}`);
  return engine;
};
