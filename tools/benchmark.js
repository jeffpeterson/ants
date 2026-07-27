import { runHistoricalBenchmark } from "../src/benchmark.js";
import {
  CURRENT_BENCHMARK_ENGINE,
  currentGraphScenario,
} from "../src/benchmarks/current.js";
import { BENCHMARK_ENGINES, getBenchmarkEngine } from "../src/benchmarks/registry.js";
import { EVALUATION_RESOURCES, SCREENING_SCENARIOS } from "../src/optimization.js";
import { parseArgs } from "./args.js";

const options = parseArgs(Deno.args);

const commaValues = (value) =>
  typeof value === "string" && value !== "true" ? value.split(",").filter(Boolean) : [];

const selectedEngines = commaValues(options.engines);
const engines = selectedEngines.length === 0
  ? BENCHMARK_ENGINES
  : selectedEngines.map(getBenchmarkEngine);

const selectedLanes = options.lane === undefined
  ? ["common", "native"]
  : commaValues(options.lane);

const requestedLimit = Number(options.limit ?? SCREENING_SCENARIOS.length);
const limit = Math.max(
  1,
  Math.min(
    SCREENING_SCENARIOS.length,
    Number.isFinite(requestedLimit) ? Math.round(requestedLimit) : 1,
  ),
);
const scenarios = SCREENING_SCENARIOS.slice(0, limit).map(currentGraphScenario);
const runSeeds = commaValues(options["run-seeds"]).map((value) => {
  const seed = Number(value);
  if (!Number.isFinite(seed)) throw new Error(`Invalid run seed: ${value}`);
  return seed;
});
const dt = Number(options.dt ?? 0.25);

const report = runHistoricalBenchmark({
  engines,
  scenarios,
  lanes: selectedLanes,
  runSeeds: runSeeds.length === 0 ? undefined : runSeeds,
  resources: EVALUATION_RESOURCES,
  dt,
  provenance: {
    suite: "screening",
    graphSource: {
      id: "current-varied-connected",
      engineId: CURRENT_BENCHMARK_ENGINE.id,
      engineVersion: CURRENT_BENCHMARK_ENGINE.version,
    },
  },
});
const output = `${JSON.stringify(report, null, 2)}\n`;

if (typeof options.out === "string" && options.out !== "true") {
  const slash = options.out.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(options.out.slice(0, slash), { recursive: true });
  await Deno.writeTextFile(options.out, output);
  console.error(`wrote ${options.out}`);
}

console.log(output.trimEnd());
