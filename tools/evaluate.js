import { DEFAULTS } from "../src/colony.js";
import {
  CONFIRMATION_SCENARIOS,
  evaluateCandidate,
  EVALUATION_VERSION,
  HYPOTHESIS_PARAMS,
  SCREENING_SCENARIOS,
  STRESS_SCENARIOS,
  TRAINING_SCENARIOS,
  VALIDATION_SCENARIOS,
} from "../src/optimization.js";
import { presetRef, resolveAlgorithmPreset } from "../src/presets.js";
import { parseArgs, parseAssignments } from "./args.js";

const options = parseArgs(Deno.args);
const overrides = parseAssignments(options.set);
const suites = {
  confirmation: CONFIRMATION_SCENARIOS,
  screening: SCREENING_SCENARIOS,
  training: TRAINING_SCENARIOS,
  validation: VALIDATION_SCENARIOS,
  stress: STRESS_SCENARIOS,
};
const suiteName = options.suite ?? "screening";
const suite = suites[suiteName];

if (suite === undefined) {
  throw new Error(`Unknown suite "${suiteName}"`);
}

const limit = Math.max(
  1,
  Math.min(suite.length, Number(options.limit ?? suite.length)),
);
const scenarios = suite.slice(0, limit);
const imported = typeof options.input === "string" && options.input !== "true"
  ? JSON.parse(await Deno.readTextFile(options.input))
  : null;
const preset = typeof options.preset === "string" && options.preset !== "true"
  ? resolveAlgorithmPreset(presetRef("builtin", options.preset))
  : null;
if (options.preset !== undefined && preset === null) {
  throw new Error(`Unknown built-in preset "${options.preset}"`);
}
const candidates = imported !== null
  ? [{
    id: options.name ?? "imported",
    params: imported.winner ?? imported.params ?? imported,
  }]
  : preset !== null
  ? [{ id: preset.id, params: preset.params }]
  : options.candidate === "defaults"
  ? [{ id: "defaults", params: DEFAULTS }]
  : options.candidate === "hypothesis"
  ? [{ id: "hypothesis", params: HYPOTHESIS_PARAMS }]
  : [
    { id: "defaults", params: DEFAULTS },
    { id: "hypothesis", params: HYPOTHESIS_PARAMS },
  ];
const dt = Number(options.dt ?? 0.25);
const results = candidates.map(({ id, params }) => {
  const evaluation = evaluateCandidate({ ...params, ...overrides }, scenarios, { dt });
  return {
    id,
    params: evaluation.params,
    aggregate: evaluation.aggregate,
    scenarios: options.full === "true" ? evaluation.scenarios : undefined,
  };
});
const report = {
  version: EVALUATION_VERSION,
  suite: suiteName,
  scenarioCount: scenarios.length,
  dt,
  results,
};
const output = `${JSON.stringify(report, null, 2)}\n`;

if (typeof options.out === "string" && options.out !== "true") {
  const slash = options.out.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(options.out.slice(0, slash), { recursive: true });
  await Deno.writeTextFile(options.out, output);
  console.error(`wrote ${options.out}`);
}

console.log(output.trimEnd());
