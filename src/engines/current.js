export const DEFAULTS = Object.freeze({
  nodeCount: 24,
  density: 0.42,
  mapVariation: 0.72,
  antCount: 64,
  exploreRate: 0.007,
  stopExploreChance: 0.2,
  speed: 0.17,
  slowHalfLife: 3_600,
  fastHalfLife: 14.4,
  fastInfluence: 4.56,
  outboundPolarity: 0.78,
  returnFastInfluence: 0,
  returnSlowInfluence: 3.09,
  returnFastPolarity: 0,
  returnSlowPolarity: 4,
  homewardPreference: 1,
  exploreSignalBias: -2,
  unchartedPreference: 0.75,
  choiceFloor: 0,
  foodTrailModel: "node",
  headingInfluence: 1.58,
  fastDeposit: 0.72,
  distanceInfluence: 0.41,
  baseWeight: 0.06,
  reversePenalty: 0.045,
});

const UINT32_RANGE = 4_294_967_296;
const EPSILON = 1e-9;
const HOME_ATTENUATION = 2;
const ANT_LAUNCH_INTERVAL = 1 / 60;

export const clamp = (minimum, maximum, value) =>
  Math.min(maximum, Math.max(minimum, value));

const finiteOr = (fallback, value) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export const sanitizeParams = (values = {}) => ({
  ...DEFAULTS,
  ...values,
  nodeCount: Math.round(
    clamp(8, 1_200, finiteOr(DEFAULTS.nodeCount, values.nodeCount)),
  ),
  density: clamp(0.05, 0.9, finiteOr(DEFAULTS.density, values.density)),
  mapVariation: clamp(
    0,
    1,
    finiteOr(DEFAULTS.mapVariation, values.mapVariation),
  ),
  antCount: Math.round(clamp(8, 120, finiteOr(DEFAULTS.antCount, values.antCount))),
  exploreRate: clamp(
    0,
    0.3,
    finiteOr(DEFAULTS.exploreRate, values.exploreRate),
  ),
  stopExploreChance: clamp(
    0,
    0.95,
    finiteOr(DEFAULTS.stopExploreChance, values.stopExploreChance),
  ),
  speed: clamp(0.04, 0.65, finiteOr(DEFAULTS.speed, values.speed)),
  slowHalfLife: clamp(
    5,
    86_400,
    finiteOr(DEFAULTS.slowHalfLife, values.slowHalfLife),
  ),
  fastHalfLife: clamp(2, 40, finiteOr(DEFAULTS.fastHalfLife, values.fastHalfLife)),
  exploreSignalBias: clamp(
    -4,
    4,
    finiteOr(DEFAULTS.exploreSignalBias, values.exploreSignalBias),
  ),
  unchartedPreference: clamp(
    0,
    1,
    finiteOr(DEFAULTS.unchartedPreference, values.unchartedPreference),
  ),
  choiceFloor: clamp(
    0,
    1,
    finiteOr(DEFAULTS.choiceFloor, values.choiceFloor),
  ),
  foodTrailModel: values.foodTrailModel === "edge" ? "edge" : "node",
  headingInfluence: clamp(
    0,
    4,
    finiteOr(DEFAULTS.headingInfluence, values.headingInfluence),
  ),
  fastInfluence: clamp(0, 10, finiteOr(DEFAULTS.fastInfluence, values.fastInfluence)),
  outboundPolarity: clamp(
    -4,
    4,
    finiteOr(DEFAULTS.outboundPolarity, values.outboundPolarity),
  ),
  returnFastInfluence: clamp(
    0,
    10,
    finiteOr(DEFAULTS.returnFastInfluence, values.returnFastInfluence),
  ),
  returnSlowInfluence: clamp(
    0,
    10,
    finiteOr(DEFAULTS.returnSlowInfluence, values.returnSlowInfluence),
  ),
  returnFastPolarity: clamp(
    -4,
    4,
    finiteOr(DEFAULTS.returnFastPolarity, values.returnFastPolarity),
  ),
  returnSlowPolarity: clamp(
    -4,
    4,
    finiteOr(DEFAULTS.returnSlowPolarity, values.returnSlowPolarity),
  ),
  homewardPreference: clamp(
    0,
    1,
    finiteOr(DEFAULTS.homewardPreference, values.homewardPreference),
  ),
  distanceInfluence: clamp(
    0,
    2,
    finiteOr(DEFAULTS.distanceInfluence, values.distanceInfluence),
  ),
  reversePenalty: clamp(
    0.01,
    1,
    finiteOr(DEFAULTS.reversePenalty, values.reversePenalty),
  ),
});

