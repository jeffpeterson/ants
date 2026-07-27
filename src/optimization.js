import {
  clamp,
  createSimulation,
  DEFAULTS,
  edgeKey,
  moveFood,
  nextRandom,
  sanitizeParams,
  stepSimulation,
} from "./colony.js";
import { ALGORITHM_KEYS } from "./config.js";

export const EVALUATION_VERSION = 3;

export const OPTIMIZED_KEYS = Object.freeze([
  "exploreRate",
  "stopExploreChance",
  "exploreSignalBias",
  "unchartedPreference",
  "trailJoinChance",
  "choiceFloor",
  "reversePenalty",
  "headingInfluence",
  "distanceInfluence",
  "fastInfluence",
  "outboundPolarity",
  "returnFastInfluence",
  "returnSlowInfluence",
  "returnFastPolarity",
  "returnSlowPolarity",
  "slowHalfLife",
  "fastHalfLife",
]);

export const EVALUATED_KEYS = Object.freeze([
  ...OPTIMIZED_KEYS,
  "homewardPreference",
  "foodTrailModel",
]);

export const PARAMETER_SPECS = Object.freeze([
  { key: "exploreRate", min: 0, max: 0.3, scale: "power", power: 2 },
  { key: "stopExploreChance", min: 0.01, max: 0.95, scale: "log" },
  { key: "exploreSignalBias", min: -4, max: 4, scale: "linear" },
  { key: "unchartedPreference", min: 0, max: 1, scale: "linear" },
  { key: "trailJoinChance", min: 0, max: 1, scale: "linear" },
  { key: "choiceFloor", min: 0, max: 1, scale: "power", power: 2 },
  { key: "reversePenalty", min: 0.01, max: 1, scale: "log" },
  { key: "headingInfluence", min: 0, max: 4, scale: "power", power: 2 },
  { key: "distanceInfluence", min: 0, max: 2, scale: "linear" },
  { key: "fastInfluence", min: 0, max: 10, scale: "power", power: 2 },
  { key: "outboundPolarity", min: -4, max: 4, scale: "linear" },
  { key: "returnFastInfluence", min: 0, max: 10, scale: "power", power: 2 },
  { key: "returnSlowInfluence", min: 0, max: 10, scale: "power", power: 2 },
  { key: "returnFastPolarity", min: -4, max: 4, scale: "linear" },
  { key: "returnSlowPolarity", min: -4, max: 4, scale: "linear" },
  { key: "slowHalfLife", min: 5, max: 86_400, scale: "log" },
  { key: "fastHalfLife", min: 2, max: 40, scale: "log" },
].map(Object.freeze));

export const HYPOTHESIS_PARAMS = Object.freeze({
  exploreRate: 0.03,
  stopExploreChance: 0.16,
  exploreSignalBias: -1.2,
  unchartedPreference: 1,
  trailJoinChance: 0.5,
  choiceFloor: 1,
  foodTrailModel: "node",
  reversePenalty: 0.15,
  headingInfluence: 1.2,
  distanceInfluence: 1.3,
  fastInfluence: 4,
  outboundPolarity: -1.5,
  returnFastInfluence: 0.5,
  returnSlowInfluence: 8,
  returnFastPolarity: 0,
  returnSlowPolarity: 4,
  slowHalfLife: 3_600,
  fastHalfLife: 8,
});

export const EVALUATION_RESOURCES = Object.freeze({
  antCount: 64,
  speed: 0.17,
});

export const EVALUATION_HORIZONS = Object.freeze({
  discoveryUnits: 8,
  staticUnits: 32,
  steadyStartUnits: 20,
  warmUnits: 24,
  preStartUnits: 16,
  adaptationUnits: 24,
  lateAdaptationUnits: 8,
  binUnits: 2,
});

const select = (values, keys) =>
  Object.fromEntries(keys.map((key) => [key, values[key]]));

export const algorithmParameters = (values = {}) =>
  select(sanitizeParams({ ...DEFAULTS, ...values }), EVALUATED_KEYS);

export const canonicalParameters = (values) =>
  JSON.stringify(algorithmParameters(values));

const decodeValue = (unit, spec) => {
  const normalized = clamp(0, 1, unit);
  if (spec.scale === "log") {
    return spec.min * Math.pow(spec.max / spec.min, normalized);
  }
  const amount = spec.scale === "power" ? Math.pow(normalized, spec.power) : normalized;
  return spec.min + (spec.max - spec.min) * amount;
};

