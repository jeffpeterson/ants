export const DEFAULTS = Object.freeze({
  nodeCount: 24,
  density: 0.42,
  antCount: 64,
  exploreRate: 0.05,
  speed: 0.17,
  slowHalfLife: 42,
  fastHalfLife: 9,
  slowInfluence: 0.5,
  fastInfluence: 3.2,
  slowDeposit: 0.045,
  fastDeposit: 0.72,
  slowExponent: 1.15,
  distanceInfluence: 1,
  gradientAttenuation: 2,
  baseWeight: 0.06,
  reversePenalty: 0.18,
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
  slowInfluence: clamp(
    0,
    8,
    finiteOr(DEFAULTS.slowInfluence, values.slowInfluence),
  ),
  fastInfluence: clamp(0, 10, finiteOr(DEFAULTS.fastInfluence, values.fastInfluence)),
  distanceInfluence: clamp(
    0,
    2,
    finiteOr(DEFAULTS.distanceInfluence, values.distanceInfluence),
  ),
  gradientAttenuation: clamp(
    0.2,
    6,
    finiteOr(DEFAULTS.gradientAttenuation, values.gradientAttenuation),
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

const emptyField = (graph) => ({
  nodes: Object.fromEntries(graph.nodes.map(({ id }) => [id, 0])),
  edges: Object.fromEntries(graph.edges.map(({ id }) => [id, 0])),
});

const emptyPheromones = (graph) => ({
  slow: emptyField(graph),
  fast: emptyField(graph),
});

const makeAnt = (id, hill) => ({
  id,
  node: hill,
  edge: null,
  mode: "search",
  previous: null,
  tripDistance: 0,
  homeLevel: 1,
  foodLevel: 0,
  returnSignal: null,
  searchState: { kind: "discover" },
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
      lastDistance: null,
      shortestDistance: optimum.distance,
      shortestRoute: optimum.route,
      foodChanges: 0,
      lastFoodChangeAt: null,
    },
  };
};

const decayValues = (values, factor) =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value * factor < 1e-6 ? 0 : value * factor,
    ]),
  );

const decayField = (field, halfLife, dt) => {
  const factor = Math.pow(0.5, dt / halfLife);
  return {
    nodes: decayValues(field.nodes, factor),
    edges: decayValues(field.edges, factor),
  };
};

export const decayPheromones = (pheromones, params, dt) => ({
  slow: decayField(pheromones.slow, params.slowHalfLife, dt),
  fast: decayField(pheromones.fast, params.fastHalfLife, dt),
});

export const fieldGradient = (field, node, neighbor) =>
  (field.nodes[neighbor] ?? 0) - (field.nodes[node] ?? 0);

const trailOnEdge = (field, node, neighbor) =>
  field.edges[edgeKey(node, neighbor)] ?? 0;

const normalizeChoices = (choices) => {
  const total = choices.reduce((sum, { weight }) => sum + weight, 0);
  return choices.map(({ node, weight }) => ({
    node,
    probability: weight / total,
  }));
};

const gradientChoices = (
  node,
  neighbors,
  field,
  direction,
  influence,
  params,
  edgeLength,
) =>
  neighbors.flatMap((neighbor) => {
    const gradient = direction * fieldGradient(field, node, neighbor);
    const trail = trailOnEdge(field, node, neighbor);
    if (gradient <= EPSILON || trail <= EPSILON) return [];
    const visibility = Math.pow(
      1 / edgeLength(neighbor),
      params.distanceInfluence,
    );
    return [{
      node: neighbor,
      weight: (params.baseWeight + influence * gradient) * visibility,
    }];
  });