export const nextRandom = (seed) => {
  const nextSeed = (Number(seed) + 0x6d2b79f5) >>> 0;
  let value = nextSeed;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return [((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE, nextSeed];
};

const randomPair = (seed) => {
  const [first, nextSeed] = nextRandom(seed);
  const [second, finalSeed] = nextRandom(nextSeed);
  return [[first, second], finalSeed];
};

const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

export const edgeKey = (first, second) =>
  first < second ? `${first}:${second}` : `${second}:${first}`;

const mix = (from, to, amount) => from + (to - from) * amount;

const wrap = (value) => ((value % 1) + 1) % 1;

const radicalInverse = (value, base, factor = 1, total = 0) =>
  value === 0 ? total : radicalInverse(
    Math.floor(value / base),
    base,
    factor / base,
    total + value % base * factor / base,
  );

const generateNodes = (count, variation, seed) => {
  const [[phaseX, phaseY], initialSeed] = randomPair(seed);
  const heat = variation * variation;
  const freedom = heat;
  const warpAmount = heat * 0.08;
  const anchors = Array.from(
    { length: 3 + Math.floor(phaseX * 4) },
    (_, index) => ({
      x: wrap(radicalInverse(index + 1, 2) + phaseX),
      y: wrap(radicalInverse(index + 1, 3) + phaseY),
    }),
  );
  return Array.from({ length: count }).reduce(
    ({ nodes, rngSeed }, _, id) => {
      const [[randomX, randomY], nextSeed] = randomPair(rngSeed);
      const evenX = wrap(radicalInverse(id + 1, 2) + phaseX);
      const evenY = wrap(radicalInverse(id + 1, 3) + phaseY);
      const looseX = mix(evenX, randomX, freedom);
      const looseY = mix(evenY, randomY, freedom);
      const anchor = anchors.reduce((closest, candidate) =>
        distance({ x: looseX, y: looseY }, candidate) <
            distance({ x: looseX, y: looseY }, closest)
          ? candidate
          : closest
      );
      const clusterPull = heat * variation * 0.38;
      const clusteredX = mix(looseX, anchor.x, clusterPull);
      const clusteredY = mix(looseY, anchor.y, clusterPull);
      const x = wrap(
        clusteredX +
          Math.sin((clusteredY * 1.7 + phaseX) * Math.PI * 2) * warpAmount,
      );
      const y = wrap(
        clusteredY +
          Math.sin((clusteredX * 1.3 + phaseY) * Math.PI * 2) * warpAmount,
      );
      return {
        nodes: [
          ...nodes,
          {
            id,
            x: 0.04 + x * 0.92,
            y: 0.04 + y * 0.92,
          },
        ],
        rngSeed: nextSeed,
      };
    },
    { nodes: [], rngSeed: initialSeed },
  );
};

const makeEdge = (nodes, first, second) => ({
  id: edgeKey(first, second),
  a: Math.min(first, second),
  b: Math.max(first, second),
  length: distance(nodes[first], nodes[second]),
});

const nearestPriorEdges = (nodes, count = 7) =>
  nodes.slice(1).map((node) =>
    nodes
      .slice(0, node.id)
      .map((candidate) => makeEdge(nodes, node.id, candidate.id))
      .toSorted((left, right) => left.length - right.length)
      .slice(0, count)
  );

const minimumSpanningTree = (nodes) =>
  Array.from({ length: nodes.length - 1 }).reduce(
    ({ edges, seen, best }) => {
      const target = nodes.reduce(
        (closest, node) =>
          seen.has(node.id) ||
            (closest !== null && best[closest].length <= best[node.id].length)
            ? closest
            : node.id,
        null,
      );
      const nextSeen = new Set([...seen, target]);
      return {
        edges: [...edges, best[target]],
        seen: nextSeen,
        best: best.map((edge, node) => {
          if (nextSeen.has(node)) return edge;
          const candidate = makeEdge(nodes, target, node);
          return candidate.length < edge.length ? candidate : edge;
        }),
      };
    },
    {
      edges: [],
      seen: new Set([0]),
      best: nodes.map((node) => node.id === 0 ? null : makeEdge(nodes, 0, node.id)),
    },
  ).edges;

const randomPriorEdges = (nodes, variation, seed) =>
  nodes.slice(2).reduce(
    ({ edges, rngSeed }, node) => {
      const [[chance, target], nextSeed] = randomPair(rngSeed);
      return {
        edges: chance < variation * variation * 0.5
          ? [...edges, makeEdge(nodes, node.id, Math.floor(target * node.id))]
          : edges,
        rngSeed: nextSeed,
      };
    },
    { edges: [], rngSeed: seed },
  );

const uniqueEdges = (edges) =>
  Object.values(Object.fromEntries(edges.map((edge) => [edge.id, edge])));

const scoreCandidates = (candidates, variation, seed) =>
  candidates.reduce(
    ({ scored, rngSeed }, edge) => {
      const [random, nextSeed] = nextRandom(rngSeed);
      const lengthBias = Math.pow(edge.length, 1 - variation * 0.82);
      const randomness = Math.exp((random - 0.5) * variation * 3.5);
      return {
        scored: [
          ...scored,
          { edge, score: lengthBias * randomness },
        ],
        rngSeed: nextSeed,
      };
    },
    { scored: [], rngSeed: seed },
  );

const buildAdjacency = (nodes, edges) =>
  edges.reduce(
    (adjacency, edge) => ({
      ...adjacency,
      [edge.a]: [...adjacency[edge.a], edge.b],
      [edge.b]: [...adjacency[edge.b], edge.a],
    }),
    Object.fromEntries(nodes.map((node) => [node.id, []])),
  );

const farthestFrom = (nodes, sourceId) =>
  nodes.reduce((farthest, node) =>
    distance(nodes[sourceId], node) > distance(nodes[sourceId], farthest)
      ? node
      : farthest
  ).id;

const farthestPair = (nodes) => {
  const first = farthestFrom(nodes, nodes[0].id);
  return { first, second: farthestFrom(nodes, first) };
};

export const generateGraph = (seed, values = {}) => {
  const params = sanitizeParams(values);
  const generated = generateNodes(
    params.nodeCount,
    params.mapVariation,
    seed,
  );
  const localGroups = nearestPriorEdges(generated.nodes);
  const required = minimumSpanningTree(generated.nodes);
  const requiredIds = new Set(required.map((edge) => edge.id));
  const random = randomPriorEdges(
    generated.nodes,
    params.mapVariation,
    generated.rngSeed,
  );
  const optional = uniqueEdges([
    ...localGroups.flat(),
    ...random.edges,
  ]).filter((edge) => !requiredIds.has(edge.id));
  const scored = scoreCandidates(
    optional,
    params.mapVariation,
    random.rngSeed,
  );
  const extraCount = Math.min(
    optional.length,
    Math.round(params.nodeCount * params.density * 1.6),
  );
  const extras = scored.scored
    .toSorted((first, second) => first.score - second.score)
    .slice(0, extraCount)
    .map(({ edge }) => edge);
  const edges = [...required, ...extras].toSorted((first, second) =>
    first.id.localeCompare(second.id)
  );
  const endpoints = farthestPair(generated.nodes);

  return [
    {
      nodes: generated.nodes,
      edges,
      adjacency: buildAdjacency(generated.nodes, edges),
      edgeById: Object.fromEntries(edges.map((edge) => [edge.id, edge])),
      hill: endpoints.first,
      foods: [endpoints.second],
    },
    scored.rngSeed,
  ];
};

export const isConnected = (graph) => {
  const visit = (frontier, seen) => {
    if (frontier.length === 0) return seen;
    const unseen = frontier.filter((node) => !seen.includes(node));
    const nextSeen = [...seen, ...unseen];
    const next = [
      ...new Set(
        unseen
          .flatMap((node) => graph.adjacency[node])
          .filter((node) => !nextSeen.includes(node)),
      ),
    ];
    return visit(next, nextSeen);
  };

  return visit([graph.nodes[0].id], []).length === graph.nodes.length;
};

export const shortestRoute = (
  graph,
  start = graph.hill,
  end = graph.foods[0],
) => {
  const nodeIds = graph.nodes.map(({ id }) => id);
  const initialDistances = Object.fromEntries(
    nodeIds.map((id) => [id, id === start ? 0 : Number.POSITIVE_INFINITY]),
  );

  const search = (unvisited, distances, previous) => {
    if (unvisited.length === 0) return { distances, previous };
    const current = unvisited.reduce((nearest, id) =>
      distances[id] < distances[nearest] ? id : nearest
    );
    if (current === end || !Number.isFinite(distances[current])) {
      return { distances, previous };
    }

    const relaxed = graph.adjacency[current].reduce(
      (result, neighbor) => {
        if (!unvisited.includes(neighbor)) return result;
        const candidate = result.distances[current] +
          graph.edgeById[edgeKey(current, neighbor)].length;
        return candidate < result.distances[neighbor]
          ? {
            distances: { ...result.distances, [neighbor]: candidate },
            previous: { ...result.previous, [neighbor]: current },
          }
          : result;
      },
      { distances, previous },
    );

    return search(
      unvisited.filter((id) => id !== current),
      relaxed.distances,
      relaxed.previous,
    );
  };

  const result = search(nodeIds, initialDistances, {});
  const reconstruct = (node, route) =>
    node === start
      ? [start, ...route]
      : reconstruct(result.previous[node], [node, ...route]);
  const route = reconstruct(end, []);
  return { route, distance: result.distances[end] };
};

export const shortestRouteToFood = (graph, start = graph.hill) =>
  graph.foods
    .map((food) => shortestRoute(graph, start, food))
    .reduce((shortest, route) => route.distance < shortest.distance ? route : shortest);

const emptyField = (graph) => Object.fromEntries(graph.nodes.map(({ id }) => [id, 0]));

const emptyEdgeField = (graph) =>
  Object.fromEntries(graph.edges.map(({ id }) => [id, 0]));

const emptyPheromones = (graph) => ({
  slow: { ...emptyField(graph), [graph.hill]: 1 },
  slowEdges: emptyEdgeField(graph),
  fast: emptyField(graph),
  fastEdges: emptyEdgeField(graph),
});

const graphParameters = (params) => ({
  nodeCount: params.nodeCount,
  density: params.density,
  mapVariation: params.mapVariation,
});

const makeAnt = (id, hill, launchDelay) => ({
  id,
  node: hill,
  edge: null,
  mode: "search",
  launchDelay,
  previous: null,
  tripDistance: 0,
  turnAround: null,
  searchState: { kind: "explore", frontierArmed: false },
  exploreChoices: 0,
  followChoices: 0,
  trips: 0,
});

const generateAnts = (count, hill, seed, startId = 0) => ({
  ants: Array.from(
    { length: count },
    (_, index) =>
      makeAnt(
        startId + index,
        hill,
        index * ANT_LAUNCH_INTERVAL,
      ),
  ),
  rngSeed: seed,
});

export const createSimulation = ({
  seed = 1837,
  graphSeed: suppliedGraphSeed,
  runSeed,
  params: values = {},
  hill,
  foods,
  graph: suppliedGraph,
  graphParams: suppliedGraphParams,
} = {}) => {
  const params = sanitizeParams(values);
  const graphSeed = Number(suppliedGraphSeed ?? seed) >>> 0;
  const [generatedGraph, graphRngSeed] = suppliedGraph === undefined
    ? generateGraph(graphSeed, params)
    : [suppliedGraph, (graphSeed ^ 0x9e3779b9) >>> 0];
  const savedHill = Object.hasOwn(generatedGraph.adjacency, hill) ? hill : null;
  const selectedHill = savedHill ?? generatedGraph.hill;
  const savedFoods = Array.isArray(foods)
    ? [...new Set(foods)].filter((food) =>
      Object.hasOwn(generatedGraph.adjacency, food) && food !== selectedHill
    )
    : [];
  const graph = suppliedGraph ?? {
    ...generatedGraph,
    hill: selectedHill,
    foods: savedFoods.length > 0 ? savedFoods : generatedGraph.foods,
  };
  const generatedAnts = generateAnts(
    params.antCount,
    graph.hill,
    Number.isFinite(Number(runSeed)) ? Number(runSeed) >>> 0 : graphRngSeed,
  );
  const optimum = shortestRouteToFood(graph);

  return {
    graphSeed,
    graphParams: suppliedGraphParams ?? graphParameters(params),
    rngSeed: generatedAnts.rngSeed,
    elapsed: 0,
    params,
    graph,
    pheromones: emptyPheromones(graph),
    ants: generatedAnts.ants,
    lastEvents: [],
    stats: {
      deliveries: 0,
      discoveries: 0,
      bestDistance: null,
      lastDistance: null,
      shortestDistance: optimum.distance,
      shortestRoute: optimum.route,
      foodChanges: 0,
      lastFoodChangeAt: null,
    },
  };
};

const decayField = (field, halfLife, dt) => {
  const factor = Math.pow(0.5, dt / halfLife);
  return Object.fromEntries(
    Object.entries(field).map(([node, value]) => {
      const decayed = value * factor;
      return [node, decayed < 1e-6 ? 0 : decayed];
    }),
  );
};

export const decayPheromones = (pheromones, params, dt) => ({
  slow: decayField(pheromones.slow, params.slowHalfLife, dt),
  slowEdges: decayField(pheromones.slowEdges ?? {}, params.slowHalfLife, dt),
  fast: decayField(pheromones.fast, params.fastHalfLife, dt),
  fastEdges: decayField(pheromones.fastEdges ?? {}, params.fastHalfLife, dt),
});

const anchorHill = (pheromones, hill) => ({
  ...pheromones,
  slow: { ...pheromones.slow, [hill]: 1 },
});

export const trailGradient = (field, edge) =>
  (field[edge.b] ?? 0) - (field[edge.a] ?? 0);

const normalizeChoices = (choices) => {
  const total = choices.reduce((sum, { weight }) => sum + weight, 0);
  return choices.map(({ node, weight }) => ({
    node,
    probability: weight / total,
  }));
};

const relativeGradient = (field, node, neighbor) => {
  const here = field[node] ?? 0;
  const there = field[neighbor] ?? 0;
  return (there - here) / Math.max(EPSILON, here + there);
};

const signalValue = (signal, node, neighbor) =>
  signal.edgeField
    ? signal.field[edgeKey(node, neighbor)] ?? 0
    : signal.field[neighbor] ?? 0;

const signalPolarity = (signal, node, neighbor) =>
  signal.edgeField ? 0 : relativeGradient(signal.field, node, neighbor);

const edgeCoverage = (pheromones, node, neighbor) =>
  pheromones.slowEdges?.[edgeKey(node, neighbor)] ?? 0;

const isUnwalked = (pheromones, node, neighbor) =>
  edgeCoverage(pheromones, node, neighbor) <= EPSILON;

const foodSignal = (pheromones, params, influence, polarity) =>
  params.foodTrailModel === "edge"
    ? {
      field: pheromones.fastEdges,
      edgeField: true,
      influence,
      polarity: 0,
    }
    : {
      field: pheromones.fast,
      edgeField: false,
      influence,
      polarity,
    };

const signalProbabilities = (
  node,
  neighbors,
  signals,
  params,
  previous,
  edgeLength,
  edgeBias = () => 1,
) => {
  const active = signals.filter(({ influence, polarity }) =>
    influence > EPSILON || Math.abs(polarity) > EPSILON
  );
  const signaled = neighbors.filter((neighbor) =>
    active.some((signal) => signalValue(signal, node, neighbor) > EPSILON)
  );
  if (signaled.length === 0) return [];
  return normalizeChoices(
    neighbors.map((neighbor) => {
      const marked = active.some((signal) =>
        signalValue(signal, node, neighbor) > EPSILON
      );
      const visibility = Math.pow(
        1 / edgeLength(neighbor),
        params.distanceInfluence,
      );
      const attraction = active.reduce(
        (sum, signal) => sum + signal.influence * signalValue(signal, node, neighbor),
        params.baseWeight,
      );
      const polarity = active.reduce(
        (sum, signal) =>
          sum + signal.polarity *
            signalPolarity(signal, node, neighbor),
        0,
      );
      const reversal = neighbor === previous ? params.reversePenalty : 1;
      return {
        node: neighbor,
        weight: attraction * Math.exp(polarity) * visibility *
          edgeBias(neighbor) * reversal * (marked ? 1 : params.choiceFloor),
      };
    }),
  );
};

export const choiceProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
  exploring = false,
  discouragedNode = null,
  edgeLength = () => 1,
  edgeBias = () => 1,
) => {
  if (!exploring) {
    return signalProbabilities(
      node,
      neighbors,
      [foodSignal(
        pheromones,
        params,
        params.fastInfluence,
        params.outboundPolarity,
      )],
      params,
      discouragedNode,
      edgeLength,
      edgeBias,
    );
  }

  const coverageAt = (neighbor) =>
    neighbor === discouragedNode ? 1 : edgeCoverage(pheromones, node, neighbor);
  const hasUncharted = neighbors.some((neighbor) => coverageAt(neighbor) <= EPSILON);
  return normalizeChoices(
    neighbors.map((neighbor) => ({
      node: neighbor,
      weight: Math.exp(
        params.exploreSignalBias *
          relativeGradient(pheromones.slow, node, neighbor),
      ) * (neighbor === discouragedNode ? params.reversePenalty : 1) *
        (
          hasUncharted && coverageAt(neighbor) > EPSILON
            ? 1 - params.unchartedPreference
            : 1
        ),
    })),
  );
};

const choose = (probabilities, random) =>
  probabilities.reduce(
    (result, option) => {
      if (result.chosen !== null) return result;
      const remaining = result.remaining - option.probability;
      return remaining <= 0
        ? { chosen: option.node, remaining }
        : { chosen: null, remaining };
    },
    { chosen: null, remaining: random },
  ).chosen ?? probabilities.at(-1).node;

const chooseWithSeed = (probabilities, seed) => {
  const [random, nextSeed] = nextRandom(seed);
  return [choose(probabilities, random), nextSeed];
};

const edgeLengthFrom = (graph, node) => (neighbor) =>
  graph.edgeById[edgeKey(node, neighbor)].length;

const headingBiasFrom = (graph, node, previous, influence) => {
  if (previous === null) return () => 1;
  const start = graph.nodes[previous];
  const center = graph.nodes[node];
  const incomingX = center.x - start.x;
  const incomingY = center.y - start.y;
  const incomingLength = Math.hypot(incomingX, incomingY);
  return (neighbor) => {
    const end = graph.nodes[neighbor];
    const outgoingX = end.x - center.x;
    const outgoingY = end.y - center.y;
    const outgoingLength = Math.hypot(outgoingX, outgoingY);
    const cosine = (
      incomingX * outgoingX + incomingY * outgoingY
    ) / (incomingLength * outgoingLength);
    return Math.exp(influence * cosine);
  };
};

export const attenuateHome = (level, length) =>
  level * Math.exp(-HOME_ATTENUATION * length);

const movementEdge = (ant, graph, to, extra = {}) => {
  const length = graph.edgeById[edgeKey(ant.node, to)].length;
  return {
    from: ant.node,
    to,
    progress: 0,
    length,
    ...extra,
  };
};

const foodwardProbabilities = (ant, graph, pheromones, params) =>
  choiceProbabilities(
    ant.node,
    graph.adjacency[ant.node],
    pheromones,
    params,
    false,
    ant.previous,
    edgeLengthFrom(graph, ant.node),
    headingBiasFrom(
      graph,
      ant.node,
      ant.previous,
      params.headingInfluence,
    ),
  );

const hasExplorationProgress = (ant, graph, pheromones) => {
  const here = pheromones.slow[ant.node] ?? 0;
  return graph.adjacency[ant.node].some((neighbor) =>
    neighbor !== ant.previous &&
    (
      isUnwalked(pheromones, ant.node, neighbor) ||
      (pheromones.slow[neighbor] ?? 0) < here - EPSILON
    )
  );
};

const escapeProbabilities = (ant, graph, pheromones, params) => {
  const neighbors = graph.adjacency[ant.node];
  const here = pheromones.slow[ant.node] ?? 0;
  const homeward = neighbors.filter((neighbor) =>
    (pheromones.slow[neighbor] ?? 0) > here + EPSILON
  );
  const options = homeward.length > 0
    ? homeward
    : neighbors.includes(ant.previous)
    ? [ant.previous]
    : neighbors;
  const edgeLength = edgeLengthFrom(graph, ant.node);
  return normalizeChoices(
    options.map((neighbor) => ({
      node: neighbor,
      weight: Math.max(EPSILON, pheromones.slow[neighbor] ?? 0) *
        Math.pow(1 / edgeLength(neighbor), params.distanceInfluence),
    })),
  );
};

const startEscapeEdge = (ant, graph, pheromones, params, seed) => {
  const [to, nextSeed] = chooseWithSeed(
    escapeProbabilities(ant, graph, pheromones, params),
    seed,
  );
  return [
    {
      ...ant,
      searchState: { kind: "escape" },
      edge: movementEdge(ant, graph, to, {
        escaping: true,
      }),
    },
    nextSeed,
  ];
};

export const homewardProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
  previous = null,
  edgeLength = () => 1,
  edgeBias = () => 1,
) => {
  const here = pheromones.slow[node] ?? 0;
  const hasHomeward = neighbors.some((neighbor) =>
    (pheromones.slow[neighbor] ?? 0) > here + EPSILON
  );
  const progressBias = (neighbor) =>
    hasHomeward && (pheromones.slow[neighbor] ?? 0) <= here + EPSILON
      ? 1 - params.homewardPreference
      : 1;
  return signalProbabilities(
    node,
    neighbors,
    [
      foodSignal(
        pheromones,
        params,
        params.returnFastInfluence,
        params.returnFastPolarity,
      ),
      {
        field: pheromones.slow,
        edgeField: false,
        influence: params.returnSlowInfluence,
        polarity: params.returnSlowPolarity,
      },
    ],
    params,
    previous,
    edgeLength,
    (neighbor) => edgeBias(neighbor) * progressBias(neighbor),
  );
};