const encodeValue = (value, spec) => {
  const bounded = clamp(spec.min, spec.max, value);
  if (spec.scale === "log") {
    return Math.log(bounded / spec.min) / Math.log(spec.max / spec.min);
  }
  const amount = (bounded - spec.min) / (spec.max - spec.min);
  return spec.scale === "power" ? Math.pow(amount, 1 / spec.power) : amount;
};

export const decodePoint = (point, fixed = {}) =>
  algorithmParameters(
    {
      ...Object.fromEntries(
        PARAMETER_SPECS.map((spec, index) => [
          spec.key,
          decodeValue(point[index] ?? 0.5, spec),
        ]),
      ),
      ...fixed,
    },
  );

export const encodeParameters = (values) => {
  const params = algorithmParameters(values);
  return PARAMETER_SPECS.map((spec) => encodeValue(params[spec.key], spec));
};

const randomSequence = (count, seed) =>
  Array.from({ length: count }).reduce(
    ({ values, rngSeed }) => {
      const [value, nextSeed] = nextRandom(rngSeed);
      return { values: [...values, value], rngSeed: nextSeed };
    },
    { values: [], rngSeed: seed },
  );

const shuffled = (values, seed) =>
  Array.from({ length: values.length }).reduce(
    ({ remaining, result, rngSeed }) => {
      const [random, nextSeed] = nextRandom(rngSeed);
      const index = Math.floor(random * remaining.length);
      return {
        remaining: remaining.filter((_, item) => item !== index),
        result: [...result, remaining[index]],
        rngSeed: nextSeed,
      };
    },
    { remaining: values, result: [], rngSeed: seed },
  );

export const randomDesign = (
  count,
  dimensions = PARAMETER_SPECS.length,
  seed = 1,
) => {
  const generated = randomSequence(count * dimensions, seed);
  return {
    points: Array.from(
      { length: count },
      (_, row) => generated.values.slice(row * dimensions, (row + 1) * dimensions),
    ),
    seed: generated.rngSeed,
  };
};

export const latinHypercube = (
  count,
  dimensions = PARAMETER_SPECS.length,
  seed = 1,
) => {
  const strata = Array.from({ length: count }, (_, index) => index);
  const generated = Array.from({ length: dimensions }).reduce(
    ({ columns, rngSeed }) => {
      const order = shuffled(strata, rngSeed);
      const jitters = randomSequence(count, order.rngSeed);
      return {
        columns: [
          ...columns,
          order.result.map((stratum, index) =>
            (stratum + jitters.values[index]) / count
          ),
        ],
        rngSeed: jitters.rngSeed,
      };
    },
    { columns: [], rngSeed: seed },
  );
  return {
    points: Array.from(
      { length: count },
      (_, row) => generated.columns.map((column) => column[row]),
    ),
    seed: generated.rngSeed,
  };
};

const uniqueCandidates = (candidates) =>
  candidates.reduce(
    ({ candidates: unique, seen }, candidate) => {
      const canonical = canonicalParameters(candidate.params);
      return seen.has(canonical) ? { candidates: unique, seen } : {
        candidates: [...unique, candidate],
        seen: new Set([...seen, canonical]),
      };
    },
    { candidates: [], seen: new Set() },
  ).candidates;

const namedCandidate = (id, params) => ({
  id,
  params: algorithmParameters(params),
  point: encodeParameters(params),
});

export const anchorCandidates = (fixed = {}) => {
  const defaults = algorithmParameters({ ...DEFAULTS, ...fixed });
  const zeroAnchors = PARAMETER_SPECS
    .filter(({ min, max }) => min <= 0 && max >= 0)
    .map(({ key }) => namedCandidate(`zero-${key}`, { ...defaults, [key]: 0 }));
  return uniqueCandidates([
    namedCandidate("defaults", defaults),
    namedCandidate("hypothesis", { ...HYPOTHESIS_PARAMS, ...fixed }),
    ...zeroAnchors,
  ]);
};

export const designCandidates = ({
  samples = 64,
  seed = 1,
  method = "lhs",
  fixed = {},
} = {}) => {
  const design = method === "random"
    ? randomDesign(samples, PARAMETER_SPECS.length, seed)
    : latinHypercube(samples, PARAMETER_SPECS.length, seed);
  const sampled = design.points.map((point, index) => ({
    id: `${method}-${String(index + 1).padStart(3, "0")}`,
    point,
    params: decodePoint(point, fixed),
  }));
  return {
    candidates: uniqueCandidates([...anchorCandidates(fixed), ...sampled]),
    seed: design.seed,
  };
};

