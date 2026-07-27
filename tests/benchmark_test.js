import {
  freezeGraphSnapshot,
  graphFingerprint,
  runHistoricalBenchmark,
} from "../src/benchmark.js";
import { HISTORICAL_BENCHMARK_ENGINES } from "../src/benchmarks/historical.js";
import { BENCHMARK_ENGINES, getBenchmarkEngine } from "../src/benchmarks/registry.js";
import { HISTORICAL_ENGINES } from "../src/engines/historical/engines.js";

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

const graph = (length = 2) => ({
  nodes: [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: length, y: 0 },
  ],
  edges: [{ id: "0:1", a: 0, b: 1, length }],
  adjacency: { 0: [1], 1: [0] },
  edgeById: {
    "0:1": { id: "0:1", a: 0, b: 1, length },
  },
  hill: 0,
  foods: [1],
});

const fakeEngine = ({
  id,
  rateScale = 1,
  nativeDistance = 2,
  onInitialize = () => {},
}) => ({
  id,
  version: 1,
  name: `Fake ${id}`,
  revision: `${id}-revision`,
  family: "fake",
  defaults: Object.freeze({ rateScale }),
  initialize: ({ lane, graphSnapshot, runSeed }) => {
    onInitialize({ lane, graphSnapshot, runSeed });
    if (lane === "common") {
      assert(Object.isFrozen(graphSnapshot));
      assert(Object.isFrozen(graphSnapshot.nodes));
      assert(Object.isFrozen(graphSnapshot.nodes[0]));
    }
    const selectedGraph = lane === "common" ? graphSnapshot : freezeGraphSnapshot(
      graph(nativeDistance),
    );
    const rate = (0.25 + (runSeed % 2) * 0.25) * rateScale;
    return {
      elapsed: 0,
      deliveries: 0,
      graph: selectedGraph,
      shortestDistance: selectedGraph.edges[0].length,
      rate,
    };
  },
  step: (state, seconds) => {
    const elapsed = state.elapsed + seconds;
    return {
      ...state,
      elapsed,
      deliveries: Math.floor(elapsed * state.rate),
    };
  },
  inspect: (state) => ({
    elapsed: state.elapsed,
    deliveries: state.deliveries,
    shortestDistance: state.shortestDistance,
    graph: state.graph,
  }),
});

const scenario = () => ({
  id: "tiny",
  graphSeed: 17,
  graphParams: { size: "tiny" },
  graphSnapshot: graph(2),
  shortestDistance: 2,
  runSeed: 10,
});

const options = () => ({
  engines: [
    fakeEngine({ id: "slow" }),
    fakeEngine({ id: "fast", rateScale: 2 }),
  ],
  scenarios: [scenario()],
  lanes: ["common"],
  runSeeds: [10, 11],
  resources: { antCount: 2, speed: 1 },
  dt: 7,
  provenance: { suite: "fake" },
});

