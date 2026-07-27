export const DEFAULTS = Object.freeze({
  nodeCount: 24,
  density: 0.42,
  antCount: 64,
  exploreRate: 0.1,
  speed: 0.17,
  slowHalfLife: 42,
  fastHalfLife: 9,
  slowAvoidance: 0.5,
  fastInfluence: 3.2,
  slowDeposit: 0.045,
  fastDeposit: 0.72,
  slowExponent: 1.15,
  distanceInfluence: 0.5,
  baseWeight: 0.06,
  reversePenalty: 0.18,
  foodGradientFloor: 0.3,
});

const UINT32_RANGE = 4_294_967_296;
const EPSILON = 1e-9;
const EXPLORE_BURST_EDGES = 1;
const DISCOVERY_MIN_EDGES = 24;
const DISCOVERY_MEAN_EXTRA_EDGES = 32;
const DISCOVERY_MAX_EDGES = 160;

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
  antCount: Math.round(clamp(8, 120, finiteOr(DEFAULTS.antCount, values.antCount))),
  exploreRate: clamp(
    0,
    0.3,
    finiteOr(DEFAULTS.exploreRate, values.exploreRate),
  ),
  speed: clamp(0.04, 0.65, finiteOr(DEFAULTS.speed, values.speed)),
  slowHalfLife: clamp(5, 120, finiteOr(DEFAULTS.slowHalfLife, values.slowHalfLife)),
  fastHalfLife: clamp(2, 40, finiteOr(DEFAULTS.fastHalfLife, values.fastHalfLife)),
  slowAvoidance: clamp(
    0,
    8,
    finiteOr(DEFAULTS.slowAvoidance, values.slowAvoidance),
  ),
  fastInfluence: clamp(0, 10, finiteOr(DEFAULTS.fastInfluence, values.fastInfluence)),
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

export const arcKey = (from, to) => `${from}>${to}`;

const gridShape = (count) => {
  const columns = Math.ceil(Math.sqrt(count * 1.08));
  return { columns, rows: Math.ceil(count / columns) };
};

const generateNodes = (count, seed) => {
  const shape = gridShape(count);
  const generated = Array.from({ length: count }).reduce(
    ({ nodes, rngSeed }) => {
      const id = nodes.length;
      const column = id % shape.columns;
      const row = Math.floor(id / shape.columns);
      const [[jitterX, jitterY], nextSeed] = randomPair(rngSeed);
      const node = {
        id,
        x: 0.055 + ((column + 0.14 + jitterX * 0.72) / shape.columns) * 0.89,
        y: 0.07 + ((row + 0.14 + jitterY * 0.72) / shape.rows) * 0.86,
      };
      return { nodes: [...nodes, node], rngSeed: nextSeed };
    },
    { nodes: [], rngSeed: seed >>> 0 },
  );
  return { ...generated, ...shape };
};

const makeEdge = (nodes, first, second) => ({
  id: edgeKey(first, second),
  a: Math.min(first, second),
  b: Math.max(first, second),
  length: distance(nodes[first], nodes[second]),
});

const LOCAL_OFFSETS = Object.freeze([
  [-1, 0],
  [0, -1],
  [-1, -1],
  [1, -1],
  [-2, 0],
  [0, -2],
]);

const GRID_OFFSETS = Object.freeze([
  [-1, 0],
  [0, -1],
]);

const edgesForOffsets = (nodes, columns, offsets) => {
  const rows = Math.ceil(nodes.length / columns);
  return nodes.flatMap((node) => {
    const column = node.id % columns;
    const row = Math.floor(node.id / columns);
    return offsets.flatMap(([columnOffset, rowOffset]) => {
      const otherColumn = column + columnOffset;
      const otherRow = row + rowOffset;
      const otherId = otherRow * columns + otherColumn;
      const valid = otherColumn >= 0 && otherColumn < columns &&
        otherRow >= 0 && otherRow < rows &&
        otherId >= 0 && otherId < nodes.length;
      return valid ? [makeEdge(nodes, node.id, otherId)] : [];
    });
  });
};

const localEdges = (nodes, columns) => edgesForOffsets(nodes, columns, LOCAL_OFFSETS);