const startSearchEdge = (ant, graph, pheromones, params, seed) => {
  if (ant.searchState.kind === "escape") {
    return startEscapeEdge(ant, graph, pheromones, params, seed);
  }
  const foodward = foodwardProbabilities(ant, graph, pheromones, params);
  const [exploreDraw, choiceSeed] = nextRandom(seed);
  const hasFoodward = foodward.length > 0;
  const continuing = ant.searchState.kind === "explore";
  const starting = !continuing && (!hasFoodward || exploreDraw < params.exploreRate);
  const exploring = continuing || starting;
  const probabilities = exploring
    ? choiceProbabilities(
      ant.node,
      graph.adjacency[ant.node],
      pheromones,
      params,
      true,
      ant.previous,
    )
    : foodward;
  const [to, nextSeed] = chooseWithSeed(probabilities, choiceSeed);
  const edge = movementEdge(ant, graph, to, { exploring });
  const frontierArmed = continuing && ant.searchState.frontierArmed === true;
  const searchState = exploring
    ? {
      kind: "explore",
      frontierArmed: frontierArmed ||
        isUnwalked(pheromones, ant.node, to),
    }
    : { kind: "follow" };
  return [
    {
      ...ant,
      searchState,
      exploreChoices: ant.exploreChoices + Number(exploring),
      followChoices: ant.followChoices + Number(!exploring),
      edge,
    },
    nextSeed,
  ];
};

