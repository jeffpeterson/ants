const ADAPTER_VERSION = 1;
const DEFAULT_GRAPH_SEED = 1837;
const RUN_SEED_SALT = 0x9e3779b9;
const EPSILON = 1e-9;

const freeze = (value) => Object.freeze(value);

const valuesFor = (keys, value = 0) =>
  Object.fromEntries(keys.map((key) => [key, value]));

const nodeIds = (graph) => graph.nodes.map(({ id }) => id);
const edgeIds = (graph) => graph.edges.map(({ id }) => id);
const arcIds = (graph) => graph.edges.flatMap(({ a, b }) => [`${a}>${b}`, `${b}>${a}`]);

const validEndpoint = (graph, node) => Object.hasOwn(graph.adjacency, node);

const selectedFoods = (graph, hill, requested) => {
  const candidates = requested ??
    graph.foods ??
    (graph.food === undefined ? [] : [graph.food]);
  return [...new Set(candidates)].filter((food) =>
    validEndpoint(graph, food) && food !== hill
  );
};

const graphForEngine = (graph, spec, options = {}) => {
  const hill = validEndpoint(graph, options.hill) ? options.hill : graph.hill;
  const foods = selectedFoods(graph, hill, options.foods);
  if (foods.length === 0) {
    throw new Error(`${spec.id} requires at least one valid food source`);
  }
  const mappedFoods = spec.singleFood ? foods.slice(0, 1) : foods;
  return spec.singleFood
    ? { ...graph, hill, food: mappedFoods[0], foods: mappedFoods }
    : { ...graph, hill, foods: mappedFoods };
};

const normalizeGraph = (graph, spec) => {
  if (!spec.singleFood) return graph;
  const food = graph.food ?? graph.foods?.[0];
  return graph.food === food &&
      graph.foods?.length === 1 &&
      graph.foods[0] === food
    ? graph
    : { ...graph, food, foods: [food] };
};

const resourceParams = (values = {}, resources = {}) => ({
  ...values,
  ...(Number.isFinite(Number(resources.antCount))
    ? { antCount: Number(resources.antCount) }
    : {}),
  ...(Number.isFinite(Number(resources.speed))
    ? { speed: Number(resources.speed) }
    : {}),
});

const permanentRoleAnts = (source, count, hill, seed) =>
  Array.from({ length: count }).reduce(
    ({ ants, rngSeed }, _, id) => {
      const [scoutScore, nextSeed] = source.nextRandom(rngSeed);
      return {
        ants: [
          ...ants,
          {
            id,
            node: hill,
            edge: null,
            mode: "search",
            route: [hill],
            returnIndex: null,
            tripDistance: 0,
            scoutScore,
            trips: 0,
          },
        ],
        rngSeed: nextSeed,
      };
    },
    { ants: [], rngSeed: seed },
  );

