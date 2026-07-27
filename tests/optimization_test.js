import {
  adaptationDestination,
  aggregateEvaluation,
  anchorCandidates,
  assertOptimizationSchema,
  CONFIRMATION_SCENARIOS,
  decodePoint,
  designCandidates,
  encodeParameters,
  evaluateScenario,
  EVALUATION_HORIZONS,
  HYPOTHESIS_PARAMS,
  latinHypercube,
  measureThroughput,
  PARAMETER_SPECS,
  refineCandidates,
  repeatScenarios,
  VALIDATION_SCENARIOS,
} from "../src/optimization.js";
import { createSimulation } from "../src/colony.js";
import { parseArgs, parseAssignments } from "../tools/args.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

Deno.test("optimization schema covers every tuned playground parameter", () => {
  assert(assertOptimizationSchema());
  assertEquals(
    new Set(PARAMETER_SPECS.map(({ key }) => key)).size,
    PARAMETER_SPECS.length,
  );
});

Deno.test("confirmation scenarios are fresh, deterministic, and immutable", () => {
  const validationSeeds = new Set(
    VALIDATION_SCENARIOS.flatMap(({ seed, runSeed }) => [seed, runSeed]),
  );
  assertEquals(CONFIRMATION_SCENARIOS.length, 24);
  assert(Object.isFrozen(CONFIRMATION_SCENARIOS));
  CONFIRMATION_SCENARIOS.forEach((scenario) => {
    assert(Object.isFrozen(scenario));
    assert(Object.isFrozen(scenario.graph));
    assert(!validationSeeds.has(scenario.seed));
    assert(!validationSeeds.has(scenario.runSeed));
  });
});

Deno.test("scenario repeats are deterministic and preserve each base run", () => {
  const source = VALIDATION_SCENARIOS.slice(0, 2);
  const first = repeatScenarios(source, 3);
  const second = repeatScenarios(source, 3);

  assertEquals(first, second);
  assertEquals(first.length, 6);
  assertEquals(repeatScenarios(source, Number.NaN).length, source.length);
  source.forEach((scenario, graph) => {
    const runs = first.slice(graph * 3, graph * 3 + 3);
    assertEquals(runs[0].runSeed, scenario.runSeed);
    assertEquals(new Set(runs.map(({ runSeed }) => runSeed)).size, 3);
    assert(runs.every(({ seed }) => seed === scenario.seed));
  });
});

Deno.test("CLI options preserve assignments containing equals signs", () => {
  const options = parseArgs([
    "--set=choiceFloor=1,foodTrailModel=edge",
    "--full",
  ]);
  assertEquals(options.set, "choiceFloor=1,foodTrailModel=edge");
  assertEquals(options.full, "true");
  assertEquals(parseAssignments(options.set), {
    choiceFloor: 1,
    foodTrailModel: "edge",
  });
});

Deno.test("Latin hypercube designs are seeded and cover every stratum", () => {
  const first = latinHypercube(16, 4, 42);
  const second = latinHypercube(16, 4, 42);
  assertEquals(first, second);
  assert(JSON.stringify(first) !== JSON.stringify(latinHypercube(16, 4, 43)));

  Array.from({ length: 4 }, (_, dimension) =>
    first.points
      .map((point) => Math.floor(point[dimension] * 16))
      .toSorted((left, right) => left - right)).forEach((strata) =>
      assertEquals(strata, Array.from({ length: 16 }, (_, index) => index)));
});

Deno.test("normalized candidates decode to exact bounds and round-trip", () => {
  const lower = decodePoint(PARAMETER_SPECS.map(() => 0));
  const upper = decodePoint(PARAMETER_SPECS.map(() => 1));
  PARAMETER_SPECS.forEach(({ key, min, max }) => {
    assertEquals(lower[key], min);
    assertEquals(upper[key], max);
  });

  const encoded = encodeParameters(HYPOTHESIS_PARAMS);
  const decoded = decodePoint(encoded);
  PARAMETER_SPECS.forEach(({ key }) =>
    assert(Math.abs(decoded[key] - HYPOTHESIS_PARAMS[key]) < 1e-9)
  );
});

Deno.test("candidate anchors and refinements are deterministic and bounded", () => {
  const anchors = anchorCandidates();
  assertEquals(anchors[0].id, "defaults");
  assertEquals(anchors[1].id, "hypothesis");
  PARAMETER_SPECS
    .filter(({ min, max }) => min <= 0 && max >= 0)
    .forEach(({ key }) =>
      assert(anchors.some(({ params }) => params[key] === 0), `Missing zero ${key}`)
    );

  const design = designCandidates({ samples: 8, seed: 7 });
  const elites = design.candidates.slice(0, 3);
  const first = refineCandidates(elites, { seed: 9, perElite: 3 });
  const second = refineCandidates(elites, { seed: 9, perElite: 3 });
  assertEquals(first, second);
  assert(
    first.candidates.every(({ point }) =>
      point.every((value) => value >= 0 && value <= 1)
    ),
  );

  const edgeDesign = designCandidates({
    samples: 2,
    seed: 7,
    fixed: {
      foodTrailModel: "edge",
      outboundPolarity: 0,
      returnFastPolarity: 0,
    },
  });
  assert(edgeDesign.candidates.every(({ params }) =>
    params.foodTrailModel === "edge" &&
    params.outboundPolarity === 0 &&
    params.returnFastPolarity === 0
  ));
});