const startReturnEdge = (ant, graph, pheromones, params, seed) => {
  if (ant.turnAround !== null) {
    return [
      {
        ...ant,
        turnAround: null,
        edge: movementEdge(ant, graph, ant.turnAround, {
          returnTrail: "turn",
        }),
      },
      seed,
    ];
  }
  const signaled = homewardProbabilities(
    ant.node,
    graph.adjacency[ant.node],
    pheromones,
    params,
    ant.previous,
    edgeLengthFrom(graph, ant.node),
    headingBiasFrom(
      graph,
      ant.node,
      ant.previous,
      params.headingInfluence,
    ),
  );
  const probabilities = signaled.length > 0 ? signaled : choiceProbabilities(
    ant.node,
    graph.adjacency[ant.node],
    pheromones,
    params,
    true,
    ant.previous,
  );
  const [to, nextSeed] = chooseWithSeed(probabilities, seed);
  return [
    {
      ...ant,
      edge: movementEdge(ant, graph, to, {
        returnTrail: signaled.length > 0 ? "signal" : "random",
      }),
    },
    nextSeed,
  ];
};

const startEdge = (ant, graph, pheromones, params, seed) =>
  ant.mode === "return"
    ? startReturnEdge(ant, graph, pheromones, params, seed)
    : startSearchEdge(ant, graph, pheromones, params, seed);