const normalRandom = (seed) => {
  const first = nextRandom(seed);
  const second = nextRandom(first[1]);
  const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, first[0])));
  return {
    value: radius * Math.cos(2 * Math.PI * second[0]),
    seed: second[1],
  };
};

export const refineCandidates = (
  elites,
  {
    round = 0,
    perElite = 4,
    seed = 1,
    sigma = [0.15, 0.07][round] ?? 0.04,
    fixed = {},
  } = {},
) => {
  const generated = elites.reduce(
    ({ candidates, rngSeed }, elite, eliteIndex) =>
      Array.from({ length: perElite }).reduce(
        (result, _, childIndex) => {
          const point = elite.point.reduce(
            ({ values, seed: pointSeed }, value) => {
              const random = normalRandom(pointSeed);
              return {
                values: [...values, clamp(0, 1, value + random.value * sigma)],
                seed: random.seed,
              };
            },
            { values: [], seed: result.rngSeed },
          );
          return {
            candidates: [
              ...result.candidates,
              {
                id: `refine-${round + 1}-${eliteIndex + 1}-${childIndex + 1}`,
                point: point.values,
                params: decodePoint(point.values, fixed),
              },
            ],
            rngSeed: point.seed,
          };
        },
        { candidates, rngSeed },
      ),
    { candidates: [], rngSeed: seed },
  );
  return {
    candidates: uniqueCandidates(generated.candidates),
    seed: generated.rngSeed,
  };
};

const scenario = (id, seed, runSeed, nodeCount, density, mapVariation) =>
  Object.freeze({
    id,
    seed,
    runSeed,
    graph: Object.freeze({ nodeCount, density, mapVariation }),
  });

const trainingValues = [24, 64, 160].flatMap((nodeCount) =>
  [0.15, 0.55, 0.9].flatMap((mapVariation) =>
    [0.25, 0.65].map((density) => ({ nodeCount, mapVariation, density }))
  )
);

export const TRAINING_SCENARIOS = Object.freeze(
  trainingValues.map(
    ({ nodeCount, density, mapVariation }, index) =>
      scenario(
        `train-${String(index + 1).padStart(2, "0")}`,
        (1_001 + index * 7_919) >>> 0,
        (90_001 + index * 104_729) >>> 0,
        nodeCount,
        density,
        mapVariation,
      ),
  ),
);

export const SCREENING_SCENARIOS = Object.freeze(
  [0, 5, 7, 10, 14, 17].map((index) => TRAINING_SCENARIOS[index]),
);

const radicalInverse = (value, base, factor = 1, total = 0) =>
  value === 0 ? total : radicalInverse(
    Math.floor(value / base),
    base,
    factor / base,
    total + value % base * factor / base,
  );

export const VALIDATION_SCENARIOS = Object.freeze(
  Array.from({ length: 24 }, (_, index) => {
    const item = index + 1;
    return scenario(
      `validation-${String(item).padStart(2, "0")}`,
      (2_000_003 + index * 65_537) >>> 0,
      (3_000_017 + index * 32_771) >>> 0,
      Math.round(16 + radicalInverse(item, 2) * 240),
      0.1 + radicalInverse(item, 3) * 0.75,
      radicalInverse(item, 5),
    );
  }),
);

export const CONFIRMATION_SCENARIOS = Object.freeze(
  Array.from({ length: 24 }, (_, index) => {
    const item = index + 25;
    return scenario(
      `confirmation-${String(index + 1).padStart(2, "0")}`,
      (6_000_011 + index * 131_071) >>> 0,
      (7_000_013 + index * 52_489) >>> 0,
      Math.round(16 + radicalInverse(item, 2) * 240),
      0.1 + radicalInverse(item, 3) * 0.75,
      radicalInverse(item, 5),
    );
  }),
);

export const STRESS_SCENARIOS = Object.freeze([
  scenario("stress-minimal", 4_000_001, 5_000_011, 8, 0.05, 0),
  scenario("stress-dense", 4_000_003, 5_000_021, 300, 0.9, 0),
  scenario("stress-varied", 4_000_007, 5_000_033, 300, 0.05, 1),
  scenario("stress-maximum", 4_000_009, 5_000_047, 1_200, 0.9, 1),
]);