const gridBackbone = (nodes, columns) => edgesForOffsets(nodes, columns, GRID_OFFSETS);

const scoreCandidates = (candidates, seed) =>
  candidates.reduce(
    ({ scored, rngSeed }, edge) => {
      const [random, nextSeed] = nextRandom(rngSeed);
      return {
        scored: [
          ...scored,
          { edge, score: edge.length * (0.78 + random * 0.62) },
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
  const generated = generateNodes(params.nodeCount, seed);
  const tree = gridBackbone(generated.nodes, generated.columns);
  const treeIds = new Set(tree.map((edge) => edge.id));
  const optional = localEdges(generated.nodes, generated.columns)
    .filter((edge) => !treeIds.has(edge.id));
  const scored = scoreCandidates(optional, generated.rngSeed);
  const extraCount = Math.min(
    optional.length,
    Math.round(params.nodeCount * params.density * 0.9),
  );
  const extras = scored.scored
    .toSorted((first, second) => first.score - second.score)
    .slice(0, extraCount)
    .map(({ edge }) => edge);
  const edges = [...tree, ...extras].toSorted((first, second) =>
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

const routeLength = (graph, route) =>
  route.slice(1).reduce(
    (total, node, index) => total + graph.edgeById[edgeKey(route[index], node)].length,
    0,
  );

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

const emptyPheromones = (graph) => ({
  slow: Object.fromEntries(
    graph.edges.flatMap((edge) => [
      [arcKey(edge.a, edge.b), 0],
      [arcKey(edge.b, edge.a), 0],
    ]),
  ),
  fast: Object.fromEntries(
    graph.edges.flatMap((edge) => [
      [arcKey(edge.a, edge.b), 0],
      [arcKey(edge.b, edge.a), 0],
    ]),
  ),
});

const makeAnt = (id, hill) => ({
  id,
  node: hill,
  edge: null,
  mode: "search",
  route: [hill],
  returnIndex: null,
  tripDistance: 0,
  searchState: { kind: "unassigned" },
  exploreChoices: 0,
  followChoices: 0,
  trips: 0,
});

const generateAnts = (count, hill, seed, startId = 0) => ({
  ants: Array.from({ length: count }, (_, index) => makeAnt(startId + index, hill)),
  rngSeed: seed,
});

export const createSimulation = ({ seed = 1837, params: values = {} } = {}) => {
  const params = sanitizeParams(values);
  const graphSeed = Number(seed) >>> 0;
  const [graph, graphRngSeed] = generateGraph(graphSeed, params);
  const generatedAnts = generateAnts(
    params.antCount,
    graph.hill,
    graphRngSeed,
  );
  const optimum = shortestRouteToFood(graph);

  return {
    graphSeed,
    rngSeed: generatedAnts.rngSeed,
    elapsed: 0,
    params,
    graph,
    pheromones: emptyPheromones(graph),
    ants: generatedAnts.ants,
    stats: {
      deliveries: 0,
      discoveries: 0,
      bestDistance: null,
      bestRoute: [],
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
    Object.entries(field).map(([key, value]) => [
      key,
      value * factor < 1e-6 ? 0 : value * factor,
    ]),
  );
};

export const decayPheromones = (pheromones, params, dt) => ({
  slow: decayField(pheromones.slow, params.slowHalfLife, dt),
  fast: decayField(pheromones.fast, params.fastHalfLife, dt),
});

const previousNode = (ant) => ant.route.length > 1 ? ant.route.at(-2) : null;

const eligibleNeighbors = (ant, graph, exploring) => {
  const neighbors = graph.adjacency[ant.node];
  if (!exploring) return neighbors;
  const unvisited = neighbors.filter((node) => !ant.route.includes(node));
  return unvisited.length > 0 ? unvisited : neighbors;
};

const coverageOnEdge = (node, neighbor, pheromones) =>
  (pheromones.slow[arcKey(node, neighbor)] ?? 0) +
  (pheromones.slow[arcKey(neighbor, node)] ?? 0);

const choiceWeight = (
  node,
  neighbor,
  pheromones,
  params,
  exploring,
  edgeLength,
) => {
  const coverage = coverageOnEdge(node, neighbor, pheromones);
  const fast = pheromones.fast[arcKey(node, neighbor)] ?? 0;
  const novelty = params.baseWeight /
    (1 + params.slowAvoidance * Math.pow(coverage, params.slowExponent));
  const foodSignal = params.fastInfluence * fast;
  const visibility = Math.pow(
    1 / edgeLength,
    params.distanceInfluence ?? DEFAULTS.distanceInfluence,
  );
  return exploring ? novelty : (params.baseWeight + foodSignal) * visibility;
};

const foodSignalWeight = (node, neighbor, pheromones, params) =>
  params.fastInfluence * (pheromones.fast[arcKey(node, neighbor)] ?? 0);

const hasUsableFoodSignal = (node, neighbors, pheromones, params) =>
  neighbors.some((neighbor) =>
    foodSignalWeight(node, neighbor, pheromones, params) >= params.baseWeight
  );

const discoveryBudget = (random) => {
  const fraction = clamp(0, 1 - EPSILON, random);
  const extra = Math.floor(
    -Math.log(1 - fraction) * DISCOVERY_MEAN_EXTRA_EDGES,
  );
  return Math.min(DISCOVERY_MAX_EDGES, DISCOVERY_MIN_EDGES + extra);
};

export const choiceProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
  exploring = false,
  discouragedNode = null,
  edgeLength = () => 1,
) => {
  if (neighbors.length === 0) return [];
  const weights = neighbors.map((neighbor) =>
    choiceWeight(
      node,
      neighbor,
      pheromones,
      params,
      exploring,
      edgeLength(neighbor),
    ) *
    (neighbor === discouragedNode ? params.reversePenalty : 1)
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return neighbors.map((neighbor, index) => ({
    node: neighbor,
    probability: weights[index] / total,
  }));
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

const chooseNextNode = (
  ant,
  graph,
  pheromones,
  params,
  exploring,
  seed,
) => {
  const neighbors = eligibleNeighbors(ant, graph, exploring);
  const probabilities = choiceProbabilities(
    ant.node,
    neighbors,
    pheromones,
    params,
    exploring,
    previousNode(ant),
    (neighbor) => graph.edgeById[edgeKey(ant.node, neighbor)].length,
  );
  const [random, nextSeed] = nextRandom(seed);
  return [choose(probabilities, random), nextSeed];
};

export const coverageProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
) => {
  if (neighbors.length === 0) return [];
  const signals = neighbors.map((neighbor) =>
    Math.pow(
      pheromones.slow[arcKey(node, neighbor)] ?? 0,
      params.slowExponent,
    )
  );
  const total = signals.reduce((sum, signal) => sum + signal, 0);
  return neighbors.map((neighbor, index) => ({
    node: neighbor,
    probability: total <= EPSILON ? 1 / neighbors.length : signals[index] / total,
  }));
};

const eraseLoop = (route, node) => {
  const existingIndex = route.indexOf(node);
  return existingIndex >= 0 ? route.slice(0, existingIndex + 1) : [...route, node];
};

const cumulativeRouteDistance = (graph, route, endIndex) =>
  route.slice(1, endIndex + 1).reduce(
    (total, node, index) => total + graph.edgeById[edgeKey(route[index], node)].length,
    0,
  );

export const foodDepositForReturn = (
  ant,
  graph,
  params,
  returnIndex = ant.returnIndex,
) => {
  const distanceFromHill = cumulativeRouteDistance(
    graph,
    ant.route,
    returnIndex,
  );
  const gradient = params.foodGradientFloor +
    (1 - params.foodGradientFloor) *
      (distanceFromHill / Math.max(EPSILON, ant.tripDistance));
  return {
    channel: "fast",
    key: arcKey(ant.edge.to, ant.edge.from),
    amount: params.fastDeposit * gradient /
      Math.max(EPSILON, ant.tripDistance),
  };
};

const startSearchEdge = (ant, graph, pheromones, params, seed) => {
  const neighbors = graph.adjacency[ant.node];
  const hasFoodSignal = hasUsableFoodSignal(
    ant.node,
    neighbors,
    pheromones,
    params,
  );
  const routeIndex = ant.route.length - 1;

  const [assignedState, assignedSeed] = ant.searchState.kind === "unassigned"
    ? hasFoodSignal ? [{ kind: "follow" }, seed] : (() => {
      const [random, nextSeed] = nextRandom(seed);
      return [
        {
          kind: "explore",
          left: discoveryBudget(random),
        },
        nextSeed,
      ];
    })()
    : [ant.searchState, seed];

  const rejoinedState = assignedState.kind === "explore" && hasFoodSignal
    ? { kind: "follow" }
    : assignedState;
  const discoveryState = rejoinedState.kind === "explore" &&
      rejoinedState.left === 0
    ? routeIndex > 0 ? { kind: "backtrack", target: 0 } : { kind: "follow" }
    : rejoinedState;
  const expiredState = discoveryState.kind === "probe" &&
      discoveryState.left === 0
    ? hasFoodSignal
      ? { kind: "follow" }
      : routeIndex > discoveryState.anchor
      ? { kind: "backtrack", target: discoveryState.anchor }
      : { kind: "follow" }
    : discoveryState;
  const searchState = expiredState.kind === "backtrack" &&
      routeIndex <= expiredState.target
    ? { kind: "follow" }
    : expiredState;
  const readyAnt = { ...ant, searchState };

  if (searchState.kind === "backtrack") {
    const to = previousNode(readyAnt);
    return [
      {
        ...readyAnt,
        edge: {
          from: readyAnt.node,
          to,
          progress: 0,
          length: graph.edgeById[edgeKey(readyAnt.node, to)].length,
          exploring: false,
          backtrackFrom: routeIndex,
          backtrackTo: routeIndex - 1,
        },
      },
      assignedSeed,
    ];
  }

  if (searchState.kind === "follow" && !hasFoodSignal) {
    if (ant.node === graph.hill) {
      return startSearchEdge(
        { ...readyAnt, searchState: { kind: "unassigned" } },
        graph,
        pheromones,
        params,
        assignedSeed,
      );
    }
    return startSearchEdge(
      {
        ...readyAnt,
        searchState: { kind: "backtrack", target: 0 },
      },
      graph,
      pheromones,
      params,
      assignedSeed,
    );
  }

  const [nextSearchState, exploring, choiceSeed] = searchState.kind === "explore"
    ? [{ ...searchState, left: searchState.left - 1 }, true, assignedSeed]
    : searchState.kind === "probe"
    ? [
      { ...searchState, left: searchState.left - 1 },
      true,
      assignedSeed,
    ]
    : (() => {
      const [random, nextSeed] = nextRandom(assignedSeed);
      return random < params.exploreRate
        ? [
          {
            kind: "probe",
            left: EXPLORE_BURST_EDGES - 1,
            anchor: routeIndex,
          },
          true,
          nextSeed,
        ]
        : [{ kind: "follow" }, false, nextSeed];
    })();

  const [to, nextSeed] = chooseNextNode(
    readyAnt,
    graph,
    pheromones,
    params,
    exploring,
    choiceSeed,
  );
  return [
    {
      ...readyAnt,
      searchState: nextSearchState,
      exploreChoices: readyAnt.exploreChoices + Number(exploring),
      followChoices: readyAnt.followChoices + Number(!exploring),
      edge: {
        from: readyAnt.node,
        to,
        progress: 0,
        length: graph.edgeById[edgeKey(readyAnt.node, to)].length,
        exploring,
      },
    },
    nextSeed,
  ];
};

const startReturnEdge = (ant, graph, pheromones, params, seed) => {
  const earlierNeighbors = graph.adjacency[ant.node]
    .map((node) => ({ node, routeIndex: ant.route.lastIndexOf(node) }))
    .filter(({ routeIndex }) => routeIndex >= 0 && routeIndex < ant.returnIndex);
  const signaled = earlierNeighbors.filter(({ node }) =>
    (pheromones.slow[arcKey(ant.node, node)] ?? 0) > EPSILON
  );
  const candidates = signaled.length > 0
    ? signaled
    : [{ node: ant.route[ant.returnIndex - 1], routeIndex: ant.returnIndex - 1 }];
  const probabilities = coverageProbabilities(
    ant.node,
    candidates.map(({ node }) => node),
    pheromones,
    params,
  );
  const [random, nextSeed] = nextRandom(seed);
  const to = choose(probabilities, random);
  const nextReturnIndex = candidates.find(({ node }) => node === to).routeIndex;
  return [
    {
      ...ant,
      edge: {
        from: ant.node,
        to,
        progress: 0,
        length: graph.edgeById[edgeKey(ant.node, to)].length,
        returnIndex: ant.returnIndex,
        nextReturnIndex,
      },
    },
    nextSeed,
  ];
};

const startEdge = (ant, graph, pheromones, params, seed) =>
  ant.mode === "return"
    ? startReturnEdge(ant, graph, pheromones, params, seed)
    : startSearchEdge(ant, graph, pheromones, params, seed);

const beginReturn = (ant, graph, route) => {
  const tripDistance = routeLength(graph, route);
  return {
    ant: {
      ...ant,
      node: route.at(-1),
      edge: null,
      route,
      mode: "return",
      searchState: { kind: "follow" },
      returnIndex: route.length - 1,
      tripDistance,
    },
    events: [{
      type: "discovery",
      route,
      distance: tripDistance,
      food: route.at(-1),
    }],
    deposits: [],
  };
};

const arriveSearching = (ant, graph) => {
  const route = eraseLoop(ant.route, ant.edge.to);
  const atHill = ant.edge.to === graph.hill;
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    route,
    searchState: atHill ? { kind: "unassigned" } : ant.searchState,
  };
  return graph.foods.includes(ant.edge.to)
    ? beginReturn(arrived, graph, route)
    : { ant: arrived, events: [], deposits: [] };
};

const arriveReturning = (ant, graph, params) => {
  const returnIndex = ant.edge.returnIndex;
  const nextIndex = ant.edge.nextReturnIndex;
  const atHill = nextIndex === 0;
  const foodDeposit = foodDepositForReturn(
    ant,
    graph,
    params,
    returnIndex,
  );
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    returnIndex: nextIndex,
  };

  return atHill
    ? {
      ant: {
        ...arrived,
        mode: "search",
        route: [graph.hill],
        searchState: { kind: "unassigned" },
        returnIndex: null,
        tripDistance: 0,
        trips: ant.trips + 1,
      },
      events: [{ type: "delivery" }],
      deposits: [foodDeposit],
    }
    : { ant: arrived, events: [], deposits: [foodDeposit] };
};

const arrive = (ant, graph, params) => {
  const returning = ant.mode === "return";
  const revisitingIndex = ant.route.indexOf(ant.edge.to);
  const coverageFrom = returning || revisitingIndex >= 0 ? ant.edge.from : ant.edge.to;
  const coverageTo = returning || revisitingIndex >= 0 ? ant.edge.to : ant.edge.from;
  const coverageDeposit = {
    channel: "slow",
    key: arcKey(coverageFrom, coverageTo),
    amount: params.slowDeposit,
  };
  const result = returning
    ? arriveReturning(ant, graph, params)
    : arriveSearching(ant, graph);
  return { ...result, deposits: [coverageDeposit, ...result.deposits] };
};

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

  const discovered = ant.mode === "search" && ant.edge === null &&
      graph.foods.includes(ant.node)
    ? beginReturn(ant, graph, ant.route)
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
      deposits: [],
      events: [],
    };
  }

  const secondsUsed = distanceRemaining / params.speed;
  const arrival = arrive(movingAnt, graph, params);
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
    deposits: [...arrival.deposits, ...continued.deposits],
    events: [...arrival.events, ...continued.events],
  };
};