const beginReturn = (ant) => {
  return {
    ant: {
      ...ant,
      edge: null,
      mode: "return",
      searchState: { kind: "follow" },
      turnAround: ant.previous,
      previous: null,
    },
    events: [{
      type: "discovery",
      antId: ant.id,
      distance: ant.tripDistance,
      food: ant.node,
    }],
    deposits: [],
  };
};

const arriveSearching = (ant, graph) => {
  const atHill = ant.edge.to === graph.hill;
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    previous: atHill ? null : ant.edge.from,
    tripDistance: atHill ? 0 : ant.tripDistance + ant.edge.length,
    searchState: atHill ? { kind: "follow" } : ant.searchState,
  };
  return graph.foods.includes(ant.edge.to)
    ? beginReturn(arrived)
    : { ant: arrived, events: [], deposits: [] };
};

const arriveReturning = (ant, graph) => {
  const atHill = ant.edge.to === graph.hill;
  const tripDistance = ant.tripDistance + ant.edge.length;
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    previous: ant.edge.from,
    tripDistance,
  };

  return atHill
    ? {
      ant: {
        ...arrived,
        mode: "search",
        previous: null,
        searchState: { kind: "follow" },
        tripDistance: 0,
        turnAround: null,
        trips: ant.trips + 1,
      },
      events: [{
        type: "delivery",
        antId: ant.id,
        distance: tripDistance,
      }],
      deposits: [],
    }
    : { ant: arrived, events: [], deposits: [] };
};