Deno.test("adaptation destinations are deterministic, distinct, and local-agnostic", () => {
  const simulation = createSimulation({
    seed: 77,
    params: { nodeCount: 24, density: 0.42, mapVariation: 0.72 },
  });
  const destination = adaptationDestination(simulation.graph);
  assertEquals(destination, adaptationDestination(simulation.graph));
  assert(destination !== simulation.graph.hill);
  assert(!simulation.graph.foods.includes(destination));
});

Deno.test("scenario evaluation is deterministic, immutable, and finite", () => {
  const candidate = { ...HYPOTHESIS_PARAMS };
  const snapshot = JSON.stringify(candidate);
  const scenario = {
    id: "test",
    seed: 93,
    runSeed: 44,
    graph: { nodeCount: 8, density: 0.8, mapVariation: 0.7 },
  };
  const options = {
    dt: 0.25,
    resources: { antCount: 16, speed: 0.65 },
    horizons: {
      ...EVALUATION_HORIZONS,
      discoveryUnits: 3,
      staticUnits: 6,
      steadyStartUnits: 2,
      warmUnits: 4,
      preStartUnits: 2,
      adaptationUnits: 4,
      lateAdaptationUnits: 2,
      binUnits: 1,
    },
  };
  const first = evaluateScenario(candidate, scenario, options);
  const second = evaluateScenario(candidate, scenario, options);

  assertEquals(first, second);
  assertEquals(JSON.stringify(candidate), snapshot);
  assert(Object.values(first.metrics).every(Number.isFinite));
  assert(Object.values(first.health).every(Number.isFinite));
  assert(
    Math.abs(
      Object.values(first.diagnostics.stateSharesSteady).reduce(
        (sum, value) => sum + value,
        0,
      ) - 1,
    ) < 1e-9,
  );
});

Deno.test("finite throughput windows allow cycles already in flight", () => {
  const cycles = Array.from({ length: 11 }, (_, index) => ({
    food: 3,
    deliveredAt: index,
  }));
  const measured = measureThroughput(
    cycles,
    3,
    0,
    10,
    { antCount: 10, speed: 0.2 },
    1,
  );

  assertEquals(measured.value, 1);
  assertEquals(measured.raw, 1.1);
  assertEquals(measured.maximum, 2);
});

const scoredFixture = (value, failures = {}) => ({
  metrics: {
    discovery: value,
    throughput: value,
    efficiency: value,
    homing: value,
    adaptation: value,
  },
  failures: {
    noPickup: false,
    noDelivery: false,
    noAdaptDelivery: false,
    stranded: false,
    invalid: false,
    ...failures,
  },
});

Deno.test("aggregate scoring rewards improvements and penalizes failures", () => {
  const low = aggregateEvaluation([scoredFixture(0.2), scoredFixture(0.3)]);
  const high = aggregateEvaluation([scoredFixture(0.7), scoredFixture(0.8)]);
  const failed = aggregateEvaluation([
    scoredFixture(0.8, { noAdaptDelivery: true }),
    scoredFixture(0.8),
  ]);
  assert(high.score > low.score);
  assert(failed.score < high.score);
});

Deno.test("multi-run aggregation exposes weak seeds and graph failures", () => {
  const stable = aggregateEvaluation([
    { ...scoredFixture(0.8), seed: 1 },
    { ...scoredFixture(0.8), seed: 1 },
    { ...scoredFixture(0.8), seed: 2 },
    { ...scoredFixture(0.8), seed: 2 },
  ]);
  const volatile = aggregateEvaluation([
    { ...scoredFixture(0.8), seed: 1 },
    { ...scoredFixture(0.1, { noAdaptDelivery: true }), seed: 1 },
    { ...scoredFixture(0.8), seed: 2 },
    { ...scoredFixture(0.8), seed: 2 },
  ]);

  assertEquals(stable.runCount, 4);
  assertEquals(stable.graphCount, 2);
  assertEquals(stable.seedScoreSpread, 0);
  assert(volatile.seedFloorScore < stable.seedFloorScore);
  assert(volatile.seedScoreSpread > stable.seedScoreSpread);
  assertEquals(volatile.failureGraphRates.noAdaptDelivery, 0.5);
});
