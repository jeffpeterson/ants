import { DEFAULTS } from "../src/colony.js";
import {
  evaluateCandidate,
  HYPOTHESIS_PARAMS,
  SCREENING_SCENARIOS,
  STRESS_SCENARIOS,
  TRAINING_SCENARIOS,
  VALIDATION_SCENARIOS,
} from "../src/optimization.js";

const parseArgs = (args) =>
  args.reduce((options, argument) => {
    if (!argument.startsWith("--")) return options;
    const [key, value = "true"] = argument.slice(2).split("=", 2);
    return { ...options, [key]: value };
  }, {});

const options = parseArgs(Deno.args);
const suites = {
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
const candidates = imported !== null
  ? [{
    id: options.name ?? "imported",
    params: imported.winner ?? imported.params ?? imported,
  }]
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
  const evaluation = evaluateCandidate(params, scenarios, { dt });
  return {
    id,
    params: evaluation.params,
    aggregate: evaluation.aggregate,
    scenarios: options.full === "true" ? evaluation.scenarios : undefined,
  };
});
const report = {
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