const shortestDistances = (graph, source) =>
  Array.from({ length: graph.nodes.length }).reduce(
    ({ distances, unvisited }) => {
      if (unvisited.length === 0) return { distances, unvisited };
      const current = unvisited.reduce((nearest, node) =>
        distances[node] < distances[nearest] ? node : nearest
      );
      const relaxed = graph.adjacency[current].reduce(
        (next, neighbor) => {
          if (!unvisited.includes(neighbor)) return next;
          const candidate = next[current] +
            graph.edgeById[edgeKey(current, neighbor)].length;
          return candidate < next[neighbor] ? { ...next, [neighbor]: candidate } : next;
        },
        distances,
      );
      return {
        distances: relaxed,
        unvisited: unvisited.filter((node) => node !== current),
      };
    },
    {
      distances: Object.fromEntries(
        graph.nodes.map(({ id }) => [
          id,
          id === source ? 0 : Number.POSITIVE_INFINITY,
        ]),
      ),
      unvisited: graph.nodes.map(({ id }) => id),
    },
  ).distances;

export const adaptationDestination = (graph) => {
  const source = graph.foods[0];
  const fromHill = shortestDistances(graph, graph.hill);
  const fromSource = shortestDistances(graph, source);
  const oldDistance = fromHill[source];
  const candidates = graph.nodes
    .map(({ id }) => id)
    .filter((id) => id !== graph.hill && id !== source);
  const comparable = (tolerance) =>
    candidates.filter((id) => Math.abs(fromHill[id] / oldDistance - 1) <= tolerance);
  const eligible = comparable(0.15).length > 0
    ? comparable(0.15)
    : comparable(0.4).length > 0
    ? comparable(0.4)
    : candidates;
  return eligible.toSorted((first, second) =>
    fromSource[second] - fromSource[first] || first - second
  )[0];
};

const emptyTrace = (simulation) => ({
  simulation,
  active: {},
  pickups: [],
  cycles: [],
  invalid: false,
});

const observeEvent = (trace, event, time) => {
  if (event.type === "discovery") {
    const pickup = {
      id: `${event.antId}:${trace.pickups.length}`,
      antId: event.antId,
      food: event.food,
      pickupAt: time,
      outboundDistance: event.distance,
    };
    return {
      ...trace,
      active: { ...trace.active, [event.antId]: pickup },
      pickups: [...trace.pickups, pickup],
    };
  }
  const pickup = trace.active[event.antId];
  if (event.type !== "delivery" || pickup === undefined) {
    return event.type === "delivery" ? { ...trace, invalid: true } : trace;
  }
  const { [event.antId]: _delivered, ...active } = trace.active;
  return {
    ...trace,
    active,
    cycles: [
      ...trace.cycles,
      {
        ...pickup,
        deliveredAt: time,
        totalDistance: event.distance,
      },
    ],
  };
};

const observeStep = (trace, simulation) =>
  simulation.lastEvents.reduce(
    (current, event) => observeEvent(current, event, simulation.elapsed),
    { ...trace, simulation },
  );

const runTrace = (trace, until, dt) => {
  const count = Math.max(
    0,
    Math.ceil((until - trace.simulation.elapsed) / dt - 1e-9),
  );
  return Array.from({ length: count }).reduce((current) => {
    const remaining = until - current.simulation.elapsed;
    if (remaining <= 1e-9) return current;
    const next = stepSimulation(current.simulation, Math.min(dt, remaining));
    return observeStep(current, next);
  }, trace);
};

const mean = (values) =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const normalizedLatency = (time, start, unit, deadlineUnits) => {
  if (!Number.isFinite(time)) return 0;
  const units = (time - start) / unit;
  return clamp(0, 1, (deadlineUnits - units) / (deadlineUnits - 1));
};

const completedWithin = (cycles, food, start, end) =>
  cycles.filter((cycle) =>
    cycle.food === food &&
    cycle.deliveredAt >= start &&
    cycle.deliveredAt <= end
  );

export const measureThroughput = (
  cycles,
  food,
  start,
  end,
  resources,
  distance,
) => {
  const seconds = end - start;
  const upperBound = resources.antCount * resources.speed / (2 * distance);
  const raw = seconds <= 0
    ? 0
    : completedWithin(cycles, food, start, end).length / seconds / upperBound;
  const boundaryAllowance = seconds <= 0
    ? 0
    : resources.antCount / seconds / upperBound;
  return {
    value: clamp(0, 1, raw),
    raw,
    maximum: 1 + boundaryAllowance,
  };
};

const cycleEfficiency = (cycles, distance) => {
  const ratios = cycles.map((cycle) => 2 * distance / cycle.totalDistance);
  return {
    value: clamp(0, 1, mean(ratios)),
    maximum: ratios.length === 0 ? 0 : Math.max(...ratios),
  };
};

