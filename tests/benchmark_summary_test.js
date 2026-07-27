import {
  benchmarkSummaryToMarkdown,
  summarizeBenchmarkReport,
} from "../src/benchmark_summary.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const assertThrows = (action, message) => {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes(message), error.message);
    return;
  }
  throw new Error(`Expected error containing “${message}”`);
};

const run = (runSeed, normalizedThroughput, deliveries) => ({
  runSeed,
  steady: { normalizedThroughput },
  visible: { deliveries },
});

const scenario = (id, runs) => ({ id, runs });

const engine = (id, scenarios) => ({
  engine: {
    id,
    name: id === "scalar-field" ? "Scalar field" : "Challenger",
    revision: `${id}-revision`,
    family: "fake",
  },
  scenarios,
});

const fakeReport = () => ({
  schema: "formic-historical-benchmark",
  version: 1,
  provenance: { suite: "fake" },
  lanes: {
    common: {
      lane: "common",
      engines: [
        engine("scalar-field", [
          scenario("s1", [run(1, 1, 0), run(2, 2, 2)]),
          scenario("s2", [run(1, 3, 4), run(2, 4, 6)]),
        ]),
        engine("challenger", [
          scenario("s2", [run(1, 1, 0), run(99, 10, 8)]),
          scenario("s1", [run(2, 2, 2), run(1, 2, 4)]),
        ]),
      ],
    },
    native: {
      lane: "native",
      engines: [
        engine("scalar-field", [scenario("native", [run(5, 0.5, 0)])]),
        engine("challenger", [scenario("native", [run(5, 0.75, 2)])]),
      ],
    },
  },
});

Deno.test("benchmark summaries recompute statistics and exact paired rates", () => {
  const report = fakeReport();
  const snapshot = JSON.stringify(report);
  const summary = summarizeBenchmarkReport(report);
  const [baseline, challenger] = summary.lanes.common.engines;
  const nativeChallenger = summary.lanes.native.engines[1];

  assertEquals(JSON.stringify(report), snapshot);
  assertEquals(summary.schema, "formic-historical-benchmark-summary");
  assertEquals(summary.version, 1);
  assertEquals(summary.source, {
    schema: "formic-historical-benchmark",
    version: 1,
    suite: "fake",
  });
  assertEquals(summary.baselineEngineId, "scalar-field");
  assertEquals(baseline.steadyQ, {
    mean: 2.5,
    median: 2.5,
    p10: 1.3,
    minimum: 1,
    maximum: 4,
  });
  assertEquals(baseline.visible, {
    meanDeliveries: 3,
    noDeliveryRuns: 1,
  });
  assertEquals(baseline.paired, {
    baselineEngineId: "scalar-field",
    matchedRuns: 4,
    wins: 0,
    ties: 4,
    losses: 0,
    winRate: 0,
    tieRate: 1,
    lossRate: 0,
  });
  assertEquals(challenger.runCount, 4);
  assertEquals(challenger.steadyQ, {
    mean: 3.75,
    median: 2,
    p10: 1.3,
    minimum: 1,
    maximum: 10,
  });
  assertEquals(challenger.visible, {
    meanDeliveries: 3.5,
    noDeliveryRuns: 1,
  });
  assertEquals(challenger.paired, {
    baselineEngineId: "scalar-field",
    matchedRuns: 3,
    wins: 1,
    ties: 1,
    losses: 1,
    winRate: 1 / 3,
    tieRate: 1 / 3,
    lossRate: 1 / 3,
  });
  assertEquals(nativeChallenger.paired.wins, 1);
  assertEquals(nativeChallenger.paired.matchedRuns, 1);
  assertEquals(summarizeBenchmarkReport(fakeReport()), summary);
});

Deno.test("benchmark summaries support a chosen baseline and reject ambiguous input", () => {
  const summary = summarizeBenchmarkReport(fakeReport(), {
    baselineEngineId: "challenger",
  });
  const [scalar, challenger] = summary.lanes.common.engines;

  assertEquals(scalar.paired.matchedRuns, 3);
  assertEquals(
    [scalar.paired.wins, scalar.paired.ties, scalar.paired.losses],
    [1, 1, 1],
  );
  assertEquals(challenger.paired.ties, 4);
  assertThrows(
    () =>
      summarizeBenchmarkReport(fakeReport(), {
        baselineEngineId: "missing",
      }),
    "Baseline engine missing is missing from common lane",
  );

  const duplicate = fakeReport();
  duplicate.lanes.common.engines[0].scenarios[0].runs.push(run(1, 9, 9));
  assertThrows(
    () => summarizeBenchmarkReport(duplicate),
    "duplicate scenario/runSeed pairs",
  );
});

Deno.test("benchmark summaries render compact Markdown", () => {
  const markdown = benchmarkSummaryToMarkdown(
    summarizeBenchmarkReport(fakeReport()),
  );

  assert(markdown.startsWith("# Historical benchmark summary\n"));
  assert(markdown.includes("Baseline: `scalar-field`"));
  assert(markdown.includes("## common"));
  assert(markdown.includes("## native"));
  assert(markdown.includes("Challenger (`challenger`) | 4 | 3.75 | 2 | 1.3"));
  assert(markdown.includes("1/1/1"));
  assert(markdown.includes("33.3%/33.3%/33.3%"));
});