const addDeposits = (pheromones, deposits) =>
  deposits.reduce(
    (fields, deposit) => ({
      ...fields,
      [deposit.channel]: {
        ...fields[deposit.channel],
        [deposit.key]: fields[deposit.channel][deposit.key] + deposit.amount,
      },
    }),
    pheromones,
  );

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
      bestRoute: isBest ? event.route : next.bestRoute,
    };
  }, stats);

export const stepSimulation = (state, seconds) => {
  const dt = clamp(0, 0.25, finiteOr(0, seconds));
  if (dt === 0) return state;
  const decayed = decayPheromones(state.pheromones, state.params, dt);
  const advanced = state.ants
    .toSorted((first, second) => first.id - second.id)
    .reduce(
      (result, ant) => {
        const next = advanceAnt(
          ant,
          state.graph,
          decayed,
          state.params,
          result.rngSeed,
          dt,
        );
        return {
          ants: [...result.ants, next.ant],
          rngSeed: next.seed,
          deposits: [...result.deposits, ...next.deposits],
          events: [...result.events, ...next.events],
        };
      },
      { ants: [], rngSeed: state.rngSeed, deposits: [], events: [] },
    );

  return {
    ...state,
    rngSeed: advanced.rngSeed,
    elapsed: state.elapsed + dt,
    pheromones: addDeposits(decayed, advanced.deposits),
    ants: advanced.ants,
    stats: updateStats(state.stats, advanced.events),
  };
};