const arrive = (ant, graph, pheromones, params) => {
  const returning = ant.mode === "return";
  const source = pheromones.slow[ant.edge.from] ?? 0;
  const mapping = !returning && ant.searchState.kind !== "escape";
  const slowDeposits = mapping
    ? [
      {
        channel: "slow",
        target: ant.edge.to,
        amount: attenuateHome(source, ant.edge.length),
        combine: "max",
      },
    ]
    : [];
  const result = returning ? arriveReturning(ant, graph) : arriveSearching(ant, graph);
  const foundFood = !returning && graph.foods.includes(ant.edge.to);
  const homeward = returning &&
    (pheromones.slow[ant.edge.to] ?? 0) >
      (pheromones.slow[ant.edge.from] ?? 0) + EPSILON;
  const fastDeposits = homeward || foundFood
    ? [
      {
        channel: "fast",
        target: ant.edge.to,
        amount: params.fastDeposit,
        combine: "add",
      },
      {
        channel: "fastEdges",
        target: edgeKey(ant.edge.from, ant.edge.to),
        amount: params.fastDeposit,
        combine: "add",
      },
    ]
    : [];
  return {
    ...result,
    deposits: [...slowDeposits, ...fastDeposits, ...result.deposits],
  };
};

const edgeEntryDeposits = (ant) =>
  ant.edge !== null &&
    ant.mode === "search" &&
    ant.searchState.kind !== "escape"
    ? [{
      channel: "slowEdges",
      target: edgeKey(ant.edge.from, ant.edge.to),
      amount: 1,
      combine: "max",
    }]
    : [];

const advanceAnt = (
  ant,
  graph,
  pheromones,
  params,
  seed,
  dt,
  crossings = 0,
) => {
  if (dt <= EPSILON || crossings >= 8) {
    return { ant, seed, deposits: [], events: [] };
  }
  if (ant.launchDelay > EPSILON) {
    const waiting = Math.min(dt, ant.launchDelay);
    const ready = {
      ...ant,
      launchDelay: Math.max(0, ant.launchDelay - waiting),
    };
    return dt - waiting <= EPSILON
      ? { ant: ready, seed, deposits: [], events: [] }
      : advanceAnt(
        ready,
        graph,
        pheromones,
        params,
        seed,
        dt - waiting,
        crossings,
      );
  }

  const discovered = ant.mode === "search" && ant.edge === null &&
      graph.foods.includes(ant.node)
    ? beginReturn(ant)
    : null;
  if (discovered) {
    const continued = advanceAnt(
      discovered.ant,
      graph,
      pheromones,
      params,
      seed,
      dt,
      crossings,
    );
    return {
      ant: continued.ant,
      seed: continued.seed,
      deposits: continued.deposits,
      events: [...discovered.events, ...continued.events],
    };
  }

  const starting = ant.edge === null;
  const [movingAnt, nextSeed] = ant.edge
    ? [ant, seed]
    : startEdge(ant, graph, pheromones, params, seed);
  if (movingAnt.edge === null) {
    return {
      ant: movingAnt,
      seed: nextSeed,
      deposits: [],
      events: [],
    };
  }
  const entryDeposits = starting ? edgeEntryDeposits(movingAnt) : [];
  const distanceRemaining = movingAnt.edge.length * (1 - movingAnt.edge.progress);
  const travelDistance = params.speed * dt;

  if (travelDistance + EPSILON < distanceRemaining) {
    return {
      ant: {
        ...movingAnt,
        edge: {
          ...movingAnt.edge,
          progress: movingAnt.edge.progress + travelDistance / movingAnt.edge.length,
        },
      },
      seed: nextSeed,
      deposits: entryDeposits,
      events: [],
    };
  }

  const secondsUsed = distanceRemaining / params.speed;
  const arrival = arrive(movingAnt, graph, pheromones, params);
  const continued = advanceAnt(
    arrival.ant,
    graph,
    pheromones,
    params,
    nextSeed,
    Math.max(0, dt - secondsUsed),
    crossings + 1,
  );
  return {
    ant: continued.ant,
    seed: continued.seed,
    deposits: [
      ...entryDeposits,
      ...arrival.deposits,
      ...continued.deposits,
    ],
    events: [...arrival.events, ...continued.events],
  };
};