const geometricMean = (weighted) =>
  weighted.some(({ value }) => value <= 0) ? 0 : Math.exp(
    weighted.reduce(
      (sum, { value, weight }) => sum + Math.log(value) * weight,
      0,
    ) / weighted.reduce((sum, { weight }) => sum + weight, 0),
  );

export const evaluateScenario = (
  values,
  scenarioValue,
  {
    dt = 0.25,
    resources = EVALUATION_RESOURCES,
    horizons = EVALUATION_HORIZONS,
  } = {},
) => {
  const params = {
    ...algorithmParameters(values),
    ...scenarioValue.graph,
    ...resources,
  };
  const initial = createSimulation({
    seed: scenarioValue.seed,
    runSeed: scenarioValue.runSeed,
    params,
  });
  const oldFood = initial.graph.foods[0];
  const oldDistance = initial.stats.shortestDistance;
  const oldUnit = oldDistance / resources.speed;
  const warmEnd = horizons.warmUnits * oldUnit;
  const staticEnd = horizons.staticUnits * oldUnit;
  const warm = runTrace(emptyTrace(initial), warmEnd, dt);
  const completed = runTrace(warm, staticEnd, dt);

  const destination = adaptationDestination(initial.graph);
  const distances = shortestDistances(initial.graph, initial.graph.hill);
  const newDistance = distances[destination];
  const newUnit = newDistance / resources.speed;
  const moved = {
    ...warm,
    simulation: moveFood(warm.simulation, oldFood, destination),
  };
  const adaptationEnd = warmEnd + horizons.adaptationUnits * newUnit;
  const adapted = runTrace(moved, adaptationEnd, dt);

  const firstPickup = completed.pickups.find(({ food }) => food === oldFood);
  const steadyStart = horizons.steadyStartUnits * oldUnit;
  const steadyCycles = completedWithin(
    completed.cycles,
    oldFood,
    steadyStart,
    staticEnd,
  );
  const staticThroughput = measureThroughput(
    completed.cycles,
    oldFood,
    steadyStart,
    staticEnd,
    resources,
    oldDistance,
  );
  const efficiency = cycleEfficiency(steadyCycles, oldDistance);
  const eligiblePickups = completed.pickups.filter((pickup) =>
    pickup.food === oldFood &&
    pickup.pickupAt <= staticEnd - horizons.discoveryUnits * oldUnit
  );
  const homed = eligiblePickups.filter((pickup) =>
    completed.cycles.some((cycle) =>
      cycle.id === pickup.id &&
      cycle.deliveredAt - pickup.pickupAt <= horizons.discoveryUnits * oldUnit
    )
  );

  const newPickups = adapted.pickups.filter((pickup) =>
    pickup.food === destination && pickup.pickupAt >= warmEnd
  );
  const newCycles = adapted.cycles.filter((cycle) =>
    cycle.food === destination && cycle.deliveredAt >= warmEnd
  );
  const binCount = Math.ceil(horizons.adaptationUnits / horizons.binUnits);
  const binThroughputs = Array.from({ length: binCount }, (_, index) => {
    const start = warmEnd + index * horizons.binUnits * newUnit;
    const end = Math.min(
      adaptationEnd,
      start + horizons.binUnits * newUnit,
    );
    return measureThroughput(
      adapted.cycles,
      destination,
      start,
      end,
      resources,
      newDistance,
    ).value;
  });
  const preThroughput = measureThroughput(
    warm.cycles,
    oldFood,
    horizons.preStartUnits * oldUnit,
    warmEnd,
    resources,
    oldDistance,
  );
  const lateThroughput = measureThroughput(
    adapted.cycles,
    destination,
    adaptationEnd - horizons.lateAdaptationUnits * newUnit,
    adaptationEnd,
    resources,
    newDistance,
  );
  const rediscovery = normalizedLatency(
    newPickups[0]?.pickupAt ?? Number.POSITIVE_INFINITY,
    warmEnd,
    newUnit,
    horizons.discoveryUnits,
  );
  const adaptationThroughput = mean(binThroughputs);
  const retention = clamp(
    0,
    1,
    lateThroughput.value / Math.max(0.1, preThroughput.value),
  );
  const adaptation = newCycles.length === 0 ? 0 : geometricMean([
    { value: rediscovery, weight: 0.3 },
    { value: adaptationThroughput, weight: 0.5 },
    { value: retention, weight: 0.2 },
  ]);
  const overdue = Object.values(adapted.active).filter((pickup) => {
    const unit = pickup.food === destination ? newUnit : oldUnit;
    return adaptationEnd - pickup.pickupAt > horizons.discoveryUnits * unit;
  });

  const metrics = {
    discovery: normalizedLatency(
      firstPickup?.pickupAt ?? Number.POSITIVE_INFINITY,
      0,
      oldUnit,
      horizons.discoveryUnits,
    ),
    throughput: staticThroughput.value,
    efficiency: efficiency.value,
    homing: eligiblePickups.length === 0 ? 0 : homed.length / eligiblePickups.length,
    adaptation,
  };
  const finite = Object.values(metrics).every(Number.isFinite);
  const invalid = completed.invalid || adapted.invalid || !finite ||
    staticThroughput.raw > staticThroughput.maximum + 0.001 ||
    preThroughput.raw > preThroughput.maximum + 0.001 ||
    lateThroughput.raw > lateThroughput.maximum + 0.001 ||
    efficiency.maximum > 1.001;

  return {
    id: scenarioValue.id,
    seed: scenarioValue.seed,
    runSeed: scenarioValue.runSeed,
    graph: scenarioValue.graph,
    dt,
    oldFood,
    newFood: destination,
    shortestDistance: oldDistance,
    newShortestDistance: newDistance,
    metrics,
    diagnostics: {
      firstPickupAt: firstPickup?.pickupAt ?? null,
      steadyDeliveries: steadyCycles.length,
      eligiblePickups: eligiblePickups.length,
      homed: homed.length,
      rediscoveryAt: newPickups[0]?.pickupAt ?? null,
      adaptedDeliveries: newCycles.length,
      adaptationThroughput,
      preThroughput: preThroughput.value,
      lateThroughput: lateThroughput.value,
      overdueCargo: overdue.length,
    },
    failures: {
      noPickup: firstPickup === undefined,
      noDelivery: completed.cycles.every(({ food }) => food !== oldFood),
      noAdaptDelivery: newCycles.length === 0,
      stranded: overdue.length > resources.antCount * 0.1,
      invalid,
    },
  };
};