export const updateParams = (state, patch) => {
  const params = sanitizeParams({ ...state.params, ...patch });
  const difference = params.antCount - state.ants.length;
  const generated = difference > 0
    ? generateAnts(difference, state.graph.hill, state.rngSeed, state.ants.length)
    : { ants: [], rngSeed: state.rngSeed };
  return {
    ...state,
    params,
    rngSeed: generated.rngSeed,
    ants: difference < 0
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
    stats: {
      ...state.stats,
      deliveries: 0,
      discoveries: 0,
      bestDistance: null,
      bestRoute: [],
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
      bestRoute: [],
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

export const deriveMetrics = (state) => {
  const fastValues = Object.values(state.pheromones.fast);
  const totalFast = fastValues.reduce((sum, value) => sum + value, 0);
  const strongestByNode = state.graph.nodes.map(({ id }) =>
    Math.max(
      0,
      ...state.graph.adjacency[id].map(
        (neighbor) => state.pheromones.fast[arcKey(id, neighbor)] ?? 0,
      ),
    )
  );
  const signalFocus = totalFast <= EPSILON
    ? 0
    : strongestByNode.reduce((sum, value) => sum + value, 0) / totalFast;
  const selected = dominantFoodRoute(state);
  const efficiency = selected ? state.stats.shortestDistance / selected.distance : 0;

  return {
    deliveries: state.stats.deliveries,
    discoveries: state.stats.discoveries,
    bestDistance: state.stats.bestDistance,
    shortestDistance: state.stats.shortestDistance,
    bestHops: Math.max(0, state.stats.bestRoute.length - 1),
    selectedDistance: selected?.distance ?? null,
    selectedHops: Math.max(0, (selected?.route.length ?? 1) - 1),
    efficiency: clamp(0, 1, efficiency),
    signalFocus: clamp(0, 1, signalFocus),
    returning: state.ants.filter((ant) => ant.mode === "return").length,
    foods: state.graph.foods.length,
    exploring: state.ants.filter(
      (ant) =>
        ant.mode === "search" &&
        (["explore", "probe"].includes(ant.searchState.kind) ||
          ant.edge?.exploring === true),
    ).length,
  };
};

export const dominantFoodRoute = (state) => {
  const walk = (route, distance) => {
    const node = route.at(-1);
    if (state.graph.foods.includes(node)) return { route, distance };
    if (route.length > state.graph.nodes.length) return null;

    const neighbors = state.graph.adjacency[node].filter((neighbor) =>
      !route.includes(neighbor)
    );
    if (
      !hasUsableFoodSignal(
        node,
        neighbors,
        state.pheromones,
        state.params,
      )
    ) {
      return null;
    }
    const next = choiceProbabilities(
      node,
      neighbors,
      state.pheromones,
      state.params,
      false,
      null,
      (neighbor) => state.graph.edgeById[edgeKey(node, neighbor)].length,
    ).toSorted((first, second) => second.probability - first.probability)[0].node;
    const edge = state.graph.edgeById[edgeKey(node, next)];
    return walk([...route, next], distance + edge.length);
  };

  return walk([state.graph.hill], 0);
};

export const foodProbabilitiesForNode = (state, nodeId) => {
  const neighbors = state.graph.adjacency[nodeId] ?? [];
  const hasFoodSignal = hasUsableFoodSignal(
    nodeId,
    neighbors,
    state.pheromones,
    state.params,
  );
  if (!hasFoodSignal) return [];
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
