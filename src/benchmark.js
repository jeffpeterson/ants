export const HISTORICAL_BENCHMARK_VERSION = 1;

export const DEFAULT_BENCHMARK_RESOURCES = Object.freeze({
  antCount: 64,
  speed: 0.17,
});

export const DEFAULT_BENCHMARK_WINDOWS = Object.freeze({
  visibleStartSeconds: 0,
  visibleEndSeconds: 30,
  steadyStartUnits: 20,
  steadyEndUnits: 32,
});

const EPSILON = 1e-9;

const mean = (values) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const finitePositive = (name, value) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number`);
  }
  return value;
};

const finiteNonNegative = (name, value) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return value;
};

const unique = (name, values) => {
  const seen = new Set(values);
  if (seen.size !== values.length) {
    throw new Error(`${name} must be unique`);
  }
  return values;
};

const seedValue = (name, value) => {
  const numeric = Number(value);
  if (
    !Number.isInteger(numeric) ||
    numeric < 0 ||
    numeric > 0xffff_ffff
  ) {
    throw new Error(`${name} must be an unsigned 32-bit integer`);
  }
  return numeric >>> 0;
};

const cloneAndFreeze = (value) => {
  if (value === null || typeof value !== "object") return value;
  const cloned = structuredClone(value);
  const freeze = (item) => {
    Object.values(item).forEach((child) => {
      if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
        freeze(child);
      }
    });
    return Object.freeze(item);
  };
  return freeze(cloned);
};

const graphRecord = (graph) => ({
  nodes: graph.nodes.map(({ id, x, y }) => ({ id, x, y })),
  edges: graph.edges.map(({ id, a, b, length }) => ({ id, a, b, length })),
  adjacency: Object.fromEntries(
    Object.entries(graph.adjacency)
      .toSorted(([first], [second]) => Number(first) - Number(second))
      .map(([node, neighbors]) => [
        node,
        neighbors.toSorted((first, second) => first - second),
      ]),
  ),
  edgeById: Object.fromEntries(
    Object.entries(graph.edgeById)
      .toSorted(([first], [second]) => first.localeCompare(second))
      .map(([id, { a, b, length }]) => [id, { a, b, length }]),
  ),
  hill: graph.hill,
  foods: [...graph.foods],
});

const fnv1a = (text) =>
  [...new TextEncoder().encode(text)].reduce(
    (hash, byte) => Math.imul(hash ^ byte, 0x01000193) >>> 0,
    0x811c9dc5,
  );

export const graphFingerprint = (graph) =>
  `fnv1a32:${fnv1a(JSON.stringify(graphRecord(graph))).toString(16).padStart(8, "0")}`;

const graphSummary = (graph) => ({
  fingerprint: graphFingerprint(graph),
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length,
  hill: graph.hill,
  foods: [...graph.foods],
});

export const freezeGraphSnapshot = (graph) => {
  const snapshot = cloneAndFreeze(graph);
  graphSummary(snapshot);
  return snapshot;
};

const adapterSummary = (adapter) => ({
  id: adapter.id,
  version: adapter.version,
  name: adapter.name ?? adapter.id,
  revision: adapter.revision ?? null,
  family: adapter.family ?? null,
  defaults: adapter.defaults ?? null,
  capabilities: adapter.capabilities ?? null,
});

const validateAdapter = (adapter) => {
  if (typeof adapter.id !== "string" || adapter.id.length === 0) {
    throw new Error("Benchmark engine id must be a non-empty string");
  }
  ["initialize", "step", "inspect"].forEach((method) => {
    if (typeof adapter[method] !== "function") {
      throw new Error(`Benchmark engine ${adapter.id} is missing ${method}`);
    }
  });
  return adapter;
};

const validateResources = (resources) => {
  const antCount = finitePositive("antCount", resources.antCount);
  if (!Number.isInteger(antCount)) {
    throw new Error("antCount must be a positive integer");
  }
  return Object.freeze({
    antCount,
    speed: finitePositive("speed", resources.speed),
  });
};

const validateWindows = (windows) => {
  const values = {
    visibleStartSeconds: finiteNonNegative(
      "visibleStartSeconds",
      windows.visibleStartSeconds,
    ),
    visibleEndSeconds: finitePositive(
      "visibleEndSeconds",
      windows.visibleEndSeconds,
    ),
    steadyStartUnits: finiteNonNegative(
      "steadyStartUnits",
      windows.steadyStartUnits,
    ),
    steadyEndUnits: finitePositive("steadyEndUnits", windows.steadyEndUnits),
  };
  if (values.visibleEndSeconds <= values.visibleStartSeconds) {
    throw new Error("Visible benchmark window must have positive duration");
  }
  if (values.steadyEndUnits <= values.steadyStartUnits) {
    throw new Error("Steady benchmark window must have positive duration");
  }
  return Object.freeze(values);
};

const inspect = (adapter, state) => {
  const observation = adapter.inspect(state);
  finiteNonNegative(`${adapter.id} elapsed`, observation.elapsed);
  finiteNonNegative(`${adapter.id} deliveries`, observation.deliveries);
  finitePositive(`${adapter.id} shortestDistance`, observation.shortestDistance);
  return observation;
};

const advanceTo = (adapter, state, target, dt) => {
  const start = inspect(adapter, state).elapsed;
  if (start > target + EPSILON) {
    throw new Error(`${adapter.id} advanced beyond a benchmark checkpoint`);
  }
  const count = Math.max(0, Math.ceil((target - start) / dt - EPSILON));
  const advanced = Array.from({ length: count }).reduce((current) => {
    const elapsed = inspect(adapter, current).elapsed;
    const remaining = target - elapsed;
    if (remaining <= EPSILON) return current;
    const next = adapter.step(current, Math.min(dt, remaining));
    const nextElapsed = inspect(adapter, next).elapsed;
    if (nextElapsed <= elapsed + EPSILON) {
      throw new Error(`${adapter.id} did not advance simulation time`);
    }
    if (nextElapsed > target + EPSILON) {
      throw new Error(`${adapter.id} advanced beyond a benchmark checkpoint`);
    }
    return next;
  }, state);
  const elapsed = inspect(adapter, advanced).elapsed;
  if (Math.abs(elapsed - target) > EPSILON) {
    throw new Error(`${adapter.id} did not reach benchmark checkpoint ${target}`);
  }
  return advanced;
};

const observationAt = (observations, time) => {
  const match = observations.find((item) => Math.abs(item.time - time) <= EPSILON);
  if (match === undefined) throw new Error(`Missing benchmark checkpoint ${time}`);
  return match.observation;
};

const deliveryCount = (observations, start, end) =>
  observationAt(observations, end).deliveries -
  observationAt(observations, start).deliveries;

const windowResult = (deliveries, start, end) => ({
  startSeconds: start,
  endSeconds: end,
  deliveries,
  deliveriesPerSecond: deliveries / (end - start),
});

const runMeasurement = ({
  adapter,
  lane,
  scenario,
  graphSnapshot,
  runSeed,
  resources,
  windows,
  dt,
}) => {
  const initial = adapter.initialize({
    lane,
    graphSnapshot,
    graphSeed: scenario.graphSeed,
    graphParams: scenario.graphParams,
    runSeed,
    resources,
  });
  const initialObservation = inspect(adapter, initial);
  if (Math.abs(initialObservation.elapsed) > EPSILON) {
    throw new Error(`${adapter.id} benchmark state must start at time zero`);
  }
  const initialGraph = graphSummary(initialObservation.graph);
  if (
    lane === "common" &&
    initialGraph.fingerprint !== graphFingerprint(graphSnapshot)
  ) {
    throw new Error(`${adapter.id} did not use the common graph snapshot`);
  }

  const shortestDistance = lane === "common"
    ? finitePositive("scenario shortestDistance", scenario.shortestDistance)
    : initialObservation.shortestDistance;
  if (
    lane === "common" &&
    Math.abs(initialObservation.shortestDistance - shortestDistance) > EPSILON
  ) {
    throw new Error(`${adapter.id} disagrees with the common shortest distance`);
  }
  const unitSeconds = shortestDistance / resources.speed;
  const steadyStart = windows.steadyStartUnits * unitSeconds;
  const steadyEnd = windows.steadyEndUnits * unitSeconds;
  const checkpoints = [
    windows.visibleStartSeconds,
    windows.visibleEndSeconds,
    steadyStart,
    steadyEnd,
  ].toSorted((first, second) => first - second)
    .filter((value, index, values) =>
      index === 0 || Math.abs(value - values[index - 1]) > EPSILON
    );
  const trace = checkpoints.reduce(
    ({ state, observations }, checkpoint) => {
      const next = advanceTo(adapter, state, checkpoint, dt);
      return {
        state: next,
        observations: [
          ...observations,
          { time: checkpoint, observation: inspect(adapter, next) },
        ],
      };
    },
    {
      state: initial,
      observations: [{ time: 0, observation: initialObservation }],
    },
  );
  const visibleDeliveries = deliveryCount(
    trace.observations,
    windows.visibleStartSeconds,
    windows.visibleEndSeconds,
  );
  const steadyDeliveries = deliveryCount(
    trace.observations,
    steadyStart,
    steadyEnd,
  );
  const visible = windowResult(
    visibleDeliveries,
    windows.visibleStartSeconds,
    windows.visibleEndSeconds,
  );
  const steady = windowResult(steadyDeliveries, steadyStart, steadyEnd);
  const physicalRate = resources.antCount * resources.speed /
    (2 * shortestDistance);

  return {
    runSeed,
    graph: initialGraph,
    shortestDistance,
    unitSeconds,
    visible,
    steady: {
      ...steady,
      startUnits: windows.steadyStartUnits,
      endUnits: windows.steadyEndUnits,
      normalizedThroughput: steady.deliveriesPerSecond / physicalRate,
    },
  };
};

const aggregateRuns = (runs) => ({
  runCount: runs.length,
  visible: {
    meanDeliveries: mean(runs.map(({ visible }) => visible.deliveries)),
    meanDeliveriesPerSecond: mean(
      runs.map(({ visible }) => visible.deliveriesPerSecond),
    ),
    noDeliveryRuns: runs.filter(({ visible }) => visible.deliveries === 0).length,
  },
  steady: {
    meanDeliveries: mean(runs.map(({ steady }) => steady.deliveries)),
    meanDeliveriesPerSecond: mean(
      runs.map(({ steady }) => steady.deliveriesPerSecond),
    ),
    meanNormalizedThroughput: mean(
      runs.map(({ steady }) => steady.normalizedThroughput),
    ),
    minimumNormalizedThroughput: Math.min(
      ...runs.map(({ steady }) => steady.normalizedThroughput),
    ),
    maximumNormalizedThroughput: Math.max(
      ...runs.map(({ steady }) => steady.normalizedThroughput),
    ),
    noDeliveryRuns: runs.filter(({ steady }) => steady.deliveries === 0).length,
  },
});

const scenarioSeeds = (scenario, runSeeds) => {
  const selected = runSeeds ?? scenario.runSeeds ?? [scenario.runSeed];
  if (selected.length === 0) throw new Error(`${scenario.id} has no run seeds`);
  const seeds = selected.map((seed) => seedValue(`${scenario.id} run seed`, seed));
  return unique(`${scenario.id} run seeds`, seeds);
};

const scenarioResult = ({
  adapter,
  lane,
  scenario,
  graphSnapshot,
  runSeeds,
  resources,
  windows,
  dt,
}) => {
  const runs = scenarioSeeds(scenario, runSeeds).map((runSeed) =>
    runMeasurement({
      adapter,
      lane,
      scenario,
      graphSnapshot,
      runSeed,
      resources,
      windows,
      dt,
    })
  );
  return {
    id: scenario.id,
    graphSeed: scenario.graphSeed,
    graphParams: scenario.graphParams,
    commonGraph: graphSnapshot === null ? null : graphSummary(graphSnapshot),
    runs,
    aggregate: aggregateRuns(runs),
  };
};

const engineResult = ({
  adapter,
  lane,
  scenarios,
  runSeeds,
  resources,
  windows,
  dt,
}) => {
  const results = scenarios.map((scenario) => {
    const graphSnapshot = lane === "common" ? scenario.graphSnapshot : null;
    return scenarioResult({
      adapter,
      lane,
      scenario,
      graphSnapshot,
      runSeeds,
      resources,
      windows,
      dt,
    });
  });
  return {
    engine: adapterSummary(adapter),
    scenarios: results,
    aggregate: aggregateRuns(results.flatMap(({ runs }) => runs)),
  };
};

const laneResult = (lane, adapters, scenarios, options) => ({
  lane,
  engines: adapters.map((adapter) =>
    engineResult({
      adapter,
      lane,
      scenarios,
      ...options,
    })
  ),
});

const validateScenarios = (scenarios, lanes) => {
  if (scenarios.length === 0) throw new Error("Benchmark scenarios cannot be empty");
  unique("Benchmark scenario ids", scenarios.map(({ id }) => id));
  return scenarios.map((scenario) => {
    if (typeof scenario.id !== "string" || scenario.id.length === 0) {
      throw new Error("Benchmark scenario id must be a non-empty string");
    }
    seedValue(`${scenario.id} graphSeed`, scenario.graphSeed);
    if (lanes.includes("common")) {
      if (scenario.graphSnapshot === undefined) {
        throw new Error(`${scenario.id} is missing a common graph snapshot`);
      }
      finitePositive(`${scenario.id} shortestDistance`, scenario.shortestDistance);
    }
    return lanes.includes("common")
      ? Object.freeze({
        ...scenario,
        graphSnapshot: freezeGraphSnapshot(scenario.graphSnapshot),
      })
      : scenario;
  });
};

export const runHistoricalBenchmark = ({
  engines,
  scenarios,
  lanes = ["common", "native"],
  runSeeds,
  resources: resourceValues = DEFAULT_BENCHMARK_RESOURCES,
  windows: windowValues = DEFAULT_BENCHMARK_WINDOWS,
  dt = 0.25,
  provenance = {},
}) => {
  const adapters = engines.map(validateAdapter);
  if (adapters.length === 0) {
    throw new Error("Benchmark engine registry cannot be empty");
  }
  unique("Benchmark engine ids", adapters.map(({ id }) => id));
  const selectedLanes = unique("Benchmark lanes", [...lanes]);
  if (
    selectedLanes.length === 0 ||
    selectedLanes.some((lane) => lane !== "common" && lane !== "native")
  ) {
    throw new Error("Benchmark lanes must contain common, native, or both");
  }
  const resources = validateResources(resourceValues);
  const windows = validateWindows(windowValues);
  const step = finitePositive("dt", dt);
  const normalizedRunSeeds = runSeeds === undefined ? undefined : unique(
    "Benchmark run seeds",
    runSeeds.map((seed) => seedValue("Benchmark run seed", seed)),
  );
  const scenarioValues = validateScenarios(scenarios, selectedLanes);
  const options = { runSeeds: normalizedRunSeeds, resources, windows, dt: step };

  return {
    schema: "formic-historical-benchmark",
    version: HISTORICAL_BENCHMARK_VERSION,
    provenance: {
      ...provenance,
      measurement: "src/benchmark.js",
      engines: adapters.map(adapterSummary),
      resources,
      windows,
      dt: step,
      scenarioCount: scenarioValues.length,
      runSeeds: normalizedRunSeeds ?? null,
    },
    lanes: Object.fromEntries(
      selectedLanes.map((lane) => [
        lane,
        laneResult(lane, adapters, scenarioValues, options),
      ]),
    ),
  };
};