const percentile = (values, fraction) => {
  if (values.length === 0) return 0;
  const sorted = values.toSorted((first, second) => first - second);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower);
};

const robust = (values) => 0.7 * mean(values) + 0.3 * percentile(values, 0.1);

export const aggregateEvaluation = (scenarios) => {
  const dimensions = Object.fromEntries(
    ["discovery", "throughput", "efficiency", "homing", "adaptation"].map(
      (key) => [key, robust(scenarios.map(({ metrics }) => metrics[key]))],
    ),
  );
  const failureRates = Object.fromEntries(
    ["noPickup", "noDelivery", "noAdaptDelivery", "stranded", "invalid"].map(
      (key) => [
        key,
        mean(scenarios.map(({ failures }) => Number(failures[key]))),
      ],
    ),
  );
  const base = geometricMean([
    { value: dimensions.discovery, weight: 0.15 },
    { value: dimensions.throughput, weight: 0.25 },
    { value: dimensions.efficiency, weight: 0.2 },
    { value: dimensions.homing, weight: 0.15 },
    { value: dimensions.adaptation, weight: 0.25 },
  ]);
  const penalty = Math.exp(
    -2 * failureRates.noPickup -
      3 * failureRates.noDelivery -
      3 * failureRates.noAdaptDelivery -
      2 * failureRates.stranded,
  ) * (failureRates.invalid > 0 ? 0 : 1);
  return {
    score: 100 * base * penalty,
    dimensions,
    failureRates,
  };
};

export const evaluateCandidate = (
  values,
  scenarios = SCREENING_SCENARIOS,
  options,
) => {
  const results = scenarios.map((item) => evaluateScenario(values, item, options));
  return {
    version: EVALUATION_VERSION,
    params: algorithmParameters(values),
    aggregate: aggregateEvaluation(results),
    scenarios: results,
  };
};

export const rankEvaluations = (evaluations) =>
  evaluations.toSorted((first, second) =>
    second.evaluation.aggregate.score - first.evaluation.aggregate.score ||
    first.candidate.id.localeCompare(second.candidate.id)
  );

export const assertOptimizationSchema = () =>
  OPTIMIZED_KEYS.every((key) =>
    PARAMETER_SPECS.some((spec) => spec.key === key) &&
    ALGORITHM_KEYS.includes(key)
  ) &&
  EVALUATED_KEYS.every((key) => ALGORITHM_KEYS.includes(key));