const applyDeposits = (pheromones, deposits) => {
  deposits.forEach((deposit) => {
    const field = pheromones[deposit.channel];
    field[deposit.target] = deposit.combine === "max"
      ? Math.max(field[deposit.target], deposit.amount)
      : field[deposit.target] + deposit.amount;
  });
  return pheromones;
};

const updateStats = (stats, events) =>
  events.reduce((next, event) => {
    if (event.type === "delivery") {
      return { ...next, deliveries: next.deliveries + 1 };
    }
    const isBest = next.bestDistance === null || event.distance < next.bestDistance;
    return {
      ...next,
      discoveries: next.discoveries + 1,
      lastDistance: event.distance,
      bestDistance: isBest ? event.distance : next.bestDistance,
    };
  }, stats);

export const explorationStopProbability = (chancePerSecond, seconds) =>
  1 - Math.pow(1 - chancePerSecond, seconds);

const maybeStopExploring = (ant, graph, pheromones, params, seed, dt) => {
  if (ant.mode !== "search" || ant.searchState.kind !== "explore") {
    return { ant, seed };
  }
  if (ant.searchState.frontierArmed !== true) {
    return { ant, seed };
  }
  if (hasExplorationProgress(ant, graph, pheromones)) {
    return { ant, seed };
  }
  const [random, nextSeed] = nextRandom(seed);
  const chance = explorationStopProbability(params.stopExploreChance, dt);
  return {
    ant: random < chance ? { ...ant, searchState: { kind: "escape" } } : ant,
    seed: nextSeed,
  };
};

export const stepSimulation = (state, seconds) => {
  const dt = clamp(0, 0.25, finiteOr(0, seconds));
  if (dt === 0) return state;
  const decayed = anchorHill(
    decayPheromones(state.pheromones, state.params, dt),
    state.graph.hill,
  );
  const workingPheromones = decayed;
  const advanced = state.ants
    .toSorted((first, second) => first.id - second.id)
    .reduce(
      (result, ant) => {
        const ready = maybeStopExploring(
          ant,
          state.graph,
          decayed,
          state.params,
          result.rngSeed,
          dt,
        );
        const next = advanceAnt(
          ready.ant,
          state.graph,
          decayed,
          state.params,
          ready.seed,
          dt,
        );
        applyDeposits(workingPheromones, next.deposits);
        return {
          ants: [...result.ants, next.ant],
          rngSeed: next.seed,
          events: [...result.events, ...next.events],
        };
      },
      { ants: [], rngSeed: state.rngSeed, events: [] },
    );

  return {
    ...state,
    rngSeed: advanced.rngSeed,
    elapsed: state.elapsed + dt,
    pheromones: workingPheromones,
    ants: advanced.ants,
    lastEvents: advanced.events,
    stats: updateStats(state.stats, advanced.events),
  };
};

export const updateParams = (state, patch) => {
  const params = sanitizeParams({ ...state.params, ...patch });
  const difference = params.antCount - state.ants.length;
  const generated = difference > 0
    ? generateAnts(
      difference,
      state.graph.hill,
      state.rngSeed,
      state.ants.length,
    )
    : { ants: [], rngSeed: state.rngSeed };
  return {
    ...state,
    params,
    rngSeed: generated.rngSeed,
    ants: difference === 0
      ? state.ants
      : difference < 0
      ? state.ants.slice(0, params.antCount)
      : [...state.ants, ...generated.ants],
  };
};

export const resetRun = (state) => {
  const seed = (state.graphSeed ^ 0x9e3779b9) >>> 0;
  const generated = generateAnts(
    state.params.antCount,
    state.graph.hill,
    seed,
  );
  return {
    ...state,
    rngSeed: generated.rngSeed,
    elapsed: 0,
    pheromones: emptyPheromones(state.graph),
    ants: generated.ants,
    lastEvents: [],
    stats: {
      ...state.stats,
      deliveries: 0,
      discoveries: 0,
      bestDistance: null,
      lastDistance: null,
      foodChanges: 0,
      lastFoodChangeAt: null,
    },
  };
};

export const clearPheromones = (state) => ({
  ...state,
  pheromones: emptyPheromones(state.graph),
});

const hasNode = (graph, nodeId) => Object.hasOwn(graph.adjacency, nodeId);

const sameNodes = (first, second) =>
  first.length === second.length &&
  first.every((node, index) => node === second[index]);