const temporaryRouteAnt = (id, hill) => ({
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

const scalarGradientAnt = (id, hill) => ({
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

const nodeScalarAnt = (id, hill) => ({
  id,
  node: hill,
  edge: null,
  mode: "search",
  previous: null,
  tripDistance: 0,
  homeLevel: 1,
  turnAround: null,
  searchState: { kind: "explore" },
  exploreChoices: 0,
  followChoices: 0,
  trips: 0,
});

const generateAnts = (source, spec, count, hill, seed) => {
  if (spec.antSchema === "permanent-role") {
    return permanentRoleAnts(source, count, hill, seed);
  }
  const makeAnt = spec.antSchema === "temporary-route"
    ? temporaryRouteAnt
    : spec.antSchema === "scalar-gradient"
    ? scalarGradientAnt
    : nodeScalarAnt;
  return {
    ants: Array.from({ length: count }, (_, id) => makeAnt(id, hill)),
    rngSeed: seed,
  };
};

const emptyPheromones = (graph, spec) => {
  const nodes = valuesFor(nodeIds(graph));
  const edges = valuesFor(edgeIds(graph));
  const arcs = valuesFor(arcIds(graph));
  if (spec.pheromoneSchema === "edge-arc") {
    return { slow: edges, fast: arcs };
  }
  if (spec.pheromoneSchema === "arc-arc") {
    return { slow: arcs, fast: { ...arcs } };
  }
  if (spec.pheromoneSchema === "nested-scalar") {
    return {
      slow: { nodes, edges },
      fast: { nodes: { ...nodes }, edges: { ...edges } },
    };
  }
  return {
    slow: { ...nodes, [graph.hill]: 1 },
    fast: { ...nodes },
  };
};

const shortestRoute = (source, graph, spec) =>
  spec.singleFood
    ? source.shortestRoute(graph, graph.hill, graph.food)
    : source.shortestRouteToFood(graph, graph.hill);

const initialStats = (source, graph, spec) => {
  const shortest = shortestRoute(source, graph, spec);
  return {
    deliveries: 0,
    discoveries: 0,
    bestDistance: null,
    ...(spec.hasBestRoute ? { bestRoute: [] } : {}),
    lastDistance: null,
    shortestDistance: shortest.distance,
    shortestRoute: shortest.route,
    ...(spec.liveFood ? { foodChanges: 0, lastFoodChangeAt: null } : {}),
  };
};

const graphParams = (params, spec, supplied) => ({
  graphParams: supplied ??
    Object.fromEntries(
      spec.graphParams.map((key) => [key, params[key]]),
    ),
});

const channelView = (graph, { nodes = {}, edges = {}, arcs = {} } = {}) =>
  freeze({
    nodes: freeze(
      Object.fromEntries(
        nodeIds(graph).map((id) => [id, nodes[id] ?? 0]),
      ),
    ),
    edges: freeze(
      Object.fromEntries(
        edgeIds(graph).map((id) => [id, edges[id] ?? 0]),
      ),
    ),
    arcs: freeze(
      Object.fromEntries(
        arcIds(graph).map((id) => [id, arcs[id] ?? 0]),
      ),
    ),
  });

const trailFields = (state, spec) => {
  if (spec.pheromoneSchema === "edge-arc") {
    return {
      slow: { edges: state.pheromones.slow },
      fast: { arcs: state.pheromones.fast },
    };
  }
  if (spec.pheromoneSchema === "arc-arc") {
    return {
      slow: { arcs: state.pheromones.slow },
      fast: { arcs: state.pheromones.fast },
    };
  }
  if (spec.pheromoneSchema === "nested-scalar") {
    return {
      slow: state.pheromones.slow,
      fast: state.pheromones.fast,
    };
  }
  return {
    slow: { nodes: state.pheromones.slow },
    fast: { nodes: state.pheromones.fast },
  };
};

const trailView = (state, spec) => {
  const fields = trailFields(state, spec);
  return freeze({
    slow: channelView(state.graph, fields.slow),
    fast: channelView(state.graph, fields.fast),
  });
};

const antById = (state) => Object.fromEntries(state.ants.map((ant) => [ant.id, ant]));

const eventCandidates = (previous, next, type) => {
  const before = antById(previous);
  return next.ants.filter((ant) => {
    const old = before[ant.id];
    return type === "discovery"
      ? old?.mode === "search" && ant.mode === "return"
      : ant.trips > (old?.trips ?? 0);
  });
};

const canonicalEvents = (previous, next) => {
  const discoveryCount = Math.max(
    0,
    next.stats.discoveries - previous.stats.discoveries,
  );
  const deliveryCount = Math.max(
    0,
    next.stats.deliveries - previous.stats.deliveries,
  );
  const discoveries = eventCandidates(previous, next, "discovery");
  const deliveries = eventCandidates(previous, next, "delivery");
  const discoveryEvents = Array.from({ length: discoveryCount }, (_, index) => {
    const ant = discoveries[index];
    const food = ant && next.graph.foods.includes(ant.node) ? ant.node : null;
    return freeze({
      type: "discovery",
      antId: ant?.id ?? null,
      food,
      distance: ant?.tripDistance ?? null,
    });
  });
  const deliveryEvents = Array.from({ length: deliveryCount }, (_, index) =>
    freeze({
      type: "delivery",
      antId: deliveries[index]?.id ?? null,
      distance: null,
    }));
  return freeze([...discoveryEvents, ...deliveryEvents]);
};

const present = (state, spec, previous = null) => {
  const graph = normalizeGraph(state.graph, spec);
  const normalized = graph === state.graph ? state : { ...state, graph };
  const lastEvents = previous === null
    ? freeze([])
    : canonicalEvents(previous, normalized);
  return {
    ...normalized,
    resources: freeze({
      antCount: normalized.params.antCount,
      speed: normalized.params.speed,
    }),
    adapter: freeze({
      version: ADAPTER_VERSION,
      revision: spec.revision,
      lane: normalized.adapter?.lane ?? "native",
      runSeed: normalized.adapter?.runSeed ?? normalized.runSeed,
    }),
    trailView: trailView(normalized, spec),
    lastEvents,
    observations: freeze({
      discoveries: lastEvents.filter(({ type }) => type === "discovery").length,
      deliveries: lastEvents.filter(({ type }) => type === "delivery").length,
    }),
  };
};

const transition = (state, spec, action, observe = false) => {
  const next = action(state);
  return next === state ? state : present(next, spec, observe ? state : null);
};

const withRunSeed = (state, action) => {
  const seeded = {
    ...state,
    graphSeed: (state.runSeed ^ RUN_SEED_SALT) >>> 0,
  };
  const next = action(seeded);
  return next === seeded ? state : { ...next, graphSeed: state.graphSeed };
};

const nativeGraph = (source, graphSeed, params, options) => {
  const [generated] = source.generateGraph(graphSeed, params);
  return graphForEngine(generated, options.spec, options);
};

const createSimulation = (source, spec, options = {}) => {
  const graphSeed = Number(
    options.graphSeed ?? options.seed ?? DEFAULT_GRAPH_SEED,
  ) >>> 0;
  const runSeed = Number(
    options.runSeed ?? (graphSeed ^ RUN_SEED_SALT),
  ) >>> 0;
  const params = source.sanitizeParams(
    resourceParams(options.params, options.resources),
  );
  const graph = options.graph === undefined
    ? nativeGraph(source, graphSeed, params, { ...options, spec })
    : graphForEngine(options.graph, spec, options);
  const generated = generateAnts(
    source,
    spec,
    params.antCount,
    graph.hill,
    runSeed,
  );
  return present({
    graphSeed,
    runSeed,
    ...graphParams(params, spec, options.graphParams),
    rngSeed: generated.rngSeed,
    elapsed: 0,
    params,
    graph,
    pheromones: emptyPheromones(graph, spec),
    ants: generated.ants,
    stats: initialStats(source, graph, spec),
    adapter: {
      version: ADAPTER_VERSION,
      revision: spec.revision,
      lane: options.graph === undefined ? "native" : "common",
      runSeed,
    },
  }, spec);
};

const genericDominantRoute = (state) => {
  const signal = (node, neighbor) => {
    const edge = state.graph.edgeById[
      node < neighbor ? `${node}:${neighbor}` : `${neighbor}:${node}`
    ];
    return state.trailView.fast.arcs[`${node}>${neighbor}`] ||
      state.trailView.fast.edges[edge.id] ||
      state.trailView.fast.nodes[neighbor] ||
      0;
  };
  const visit = (node, route, distance, seen) => {
    if (state.graph.foods.includes(node)) return { route, distance };
    const options = state.graph.adjacency[node]
      .filter((neighbor) => !seen.has(neighbor))
      .map((neighbor) => {
        const edge = state.graph.edgeById[
          node < neighbor ? `${node}:${neighbor}` : `${neighbor}:${node}`
        ];
        return { node: neighbor, edge, score: signal(node, neighbor) / edge.length };
      })
      .filter(({ score }) => score > EPSILON)
      .toSorted((first, second) => second.score - first.score);
    return options.reduce(
      (found, option) =>
        found ??
          visit(
            option.node,
            [...route, option.node],
            distance + option.edge.length,
            new Set([...seen, option.node]),
          ),
      null,
    );
  };
  return visit(
    state.graph.hill,
    [state.graph.hill],
    0,
    new Set([
      state.graph.hill,
    ]),
  );
};

export const historicalEngine = (metadata, source, schema) => {
  const spec = freeze({
    ...schema,
    id: metadata.id,
    revision: metadata.commit,
  });
  const liveEdit = (name) => (state, ...args) =>
    transition(state, spec, (current) => source[name](current, ...args));
  const runSeededEdit = (name) => (state, ...args) =>
    transition(
      state,
      spec,
      (current) => withRunSeed(current, (seeded) => source[name](seeded, ...args)),
    );
  const noEdit = (state) => state;
  const moveSingleFood = (state, sourceId, destinationId) =>
    sourceId !== state.graph.food ? state : transition(
      state,
      spec,
      (current) =>
        withRunSeed(
          current,
          (seeded) => source.setEndpoint(seeded, "food", destinationId),
        ),
    );
  const probabilities = schema.probabilities === "food"
    ? (state, nodeId) => source.foodProbabilitiesForNode(state, nodeId)
    : (state, nodeId) => source.probabilitiesForAntAtNode(state, nodeId, false);

  return freeze({
    id: metadata.id,
    version: ADAPTER_VERSION,
    name: metadata.label,
    revision: metadata.commit,
    family: metadata.family,
    traits: metadata.traits,
    defaults: source.DEFAULTS,
    capabilities: freeze({
      commonGraph: true,
      nativeGraph: true,
      multipleFoods: !schema.singleFood,
      liveFood: schema.singleFood ? "reset" : "preserve",
      exactCycleDistance: false,
    }),
    createSimulation: (options) => createSimulation(source, spec, options),
    stepSimulation: (state, seconds) =>
      transition(
        state,
        spec,
        (current) => source.stepSimulation(current, seconds),
        true,
      ),
    updateParams: liveEdit("updateParams"),
    resetRun: runSeededEdit("resetRun"),
    clearPheromones: liveEdit("clearPheromones"),
    moveFood: schema.singleFood ? moveSingleFood : liveEdit("moveFood"),
    addFood: schema.singleFood ? noEdit : liveEdit("addFood"),
    removeFood: schema.singleFood ? noEdit : liveEdit("removeFood"),
    setEndpoint: runSeededEdit("setEndpoint"),
    deriveMetrics: (state) => source.deriveMetrics(state),
    dominantFoodRoute: source.dominantFoodRoute === undefined
      ? genericDominantRoute
      : (state) => source.dominantFoodRoute(state),
    foodProbabilitiesForNode: probabilities,
  });
};