Deno.test("common benchmarks pair seeds and retain raw scenario measurements", () => {
  const snapshots = [];
  const input = {
    ...options(),
    engines: [
      fakeEngine({
        id: "slow",
        onInitialize: ({ graphSnapshot }) => snapshots.push(graphSnapshot),
      }),
      fakeEngine({
        id: "fast",
        rateScale: 2,
        onInitialize: ({ graphSnapshot }) => snapshots.push(graphSnapshot),
      }),
    ],
  };
  const first = runHistoricalBenchmark(input);
  const second = runHistoricalBenchmark(options());

  assertEquals(first, second);
  assertEquals(first.schema, "formic-historical-benchmark");
  assertEquals(first.version, 1);
  assertEquals(first.provenance.suite, "fake");
  assertEquals(first.provenance.runSeeds, [10, 11]);
  assertEquals(Object.keys(first.lanes), ["common"]);
  assert(!Object.isFrozen(input.scenarios[0].graphSnapshot));
  assert(snapshots.every((snapshot) => snapshot === snapshots[0]));

  const [slow, fast] = first.lanes.common.engines;
  assertEquals(slow.engine.id, "slow");
  assertEquals(fast.engine.id, "fast");
  assertEquals(
    slow.scenarios[0].runs.map(({ runSeed }) => runSeed),
    [10, 11],
  );
  assertEquals(
    fast.scenarios[0].runs.map(({ runSeed }) => runSeed),
    [10, 11],
  );
  assertEquals(
    slow.scenarios[0].commonGraph.fingerprint,
    fast.scenarios[0].commonGraph.fingerprint,
  );

  const [even, odd] = slow.scenarios[0].runs;
  assertEquals(even.visible, {
    startSeconds: 0,
    endSeconds: 30,
    deliveries: 7,
    deliveriesPerSecond: 7 / 30,
  });
  assertEquals(odd.visible.deliveries, 15);
  assertEquals(even.steady.deliveries, 6);
  assertEquals(even.steady.normalizedThroughput, 0.5);
  assertEquals(odd.steady.deliveries, 12);
  assertEquals(odd.steady.normalizedThroughput, 1);
  assertEquals(slow.aggregate.runCount, 2);
  assertEquals(slow.aggregate.visible.meanDeliveries, 11);
  assertEquals(slow.aggregate.steady.meanNormalizedThroughput, 0.75);
  assertEquals(fast.aggregate.steady.meanNormalizedThroughput, 1.5);
  assertEquals(JSON.parse(JSON.stringify(first)), first);
});

Deno.test("native diagnostics stay separate and use each engine's graph", () => {
  const report = runHistoricalBenchmark({
    engines: [
      fakeEngine({ id: "near", nativeDistance: 2 }),
      fakeEngine({ id: "far", nativeDistance: 4 }),
    ],
    scenarios: [scenario()],
    lanes: ["common", "native"],
    runSeeds: [10],
    resources: { antCount: 2, speed: 1 },
    dt: 5,
  });

  const [commonNear, commonFar] = report.lanes.common.engines;
  const [nativeNear, nativeFar] = report.lanes.native.engines;
  const commonNearRun = commonNear.scenarios[0].runs[0];
  const commonFarRun = commonFar.scenarios[0].runs[0];
  const nativeNearRun = nativeNear.scenarios[0].runs[0];
  const nativeFarRun = nativeFar.scenarios[0].runs[0];

  assertEquals(commonNearRun.graph.fingerprint, commonFarRun.graph.fingerprint);
  assert(
    nativeNearRun.graph.fingerprint !== nativeFarRun.graph.fingerprint,
    "Native engines should retain distinct graph diagnostics",
  );
  assertEquals(nativeNearRun.shortestDistance, 2);
  assertEquals(nativeFarRun.shortestDistance, 4);
  assertEquals(nativeNearRun.steady.normalizedThroughput, 0.5);
  assertEquals(nativeFarRun.steady.normalizedThroughput, 1);
  assertEquals(nativeNear.scenarios[0].commonGraph, null);
  assertEquals(nativeFar.scenarios[0].commonGraph, null);
});

Deno.test("graph snapshots are cloned, frozen, and deterministically identified", () => {
  const source = graph(3);
  const snapshot = freezeGraphSnapshot(source);

  assert(snapshot !== source);
  assert(Object.isFrozen(snapshot));
  assert(Object.isFrozen(snapshot.edges));
  assert(Object.isFrozen(snapshot.adjacency[0]));
  assert(!Object.isFrozen(source));
  assertEquals(graphFingerprint(snapshot), graphFingerprint(source));
  assertEquals(graphFingerprint(freezeGraphSnapshot(source)), graphFingerprint(source));
});

Deno.test("benchmark contracts reject ambiguous registries and scenarios", () => {
  const engine = fakeEngine({ id: "duplicate" });
  assertThrows(
    () =>
      runHistoricalBenchmark({
        engines: [engine, engine],
        scenarios: [scenario()],
      }),
    "engine ids must be unique",
  );
  assertThrows(
    () =>
      runHistoricalBenchmark({
        engines: [engine],
        scenarios: [{ ...scenario(), graphSnapshot: undefined }],
        lanes: ["common"],
      }),
    "missing a common graph snapshot",
  );
  assertThrows(
    () =>
      runHistoricalBenchmark({
        engines: [engine],
        scenarios: [scenario()],
        lanes: ["combined"],
      }),
    "lanes must contain common, native, or both",
  );
  assertThrows(
    () =>
      runHistoricalBenchmark({
        engines: [engine],
        scenarios: [scenario()],
        runSeeds: [-1],
      }),
    "must be an unsigned 32-bit integer",
  );
});