const withFoodSources = (state, foods) => {
  const uniqueFoods = [...new Set(foods)];
  const validFoods = uniqueFoods.filter((node) =>
    hasNode(state.graph, node) && node !== state.graph.hill
  );
  if (validFoods.length === 0 || sameNodes(validFoods, state.graph.foods)) {
    return state;
  }

  const graph = { ...state.graph, foods: validFoods };
  const optimum = shortestRouteToFood(graph);
  return {
    ...state,
    graph,
    stats: {
      ...state.stats,
      bestDistance: null,
      lastDistance: null,
      shortestDistance: optimum.distance,
      shortestRoute: optimum.route,
      foodChanges: state.stats.foodChanges + 1,
      lastFoodChangeAt: state.elapsed,
    },
  };
};

export const moveFood = (state, sourceId, destinationId) =>
  state.graph.foods.includes(sourceId) &&
    !state.graph.foods.includes(destinationId) &&
    destinationId !== state.graph.hill &&
    hasNode(state.graph, destinationId)
    ? withFoodSources(
      state,
      state.graph.foods.map((food) => food === sourceId ? destinationId : food),
    )
    : state;

export const addFood = (state, nodeId) =>
  state.graph.foods.includes(nodeId) || nodeId === state.graph.hill ||
    !hasNode(state.graph, nodeId)
    ? state
    : withFoodSources(state, [...state.graph.foods, nodeId]);

export const removeFood = (state, nodeId) =>
  state.graph.foods.length <= 1 || !state.graph.foods.includes(nodeId)
    ? state
    : withFoodSources(
      state,
      state.graph.foods.filter((food) => food !== nodeId),
    );

export const setEndpoint = (state, kind, nodeId) => {
  if (kind === "food") {
    return moveFood(state, state.graph.foods[0], nodeId);
  }
  if (
    kind !== "hill" ||
    !hasNode(state.graph, nodeId) ||
    state.graph.foods.includes(nodeId)
  ) {
    return state;
  }
  const graph = { ...state.graph, [kind]: nodeId };
  const optimum = shortestRouteToFood(graph);
  return resetRun({
    ...state,
    graph,
    stats: {
      ...state.stats,
      shortestDistance: optimum.distance,
      shortestRoute: optimum.route,
    },
  });
};

const foodLevelForMove = (state, node, neighbor) =>
  state.params.foodTrailModel === "edge"
    ? state.pheromones.fastEdges[edgeKey(node, neighbor)] ?? 0
    : state.pheromones.fast[neighbor] ?? 0;

const activeFoodValues = (state) =>
  Object.values(
    state.params.foodTrailModel === "edge"
      ? state.pheromones.fastEdges
      : state.pheromones.fast,
  );

const routeFoodSignal = (state, route) =>
  state.params.foodTrailModel === "edge"
    ? route.slice(1).reduce(
      (sum, node, index) =>
        sum + state.pheromones.fastEdges[edgeKey(route[index], node)],
      0,
    )
    : route.reduce(
      (sum, node) => sum + state.pheromones.fast[node],
      0,
    );

export const deriveMetrics = (state) => {
  const fastValues = activeFoodValues(state);
  const totalFast = fastValues.reduce((sum, value) => sum + value, 0);
  const selected = dominantFoodRoute(state);
  const selectedSignal = selected ? routeFoodSignal(state, selected.route) : 0;
  const signalFocus = totalFast <= EPSILON ? 0 : selectedSignal / totalFast;
  const efficiency = selected ? state.stats.shortestDistance / selected.distance : 0;

  return {
    deliveries: state.stats.deliveries,
    discoveries: state.stats.discoveries,
    bestDistance: state.stats.bestDistance,
    shortestDistance: state.stats.shortestDistance,
    selectedDistance: selected?.distance ?? null,
    selectedHops: Math.max(0, (selected?.route.length ?? 1) - 1),
    efficiency: clamp(0, 1, efficiency),
    signalFocus: clamp(0, 1, signalFocus),
    returning: state.ants.filter((ant) => ant.mode === "return").length,
    foods: state.graph.foods.length,
    exploring: state.ants.filter(
      (ant) =>
        ant.mode === "search" &&
        (
          ["escape", "explore"].includes(ant.searchState.kind) ||
          ant.edge?.exploring === true
        ),
    ).length,
  };
};

export const dominantFoodRoute = (state) => {
  if (activeFoodValues(state).every((value) => value <= EPSILON)) {
    return null;
  }
  const visit = (node, route, routeDistance, seen) => {
    if (state.graph.foods.includes(node)) {
      return { found: { route, distance: routeDistance }, seen };
    }
    const options = state.graph.adjacency[node]
      .filter((neighbor) =>
        !seen.includes(neighbor) &&
        foodLevelForMove(state, node, neighbor) > EPSILON
      )
      .map((neighbor) => {
        const edge = state.graph.edgeById[edgeKey(node, neighbor)];
        return {
          node: neighbor,
          edge,
          score: foodLevelForMove(state, node, neighbor) / edge.length,
        };
      })
      .toSorted((first, second) => second.score - first.score);
    const tryNext = (remaining, visited) => {
      if (remaining.length === 0) return { found: null, seen: visited };
      const [option, ...rest] = remaining;
      const result = visit(
        option.node,
        [...route, option.node],
        routeDistance + option.edge.length,
        [...visited, option.node],
      );
      return result.found ? result : tryNext(rest, result.seen);
    };
    return tryNext(options, seen);
  };
  return visit(
    state.graph.hill,
    [state.graph.hill],
    0,
    [state.graph.hill],
  ).found;
};

export const foodProbabilitiesForNode = (state, nodeId) => {
  const neighbors = state.graph.adjacency[nodeId] ?? [];
  return choiceProbabilities(
    nodeId,
    neighbors,
    state.pheromones,
    state.params,
    false,
    null,
    (neighbor) => state.graph.edgeById[edgeKey(nodeId, neighbor)].length,
  ).toSorted((first, second) => second.probability - first.probability);
};
