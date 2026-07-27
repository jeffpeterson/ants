export const DEFAULTS = Object.freeze({
  nodeCount: 24,
  density: 0.42,
  antCount: 64,
  scoutRate: 0.16,
  speed: 0.17,
  slowHalfLife: 42,
  fastHalfLife: 9,
  slowInfluence: 0.5,
  fastInfluence: 3.2,
  slowDeposit: 0.045,
  fastDeposit: 0.72,
  slowExponent: 1.15,
  fastExponent: 1.8,
  baseWeight: 0.06,
  foodGradientFloor: 0.3,
  pheromoneCap: 18,
});

const UINT32_RANGE = 4_294_967_296;
const EPSILON = 1e-9;

export const clamp = (minimum, maximum, value) =>
  Math.min(maximum, Math.max(minimum, value));

const finiteOr = (fallback, value) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

export const sanitizeParams = (values = {}) => ({
  ...DEFAULTS,
  ...values,
  nodeCount: Math.round(clamp(8, 36, finiteOr(DEFAULTS.nodeCount, values.nodeCount))),
  density: clamp(0.05, 0.9, finiteOr(DEFAULTS.density, values.density)),
  antCount: Math.round(clamp(8, 120, finiteOr(DEFAULTS.antCount, values.antCount))),
  scoutRate: clamp(0, 0.55, finiteOr(DEFAULTS.scoutRate, values.scoutRate)),
  speed: clamp(0.04, 0.65, finiteOr(DEFAULTS.speed, values.speed)),
  slowHalfLife: clamp(5, 120, finiteOr(DEFAULTS.slowHalfLife, values.slowHalfLife)),
  fastHalfLife: clamp(2, 40, finiteOr(DEFAULTS.fastHalfLife, values.fastHalfLife)),
  slowInfluence: clamp(0, 4, finiteOr(DEFAULTS.slowInfluence, values.slowInfluence)),
  fastInfluence: clamp(0, 10, finiteOr(DEFAULTS.fastInfluence, values.fastInfluence)),
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

const samplePoint = (seed) => {
  const [[x, y], nextSeed] = randomPair(seed);
  return [{ x: 0.07 + x * 0.86, y: 0.09 + y * 0.82 }, nextSeed];
};

const pointFarEnough = (points, point, minimumDistance) =>
  points.every((other) => distance(other, point) >= minimumDistance);

const findPoint = (points, seed, minimumDistance, attempt = 0) => {
  const [point, nextSeed] = samplePoint(seed);
  return pointFarEnough(points, point, minimumDistance) || attempt >= 72
    ? [point, nextSeed]
    : findPoint(points, nextSeed, minimumDistance * 0.992, attempt + 1);
};

const generateNodes = (count, seed) =>
  Array.from({ length: count }).reduce(
    ({ nodes, rngSeed }) => {
      const minimumDistance = 0.105 * Math.sqrt(22 / count);
      const [point, nextSeed] = findPoint(nodes, rngSeed, minimumDistance);
      const node = { id: nodes.length, ...point };
      return { nodes: [...nodes, node], rngSeed: nextSeed };
    },
    { nodes: [], rngSeed: seed >>> 0 },
  );

const completeEdges = (nodes) =>
  nodes.flatMap((first, index) =>
    nodes.slice(index + 1).map((second) => ({
      id: edgeKey(first.id, second.id),
      a: first.id,
      b: second.id,
      length: distance(first, second),
    }))
  );

const crossesCut = (edge, visited) =>
  visited.includes(edge.a) !== visited.includes(edge.b);

const minimumSpanningTree = (nodes, candidates) => {
  const grow = (visited, edges) => {
    if (visited.length === nodes.length) return edges;

    const nextEdge = candidates
      .filter((edge) => crossesCut(edge, visited))
      .reduce(
        (shortest, edge) =>
          !shortest || edge.length < shortest.length ? edge : shortest,
        null,
      );
    const nextNode = visited.includes(nextEdge.a) ? nextEdge.b : nextEdge.a;
    return grow([...visited, nextNode], [...edges, nextEdge]);
  };

  return grow([nodes[0].id], []);
};

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

const farthestPair = (nodes) =>
  nodes
    .flatMap((first, index) =>
      nodes.slice(index + 1).map((second) => ({
        first: first.id,
        second: second.id,
        distance: distance(first, second),
      }))
    )
    .reduce((farthest, pair) => pair.distance > farthest.distance ? pair : farthest);

export const generateGraph = (seed, values = {}) => {
  const params = sanitizeParams(values);
  const generated = generateNodes(params.nodeCount, seed);
  const candidates = completeEdges(generated.nodes);
  const tree = minimumSpanningTree(generated.nodes, candidates);
  const treeIds = new Set(tree.map((edge) => edge.id));
  const optional = candidates.filter((edge) => !treeIds.has(edge.id));
  const scored = scoreCandidates(optional, generated.rngSeed);
  const extraCount = Math.min(
    optional.length,
    Math.round(params.nodeCount * (0.2 + params.density * 1.45)),
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
      food: endpoints.second,
    },
    scored.rngSeed,
  ];
};

export const isConnected = (graph) => {
  const visit = (frontier, seen) => {
    if (frontier.length === 0) return seen;
    const [node, ...rest] = frontier;
    if (seen.includes(node)) return visit(rest, seen);
    return visit([...rest, ...graph.adjacency[node]], [...seen, node]);
  };

  return visit([graph.nodes[0].id], []).length === graph.nodes.length;
};

const routeLength = (graph, route) =>
  route.slice(1).reduce(
    (total, node, index) => total + graph.edgeById[edgeKey(route[index], node)].length,
    0,
  );

export const shortestRoute = (graph, start = graph.hill, end = graph.food) => {
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

const emptyPheromones = (graph) => ({
  slow: Object.fromEntries(graph.edges.map((edge) => [edge.id, 0])),
  fast: Object.fromEntries(
    graph.edges.flatMap((edge) => [
      [arcKey(edge.a, edge.b), 0],
      [arcKey(edge.b, edge.a), 0],
    ]),
  ),
});

const makeAnt = (id, hill, scoutScore) => ({
  id,
  node: hill,
  edge: null,
  mode: "search",
  route: [hill],
  returnIndex: null,
  tripDistance: 0,
  scoutScore,
  trips: 0,
});

const generateAnts = (count, hill, seed, startId = 0) =>
  Array.from({ length: count }).reduce(
    ({ ants, rngSeed }, _, index) => {
      const [scoutScore, nextSeed] = nextRandom(rngSeed);
      return {
        ants: [...ants, makeAnt(startId + index, hill, scoutScore)],
        rngSeed: nextSeed,
      };
    },
    { ants: [], rngSeed: seed },
  );

export const createSimulation = ({ seed = 1837, params: values = {} } = {}) => {
  const params = sanitizeParams(values);
  const graphSeed = Number(seed) >>> 0;
  const [graph, graphRngSeed] = generateGraph(graphSeed, params);
  const generatedAnts = generateAnts(
    params.antCount,
    graph.hill,
    graphRngSeed,
  );
  const optimum = shortestRoute(graph);

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

const eligibleNeighbors = (ant, graph) => {
  const neighbors = graph.adjacency[ant.node];
  const previous = previousNode(ant);
  const withoutImmediateReverse = neighbors.filter((node) => node !== previous);
  return withoutImmediateReverse.length > 0 ? withoutImmediateReverse : neighbors;
};

const choiceWeight = (node, neighbor, pheromones, params) => {
  const slow = pheromones.slow[edgeKey(node, neighbor)] ?? 0;
  const fast = pheromones.fast[arcKey(node, neighbor)] ?? 0;
  return (
    params.baseWeight +
    params.slowInfluence * Math.pow(slow, params.slowExponent) +
    params.fastInfluence * Math.pow(fast, params.fastExponent)
  );
};

export const choiceProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
  scout = false,
) => {
  if (neighbors.length === 0) return [];
  const weights = scout
    ? neighbors.map(() => 1)
    : neighbors.map((neighbor) => choiceWeight(node, neighbor, pheromones, params));
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

const chooseNextNode = (ant, graph, pheromones, params, seed) => {
  const neighbors = eligibleNeighbors(ant, graph);
  const scout = ant.scoutScore < params.scoutRate;
  const probabilities = choiceProbabilities(
    ant.node,
    neighbors,
    pheromones,
    params,
    scout,
  );
  const [random, nextSeed] = nextRandom(seed);
  return [choose(probabilities, random), nextSeed];
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
  const foodwardFrom = ant.route[returnIndex - 1];
  const foodwardTo = ant.route[returnIndex];
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
    key: arcKey(foodwardFrom, foodwardTo),
    amount: params.fastDeposit * gradient,
  };
};

const startSearchEdge = (ant, graph, pheromones, params, seed) => {
  const [to, nextSeed] = chooseNextNode(
    ant,
    graph,
    pheromones,
    params,
    seed,
  );
  return [
    {
      ...ant,
      edge: {
        from: ant.node,
        to,
        progress: 0,
        length: graph.edgeById[edgeKey(ant.node, to)].length,
      },
    },
    nextSeed,
  ];
};

const startReturnEdge = (ant, graph) => {
  const to = ant.route[ant.returnIndex - 1];
  return {
    ...ant,
    edge: {
      from: ant.node,
      to,
      progress: 0,
      length: graph.edgeById[edgeKey(ant.node, to)].length,
      returnIndex: ant.returnIndex,
    },
  };
};

const startEdge = (ant, graph, pheromones, params, seed) =>
  ant.mode === "return"
    ? [startReturnEdge(ant, graph), seed]
    : startSearchEdge(ant, graph, pheromones, params, seed);

const arriveSearching = (ant, graph) => {
  const route = eraseLoop(ant.route, ant.edge.to);
  const atFood = ant.edge.to === graph.food;
  const tripDistance = atFood ? routeLength(graph, route) : 0;
  return {
    ant: {
      ...ant,
      node: ant.edge.to,
      edge: null,
      route,
      mode: atFood ? "return" : "search",
      returnIndex: atFood ? route.length - 1 : null,
      tripDistance,
    },
    events: atFood ? [{ type: "discovery", route, distance: tripDistance }] : [],
    deposits: [],
  };
};

const arriveReturning = (ant, graph, params) => {
  const returnIndex = ant.edge.returnIndex;
  const nextIndex = returnIndex - 1;
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
  const slowDeposit = {
    channel: "slow",
    key: edgeKey(ant.edge.from, ant.edge.to),
    amount: params.slowDeposit,
  };
  const result = ant.mode === "return"
    ? arriveReturning(ant, graph, params)
    : arriveSearching(ant, graph);
  return { ...result, deposits: [slowDeposit, ...result.deposits] };
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

  const [movingAnt, nextSeed] = ant.edge
    ? [ant, seed]
    : startEdge(ant, graph, pheromones, params, seed);
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

const addDeposits = (pheromones, deposits, cap) =>
  deposits.reduce(
    (fields, deposit) => ({
      ...fields,
      [deposit.channel]: {
        ...fields[deposit.channel],
        [deposit.key]: Math.min(
          cap,
          fields[deposit.channel][deposit.key] + deposit.amount,
        ),
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
    pheromones: addDeposits(
      decayed,
      advanced.deposits,
      state.params.pheromoneCap,
    ),
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
    },
  };
};

export const clearPheromones = (state) => ({
  ...state,
  pheromones: emptyPheromones(state.graph),
});

export const setEndpoint = (state, kind, nodeId) => {
  const otherKind = kind === "hill" ? "food" : "hill";
  if (!state.graph.adjacency[nodeId] || nodeId === state.graph[otherKind]) {
    return state;
  }
  const graph = { ...state.graph, [kind]: nodeId };
  const optimum = shortestRoute(graph);
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
  const efficiency = state.stats.bestDistance
    ? state.stats.shortestDistance / state.stats.bestDistance
    : 0;

  return {
    deliveries: state.stats.deliveries,
    discoveries: state.stats.discoveries,
    bestDistance: state.stats.bestDistance,
    shortestDistance: state.stats.shortestDistance,
    bestHops: Math.max(0, state.stats.bestRoute.length - 1),
    efficiency: clamp(0, 1, efficiency),
    signalFocus: clamp(0, 1, signalFocus),
    returning: state.ants.filter((ant) => ant.mode === "return").length,
    scouts: state.ants.filter(
      (ant) => ant.scoutScore < state.params.scoutRate,
    ).length,
  };
};

export const probabilitiesForAntAtNode = (state, nodeId, scout = false) => {
  const neighbors = state.graph.adjacency[nodeId] ?? [];
  return choiceProbabilities(
    nodeId,
    neighbors,
    state.pheromones,
    state.params,
    scout,
  ).toSorted((first, second) => second.probability - first.probability);
};