Deno.test("benchmark registry includes every historical engine and its provenance", () => {
  assert(Object.isFrozen(BENCHMARK_ENGINES));
  assert(Object.isFrozen(HISTORICAL_BENCHMARK_ENGINES));
  assertEquals(BENCHMARK_ENGINES.map(({ id }) => id), [
    "scalar-field",
    "A0",
    "A1",
    "A2",
    "A3",
    "A4",
    "B0",
    "B1",
  ]);
  HISTORICAL_BENCHMARK_ENGINES.forEach((engine, index) => {
    const source = HISTORICAL_ENGINES[index];
    assert(getBenchmarkEngine(engine.id) === engine);
    assertEquals(engine.revision, source.revision);
    assert(engine.capabilities === source.capabilities);
    assert(Object.isFrozen(engine.capabilities));
    assertEquals(engine.capabilities.commonGraph, true);
    assertEquals(engine.capabilities.nativeGraph, true);
  });
});

Deno.test("all historical engines complete one paired common benchmark run", () => {
  const commonScenario = {
    ...scenario(),
    graphSnapshot: graph(0.2),
    shortestDistance: 0.2,
  };
  const report = runHistoricalBenchmark({
    engines: HISTORICAL_BENCHMARK_ENGINES,
    scenarios: [commonScenario],
    lanes: ["common"],
    runSeeds: [10],
    resources: { antCount: 8, speed: 0.3 },
    dt: 0.25,
  });

  assertEquals(
    report.lanes.common.engines.map(({ engine }) => engine.id),
    ["A0", "A1", "A2", "A3", "A4", "B0", "B1"],
  );
  assertEquals(
    report.provenance.engines.map(({ id, revision, capabilities }) => ({
      id,
      revision,
      capabilities,
    })),
    HISTORICAL_BENCHMARK_ENGINES.map(({ id, revision, capabilities }) => ({
      id,
      revision,
      capabilities,
    })),
  );
  report.lanes.common.engines.forEach(({ engine, scenarios }) => {
    const adapter = getBenchmarkEngine(engine.id);
    const [result] = scenarios;
    const [run] = result.runs;

    assertEquals(engine.revision, adapter.revision);
    assertEquals(engine.capabilities, adapter.capabilities);
    assertEquals(run.runSeed, 10);
    assertEquals(run.graph.fingerprint, result.commonGraph.fingerprint);
    assert(Number.isInteger(run.visible.deliveries));
    assert(Number.isInteger(run.steady.deliveries));
  });
});

Deno.test("historical benchmark inspection reads cumulative counters exactly", () => {
  const graphSnapshot = freezeGraphSnapshot(graph(0.2));
  HISTORICAL_BENCHMARK_ENGINES.forEach((adapter) => {
    const initial = adapter.initialize({
      lane: "common",
      graphSnapshot,
      graphSeed: 17,
      graphParams: { nodeCount: 2, density: 0.1 },
      runSeed: 10,
      resources: { antCount: 8, speed: 0.3 },
    });
    const next = adapter.step(initial, 0.25);
    const observation = adapter.inspect(next);
    const native = adapter.initialize({
      lane: "native",
      graphSnapshot,
      graphSeed: 17,
      graphParams: { nodeCount: 8, density: 0.1 },
      runSeed: 10,
      resources: { antCount: 8, speed: 0.3 },
    });

    assertEquals(initial.adapter.lane, "common");
    assertEquals(native.adapter.lane, "native");
    assert(native.graph.nodes.length > graphSnapshot.nodes.length);
    assertEquals(observation.elapsed, next.elapsed);
    assertEquals(observation.deliveries, next.stats.deliveries);
    assertEquals(observation.shortestDistance, next.stats.shortestDistance);
    assert(observation.graph === next.graph);
  });
});