export const choiceProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
  exploring = false,
  discouragedNode = null,
  edgeLength = () => 1,
) => {
  const choices = exploring
    ? neighbors.map((neighbor) => {
      const trail = trailOnEdge(pheromones.slow, node, neighbor);
      return {
        node: neighbor,
        weight: params.baseWeight /
          (1 + params.slowInfluence * Math.pow(trail, params.slowExponent)),
      };
    })
    : gradientChoices(
      node,
      neighbors,
      pheromones.fast,
      1,
      params.fastInfluence,
      params,
      edgeLength,
    );
  if (choices.length === 0) return [];
  return normalizeChoices(
    choices.map((choice) => ({
      ...choice,
      weight: choice.weight *
        (choice.node === discouragedNode ? params.reversePenalty : 1),
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

export const familiarityProbabilities = (
  node,
  neighbors,
  pheromones,
  params,
) => {
  if (neighbors.length === 0) return [];
  return normalizeChoices(
    neighbors.map((neighbor) => {
      const trail = trailOnEdge(pheromones.slow, node, neighbor);
      return {
        node: neighbor,
        weight: params.baseWeight +
          params.slowInfluence * Math.pow(trail, params.slowExponent),
      };
    }),
  );
};

const edgeLengthFrom = (graph, node) => (neighbor) =>
  graph.edgeById[edgeKey(node, neighbor)].length;

const attenuate = (level, length, params) =>
  level * Math.exp(-params.gradientAttenuation * length);

const movementEdge = (ant, graph, to, params, extra = {}) => {
  const length = graph.edgeById[edgeKey(ant.node, to)].length;
  return {
    from: ant.node,
    to,
    progress: 0,
    length,
    homeFrom: ant.homeLevel,
    homeTo: attenuate(ant.homeLevel, length, params),
    foodFrom: ant.foodLevel,
    foodTo: attenuate(ant.foodLevel, length, params),
    ...extra,
  };
};

const discoveryProbabilities = (
  ant,
  graph,
  pheromones,
  params,
  novelty,
) => {
  const neighbors = graph.adjacency[ant.node];
  if (novelty) {
    return choiceProbabilities(
      ant.node,
      neighbors,
      pheromones,
      params,
      true,
      ant.previous,
    );
  }
  const outward = neighbors.filter((neighbor) =>
    fieldGradient(pheromones.slow, ant.node, neighbor) < -EPSILON
  );
  const candidates = outward.length > 0 ? outward : neighbors;
  return normalizeChoices(
    familiarityProbabilities(
      ant.node,
      candidates,
      pheromones,
      params,
    ).map(({ node, probability }) => ({
      node,
      weight: probability *
        (node === ant.previous ? params.reversePenalty : 1),
    })),
  );
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
  );

const startSearchEdge = (ant, graph, pheromones, params, seed) => {
  const foodward = foodwardProbabilities(ant, graph, pheromones, params);
  if (ant.searchState.kind === "probe" && foodward.length === 0) {
    return [
      {
        ...ant,
        searchState: { kind: "follow" },
        edge: movementEdge(
          ant,
          graph,
          ant.searchState.origin,
          params,
          { exploring: false, reversingProbe: true },
        ),
      },
      seed,
    ];
  }

  const [exploreDraw, choiceSeed] = nextRandom(seed);
  const hasFoodward = foodward.length > 0;
  const exploring = !hasFoodward || exploreDraw < params.exploreRate;
  const novelty = hasFoodward || exploreDraw < params.exploreRate;
  const probabilities = exploring
    ? discoveryProbabilities(ant, graph, pheromones, params, novelty)
    : foodward;
  const [to, nextSeed] = chooseWithSeed(probabilities, choiceSeed);
  const searchState = hasFoodward && exploring
    ? { kind: "probe", origin: ant.node }
    : hasFoodward
    ? { kind: "follow" }
    : { kind: "discover" };
  return [
    {
      ...ant,
      searchState,
      exploreChoices: ant.exploreChoices + Number(exploring),
      followChoices: ant.followChoices + Number(!exploring),
      edge: movementEdge(ant, graph, to, params, { exploring }),
    },
    nextSeed,
  ];
};

const returnProbabilities = (
  ant,
  graph,
  pheromones,
  params,
  channel,
) => {
  const direction = channel === "fast" ? -1 : 1;
  const influence = channel === "fast" ? params.fastInfluence : params.slowInfluence;
  const choices = gradientChoices(
    ant.node,
    graph.adjacency[ant.node],
    pheromones[channel],
    direction,
    influence,
    params,
    edgeLengthFrom(graph, ant.node),
  );
  return choices.length === 0 ? [] : normalizeChoices(choices);
};

const startReturnEdge = (ant, graph, pheromones, params, seed) => {
  const preferred = ant.returnSignal ?? "fast";
  const preferredChoices = returnProbabilities(
    ant,
    graph,
    pheromones,
    params,
    preferred,
  );
  const channel = preferredChoices.length > 0 ? preferred : "slow";
  const probabilities = preferredChoices.length > 0
    ? preferredChoices
    : returnProbabilities(ant, graph, pheromones, params, "slow");
  if (probabilities.length === 0) {
    return [{ ...ant, edge: null, returnSignal: channel }, seed];
  }
  const [to, nextSeed] = chooseWithSeed(probabilities, seed);
  return [
    {
      ...ant,
      returnSignal: channel,
      edge: movementEdge(ant, graph, to, params, { returnSignal: channel }),
    },
    nextSeed,
  ];
};

const startEdge = (ant, graph, pheromones, params, seed) =>
  ant.mode === "return"
    ? startReturnEdge(ant, graph, pheromones, params, seed)
    : startSearchEdge(ant, graph, pheromones, params, seed);

const beginReturn = (ant) => ({
  ant: {
    ...ant,
    edge: null,
    mode: "return",
    searchState: { kind: "follow" },
    foodLevel: 1,
    returnSignal: null,
  },
  events: [{
    type: "discovery",
    distance: ant.tripDistance,
    food: ant.node,
  }],
  deposits: [],
});

const arriveSearching = (ant, graph) => {
  const atHill = ant.edge.to === graph.hill;
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    previous: atHill ? null : ant.edge.from,
    tripDistance: atHill ? 0 : ant.tripDistance + ant.edge.length,
    homeLevel: atHill ? 1 : ant.edge.homeTo,
    searchState: atHill ? { kind: "discover" } : ant.searchState,
  };
  return graph.foods.includes(ant.edge.to)
    ? beginReturn(arrived)
    : { ant: arrived, events: [], deposits: [] };
};

const arriveReturning = (ant, graph) => {
  const atHill = ant.edge.to === graph.hill;
  const arrived = {
    ...ant,
    node: ant.edge.to,
    edge: null,
    previous: ant.edge.from,
    homeLevel: atHill ? 1 : ant.edge.homeTo,
    foodLevel: ant.edge.foodTo,
  };

  return atHill
    ? {
      ant: {
        ...arrived,
        mode: "search",
        previous: null,
        searchState: { kind: "follow" },
        tripDistance: 0,
        homeLevel: 1,
        foodLevel: 0,
        returnSignal: null,
        trips: ant.trips + 1,
      },
      events: [{ type: "delivery" }],
      deposits: [],
    }
    : { ant: arrived, events: [], deposits: [] };
};

const arrive = (ant, graph, params) => {
  const returning = ant.mode === "return";
  const slowDeposit = {
    channel: "slow",
    edge: edgeKey(ant.edge.from, ant.edge.to),
    amount: params.slowDeposit,
    levels: returning ? [] : [
      [ant.edge.from, ant.edge.homeFrom],
      [ant.edge.to, ant.edge.homeTo],
    ],
  };
  const result = returning ? arriveReturning(ant, graph) : arriveSearching(ant, graph);
  const fastDeposits = returning
    ? [{
      channel: "fast",
      edge: edgeKey(ant.edge.from, ant.edge.to),
      amount: params.fastDeposit,
      levels: [
        [ant.edge.from, ant.edge.foodFrom],
        [ant.edge.to, ant.edge.foodTo],
      ],
    }]
    : [];
  return {
    ...result,
    deposits: [slowDeposit, ...fastDeposits, ...result.deposits],
  };
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
    (fields, deposit) => {
      const field = fields[deposit.channel];
      const nodes = deposit.levels.reduce(
        (values, [node, level]) => ({
          ...values,
          [node]: Math.max(values[node], level),
        }),
        field.nodes,
      );
      return {
        ...fields,
        [deposit.channel]: {
          nodes,
          edges: {
            ...field.edges,
            [deposit.edge]: field.edges[deposit.edge] + deposit.amount,
          },
        },
      };
    },
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

export const deriveMetrics = (state) => {
  const fastValues = Object.values(state.pheromones.fast.edges);
  const totalFast = fastValues.reduce((sum, value) => sum + value, 0);
  const strongestByNode = state.graph.nodes.map(({ id }) =>
    Math.max(
      0,
      ...state.graph.adjacency[id].map(
        (neighbor) => trailOnEdge(state.pheromones.fast, id, neighbor),
      ),
    )
  );
  const signalFocus = totalFast <= EPSILON
    ? 0
    : strongestByNode.reduce((sum, value) => sum + value, 0) /
      (2 * totalFast);
  const selected = dominantFoodRoute(state);
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
        (["discover", "probe"].includes(ant.searchState.kind) ||
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
    const probabilities = choiceProbabilities(
      node,
      neighbors,
      state.pheromones,
      state.params,
      false,
      null,
      (neighbor) => state.graph.edgeById[edgeKey(node, neighbor)].length,
    );
    if (probabilities.length === 0) return null;
    const next = probabilities.toSorted(
      (first, second) => second.probability - first.probability,
    )[0].node;
    const edge = state.graph.edgeById[edgeKey(node, next)];
    return walk([...route, next], distance + edge.length);
  };

  return walk([state.graph.hill], 0);
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
