import {
  designCandidates,
  evaluateCandidate,
  EVALUATION_VERSION,
  rankEvaluations,
  refineCandidates,
  SCREENING_SCENARIOS,
  TRAINING_SCENARIOS,
  VALIDATION_SCENARIOS,
} from "../src/optimization.js";
import { parseArgs } from "./args.js";

const boundedInteger = (value, fallback, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, Math.round(Number(value ?? fallback))));

const options = parseArgs(Deno.args);
const model = options.model === "edge" ? "edge" : "node";
const fixed = model === "edge"
  ? {
    foodTrailModel: "edge",
    outboundPolarity: 0,
    returnFastPolarity: 0,
  }
  : { foodTrailModel: "node" };
const settings = {
  model,
  method: options.method === "random" ? "random" : "lhs",
  searchSeed: Number(options["search-seed"] ?? 20_260_727) >>> 0,
  samples: boundedInteger(options.samples, 48, 1, 1_000),
  rounds: boundedInteger(options.rounds, 2, 0, 6),
  elite: boundedInteger(options.elite, 6, 1, 40),
  perElite: boundedInteger(options["per-elite"], 3, 1, 20),
  finalists: boundedInteger(options.finalists, 8, 1, 40),
  validate: boundedInteger(options.validate, 4, 1, 20),
  trainingLimit: boundedInteger(
    options["training-limit"],
    TRAINING_SCENARIOS.length,
    1,
    TRAINING_SCENARIOS.length,
  ),
  validationLimit: boundedInteger(
    options["validation-limit"],
    VALIDATION_SCENARIOS.length,
    1,
    VALIDATION_SCENARIOS.length,
  ),
  dt: Number(options.dt ?? 0.25),
};

const evaluateBatch = (candidates, scenarios, label) =>
  candidates.map((candidate, index) => {
    console.error(`${label} ${index + 1}/${candidates.length}: ${candidate.id}`);
    return {
      candidate,
      evaluation: evaluateCandidate(candidate.params, scenarios, {
        dt: settings.dt,
      }),
    };
  });

const designed = designCandidates({
  samples: settings.samples,
  seed: settings.searchSeed,
  method: settings.method,
  fixed,
});
const initial = evaluateBatch(
  designed.candidates,
  SCREENING_SCENARIOS,
  "screen",
);
const refined = Array.from({ length: settings.rounds }).reduce(
  (state, _, round) => {
    const elites = rankEvaluations(state.pool)
      .slice(0, settings.elite)
      .map(({ candidate }) => candidate);
    const generated = refineCandidates(elites, {
      round,
      perElite: settings.perElite,
      seed: state.seed,
      fixed,
    });
    const evaluated = evaluateBatch(
      generated.candidates,
      SCREENING_SCENARIOS,
      `refine ${round + 1}`,
    );
    return {
      pool: [...state.pool, ...evaluated],
      seed: generated.seed,
    };
  },
  { pool: initial, seed: designed.seed },
);

const screened = rankEvaluations(refined.pool);
const trainingCandidates = screened
  .slice(0, settings.finalists)
  .map(({ candidate }) => candidate);
const training = rankEvaluations(
  evaluateBatch(
    trainingCandidates,
    TRAINING_SCENARIOS.slice(0, settings.trainingLimit),
    "train",
  ),
);
const validationCandidates = training
  .slice(0, settings.validate)
  .map(({ candidate }) => candidate);
const validation = rankEvaluations(
  evaluateBatch(
    validationCandidates,
    VALIDATION_SCENARIOS.slice(0, settings.validationLimit),
    "validate",
  ),
);

const aggregateFor = (ranked, id) =>
  ranked.find(({ candidate }) => candidate.id === id)?.evaluation.aggregate ??
    null;
const report = {
  version: EVALUATION_VERSION,
  settings,
  scenarioCounts: {
    screening: SCREENING_SCENARIOS.length,
    training: settings.trainingLimit,
    validation: settings.validationLimit,
  },
  winner: validation[0].candidate.params,
  ranking: validation.map(({ candidate, evaluation }) => ({
    id: candidate.id,
    params: candidate.params,
    screening: aggregateFor(screened, candidate.id),
    training: aggregateFor(training, candidate.id),
    validation: evaluation.aggregate,
    scenarios: evaluation.scenarios,
  })),
};
const output = `${JSON.stringify(report, null, 2)}\n`;

if (typeof options.out === "string" && options.out !== "true") {
  const slash = options.out.lastIndexOf("/");
  if (slash > 0) await Deno.mkdir(options.out.slice(0, slash), { recursive: true });
  await Deno.writeTextFile(options.out, output);
  console.error(`wrote ${options.out}`);
}

console.log(output.trimEnd());
