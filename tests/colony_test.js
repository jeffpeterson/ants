import {
  addFood,
  choiceProbabilities,
  competitiveFoodDeposit,
  createSimulation,
  decayPheromones,
  dominantFoodRoute,
  edgeKey,
  explorationStopProbability,
  foodProbabilitiesForNode,
  generateGraph,
  homewardProbabilities,
  isConnected,
  moveFood,
  nextRandom,
  reinforceHome,
  removeFood,
  stepSimulation,
  trailGradient,
  updateParams,
} from "../src/colony.js";
import {
  algorithmPreset,
  decodeConfiguration,
  encodeConfiguration,
  mapPreset,
  sharedConfiguration,
} from "../src/config.js";
import { CONTROL_HELP } from "../src/help.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const run = (state, steps, dt = 0.25) =>
  Array.from({ length: steps }).reduce(
    (current) => stepSimulation(current, dt),
    state,
  );

const testSimulation = (options = {}) =>
  createSimulation({
    ...options,
    params: {
      nodeCount: 24,
      density: 0.42,
      mapVariation: 0.72,
      ...options.params,
    },
  });

const parameters = (patch = {}) => ({
  ...testSimulation({ seed: 1 }).params,
  distanceInfluence: 0,
  headingInfluence: 0,
  reversePenalty: 1,
  ...patch,
});

Deno.test("seeded random values are reproducible and explicit", () => {
  assertEquals(nextRandom(42), nextRandom(42));
  assert(nextRandom(42)[1] !== 42);
});

Deno.test("varied maps are deterministic, connected, and implementation-neutral", () => {
  const values = {
    nodeCount: 48,
    density: 0.35,
    mapVariation: 0.8,
  };
  const [first] = generateGraph(8128, values);
  const [second] = generateGraph(8128, values);
  assertEquals(first, second);
  assert(isConnected(first));
  assert(first.nodes.every((node) => !Object.hasOwn(node, "island")));
  assert(!Object.hasOwn(first, "islandCount"));
  assert(first.hill !== first.foods[0]);
});

Deno.test("variation loosens geometry while connections control edge count", () => {
  const [calm] = generateGraph(5, {
    nodeCount: 64,
    density: 0.42,
    mapVariation: 0,
  });
  const [varied] = generateGraph(5, {
    nodeCount: 64,
    density: 0.42,
    mapVariation: 1,
  });
  const edgeSpread = (graph) => {
    const lengths = graph.edges
      .map((edge) => edge.length)
      .toSorted((first, second) => first - second);
    return lengths.at(-1) / lengths[Math.floor(lengths.length / 2)];
  };
  assertEquals(calm.edges.length, varied.edges.length);
  assert(edgeSpread(varied) > edgeSpread(calm) * 2);
  assert(
    calm.nodes.some((node, index) => Math.abs(node.x - varied.nodes[index].x) > 0.02),
  );

  const [sparse] = generateGraph(5, {
    nodeCount: 64,
    density: 0.05,
    mapVariation: 0.7,
  });
  const [dense] = generateGraph(5, {
    nodeCount: 64,
    density: 0.9,
    mapVariation: 0.7,
  });
  assert(dense.edges.length > sparse.edges.length);
});

Deno.test("maximum maps stay sparse, connected, bounded, and quick", () => {
  const startedAt = performance.now();
  const [graph] = generateGraph(77, {
    nodeCount: 1_200,
    density: 0.9,
    mapVariation: 1,
  });
  const duration = performance.now() - startedAt;
  assertEquals(graph.nodes.length, 1_200);
  assert(graph.edges.length < graph.nodes.length * 4);
  assertEquals(new Set(graph.edges.map(({ id }) => id)).size, graph.edges.length);
  assert(graph.edges.every(({ a, b, length }) => a !== b && length > 0));
  assert(graph.nodes.every(({ x, y }) =>
    Number.isFinite(x) && Number.isFinite(y) &&
    x > 0 && x < 1 && y > 0 && y < 1
  ));
  assert(isConnected(graph));
  assert(duration < 1_500, `Max graph took ${duration.toFixed(0)}ms`);
});

Deno.test("pheromones are scalar node fields and food fades faster", () => {
  const decayed = decayPheromones(
    { slow: { 0: 1, 1: 0.5 }, fast: { 0: 1, 1: 0.5 } },
    { slowHalfLife: 40, fastHalfLife: 8 },
    8,
  );
  assert(decayed.fast[0] < decayed.slow[0]);
  assert(Math.abs(decayed.fast[0] - 0.5) < 1e-9);
  assert(
    Math.abs(trailGradient({ 0: 0.2, 1: 0.7 }, { a: 0, b: 1 }) - 0.5) <
      1e-12,
  );
  const initial = testSimulation({ seed: 1 });
  assertEquals(
    Object.keys(initial.pheromones.fastEdges).toSorted(),
    initial.graph.edges.map(({ id }) => id).toSorted(),
  );
  assertEquals(
    Object.keys(initial.pheromones.slowEdges).toSorted(),
    initial.graph.edges.map(({ id }) => id).toSorted(),
  );
});

Deno.test("home remains the sole anchored persistent source", () => {
  const initial = testSimulation({ seed: 19 });
  const faded = {
    ...initial,
    ants: [],
    pheromones: {
      ...initial.pheromones,
      slow: { ...initial.pheromones.slow, [initial.graph.hill]: 0.25 },
    },
  };
  const stepped = stepSimulation(faded, 0.25);

  assertEquals(stepped.pheromones.slow[stepped.graph.hill], 1);
  assert(
    stepped.graph.nodes
      .filter(({ id }) => id !== stepped.graph.hill)
      .every(({ id }) => stepped.pheromones.slow[id] === 0),
  );
});

Deno.test("the first outbound trail already increases toward home", () => {
  let state = testSimulation({
    seed: 19,
    params: { antCount: 8, speed: 0.65 },
  });
  for (
    let step = 0;
    step < 20 &&
    Object.entries(state.pheromones.slow).every(([node, value]) =>
      Number(node) === state.graph.hill || value === 0
    );
    step += 1
  ) {
    state = stepSimulation(state, 0.25);
  }

  const marked = state.graph.nodes.filter(({ id }) =>
    id !== state.graph.hill && state.pheromones.slow[id] > 0
  );
  assert(marked.length > 0);
  marked.forEach(({ id }) =>
    assert(
      state.graph.adjacency[id].some((neighbor) =>
        state.pheromones.slow[neighbor] > state.pheromones.slow[id]
      ),
      `Node ${id} lacks a higher home-potential neighbor`,
    )
  );
});

Deno.test("home reinforcement accumulates below its local gradient cap", () => {
  const cap = reinforceHome(0, 1, 0.2, 1);
  const levels = Array.from({ length: 4 }).reduce(
    (values) => [...values, reinforceHome(values.at(-1), 1, 0.2, 0.25)],
    [0],
  );

  assert(levels.every((level, index) => index === 0 || level > levels[index - 1]));
  assert(levels.every((level) => level < cap));
  assertEquals(reinforceHome(cap, 1, 0.2, 0.25), cap);
  assertEquals(reinforceHome(0.9, 0.5, 0.2, 0.25), 0.9);
  const next = reinforceHome(0, levels.at(-1), 0.2, 0.25);
  assert(next > 0 && next < levels.at(-1));
});

Deno.test("a distant positive home gradient survives and remains navigable", () => {
  const levels = Array.from({ length: 24 }).reduce(
    (values) => [...values, reinforceHome(0, values.at(-1), 0.1, 0.25)],
    [1],
  );
  const slow = {
    ...Object.fromEntries(levels.map((level, node) => [node, level])),
    25: 0,
  };
  const decayed = decayPheromones(
    {
      slow,
      slowEdges: {},
      fast: Object.fromEntries(Object.keys(slow).map((node) => [node, 0])),
      fastEdges: {},
    },
    parameters({ slowHalfLife: 3_600, fastHalfLife: 14.4 }),
    0.25,
  );
  const distant = decayed.slow[24];
  const choices = homewardProbabilities(
    24,
    [23, 25],
    decayed,
    parameters({
      homewardPreference: 1,
      returnSlowInfluence: 3.09,
      returnSlowPolarity: 4,
      reversePenalty: 1,
    }),
  );

  assert(distant > 0 && distant < 1e-9);
  assertEquals(choices.map(({ node, probability }) => [node, probability]), [
    [23, 1],
    [25, 0],
  ]);
});

Deno.test("a distant carrier identifies its tiny homeward signal", () => {
  const initial = testSimulation({
    seed: 71,
    params: { antCount: 8, speed: 0.65 },
  });
  const node = initial.graph.nodes.find(({ id }) =>
    id !== initial.graph.hill &&
    !initial.graph.foods.includes(id) &&
    !initial.graph.adjacency[id].includes(initial.graph.hill)
  )?.id;
  assert(node !== undefined);
  const homeward = initial.graph.adjacency[node][0];
  assert(homeward !== undefined);
  const slow = {
    ...initial.pheromones.slow,
    [node]: 1e-20,
    [homeward]: 2e-20,
  };
  const ant = {
    ...initial.ants[0],
    launchDelay: 0,
    node,
    mode: "return",
    previous: null,
    searchState: { kind: "follow" },
    foodDeposit: initial.params.fastDeposit,
  };
  const stepped = stepSimulation({
    ...initial,
    pheromones: { ...initial.pheromones, slow },
    ants: [ant],
  }, 0.001);

  assertEquals(stepped.ants[0].edge.to, homeward);
  assertEquals(stepped.ants[0].edge.returnTrail, "signal");
  assertEquals(stepped.ants[0].returnSignalChoices, 1);
  assertEquals(stepped.ants[0].returnRandomChoices, 0);
});

Deno.test("carrier diagnostics count random homeward fallbacks", () => {
  const initial = testSimulation({
    seed: 71,
    params: { antCount: 8 },
  });
  const node = initial.graph.nodes.find(({ id }) =>
    id !== initial.graph.hill &&
    !initial.graph.foods.includes(id) &&
    !initial.graph.adjacency[id].includes(initial.graph.hill)
  )?.id;
  assert(node !== undefined);
  const ant = {
    ...initial.ants[0],
    launchDelay: 0,
    node,
    mode: "return",
    previous: null,
    searchState: { kind: "follow" },
    foodDeposit: initial.params.fastDeposit,
  };
  const stepped = stepSimulation({
    ...initial,
    pheromones: {
      ...initial.pheromones,
      slow: Object.fromEntries(
        initial.graph.nodes.map(({ id }) => [
          id,
          id === initial.graph.hill ? 1 : 0,
        ]),
      ),
    },
    ants: [ant],
  }, 0.001);

  assertEquals(stepped.ants[0].edge.returnTrail, "random");
  assertEquals(stepped.ants[0].returnSignalChoices, 0);
  assertEquals(stepped.ants[0].returnRandomChoices, 1);
});

Deno.test("swarming makes a once-crossed bridge locally attractive", () => {
  const rate = 0.25;
  const reinforce = (level) => reinforceHome(level, 0.6, 0.1, rate);
  const bridge = reinforce(0);
  const swarmed = Array.from({ length: 8 }).reduce(reinforce, 0);
  const cap = reinforceHome(0, 0.6, 0.1, 1);
  const probabilities = (first, second) =>
    choiceProbabilities(
      0,
      [1, 2],
      {
        slow: { 0: 0.6, 1: first, 2: second },
        slowEdges: {
          [edgeKey(0, 1)]: 1,
          [edgeKey(0, 2)]: 1,
        },
        fast: { 0: 0, 1: 0, 2: 0 },
      },
      parameters({
        exploreSignalBias: -2,
        unchartedPreference: 0.75,
      }),
      true,
    ).find(({ node }) => node === 2).probability;

  assert(probabilities(swarmed, bridge) > 0.7);
  assertEquals(probabilities(cap, cap), 0.5);
});

Deno.test("stale carried values cannot inject persistent signal", () => {
  const initial = testSimulation({ seed: 23, params: { antCount: 8 } });
  const edge = initial.graph.edges.find(({ a, b }) =>
    ![a, b].includes(initial.graph.hill) &&
    ![a, b].some((node) => initial.graph.foods.includes(node))
  );
  assert(edge);
  const ant = {
    ...initial.ants[0],
    node: edge.a,
    homeLevel: 1_000,
    edge: {
      from: edge.a,
      to: edge.b,
      length: edge.length,
      progress: 0.999,
      homeFrom: 1_000,
      homeTo: 999,
      exploring: true,
    },
  };
  const state = {
    ...initial,
    ants: [ant],
  };
  const stepped = stepSimulation(state, 0.01);

  assertEquals(stepped.pheromones.slow[edge.a], 0);
  assertEquals(stepped.pheromones.slow[edge.b], 0);
  assertEquals(stepped.pheromones.slow[stepped.graph.hill], 1);
});

Deno.test("every persistent mark retains a higher home-potential neighbor", () => {
  let state = testSimulation({
    seed: 93,
    params: { antCount: 48, speed: 0.65 },
  });
  for (let step = 0; step < 240; step += 1) {
    state = stepSimulation(state, 0.25);
    state.graph.nodes
      .filter(({ id }) => id !== state.graph.hill && state.pheromones.slow[id] > 0)
      .forEach(({ id }) =>
        assert(
          state.graph.adjacency[id].some((neighbor) =>
            state.pheromones.slow[neighbor] > state.pheromones.slow[id]
          ),
          `Node ${id} became a persistent local maximum at step ${step}`,
        )
      );
  }
});

Deno.test("a branch reads the signal at its opposite node", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 10, 1: 1, 2: 3 },
  };
  const params = parameters({
    baseWeight: 0.05,
    fastInfluence: 2,
    outboundPolarity: 0,
  });
  const choices = choiceProbabilities(0, [1, 2], pheromones, params);
  const expected = (0.05 + 2 * 3) / (0.05 + 2 * 1);
  assert(
    Math.abs(choices[1].probability / choices[0].probability - expected) < 1e-9,
  );
});

Deno.test("a food pickup recruits from only its incoming signal", () => {
  assertEquals(competitiveFoodDeposit(0, 72, 0.72, 0.2), 14.4);
  assertEquals(competitiveFoodDeposit(14.4, 72, 0.72, 0.2), 0.72);
  assertEquals(competitiveFoodDeposit(0, 72, 0.72, 0), 0.72);

  const initial = testSimulation({
    seed: 31,
    params: {
      nodeCount: 24,
      density: 0.3,
      antCount: 8,
      newTrailSignalShare: 0.2,
    },
  });
  const food = initial.graph.foods[0];
  const neighbor = initial.graph.adjacency[food][0];
  const remote = initial.graph.nodes.find(({ id }) =>
    id !== food &&
    id !== neighbor &&
    !initial.graph.adjacency[food].includes(id)
  )?.id;
  assert(remote !== undefined);
  const ant = {
    ...initial.ants[0],
    node: food,
    launchDelay: 0,
    previous: neighbor,
    searchState: { kind: "follow" },
  };
  const stepped = stepSimulation({
    ...initial,
    ants: [ant],
    pheromones: {
      ...initial.pheromones,
      fast: {
        ...initial.pheromones.fast,
        [neighbor]: 10,
        [remote]: 1_000,
      },
    },
  }, 0.001);

  assert(Math.abs(stepped.ants[0].foodDeposit - 2) < 0.001);
});

Deno.test("a recruited new food branch remains a meaningful local option", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 72, 1: 72, 2: 14.4 },
    fastEdges: {
      [edgeKey(0, 1)]: 72,
      [edgeKey(0, 2)]: 14.4,
    },
  };
  const probability = (foodTrailModel) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({ foodTrailModel }),
    ).find(({ node }) => node === 2).probability;

  assert(probability("node") > 0.1);
  assert(probability("edge") > 0.1);
});

Deno.test("node food signal is visible only along traversed edges", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 0.7, 1: 100, 2: 1 },
    fastEdges: {
      [edgeKey(0, 1)]: 0,
      [edgeKey(0, 2)]: 0.7,
    },
  };
  const params = parameters({
    choiceFloor: 0,
    fastInfluence: 2,
    outboundPolarity: 4,
  });

  assertEquals(choiceProbabilities(1, [0], pheromones, params), []);
  assertEquals(
    choiceProbabilities(0, [1, 2], pheromones, params)
      .find(({ node }) => node === 1)?.probability,
    0,
  );
  const correction = choiceProbabilities(
    0,
    [1, 2],
    pheromones,
    { ...params, choiceFloor: 1 },
  );
  assert(
    correction.find(({ node }) => node === 2).probability >
      correction.find(({ node }) => node === 1).probability,
  );
});

Deno.test("the unmarked branch floor permits local error correction", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 0, 1: 1, 2: 0 },
  };
  const choices = (choiceFloor) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({ choiceFloor, fastInfluence: 2 }),
    );
  assertEquals(choices(0).find(({ node }) => node === 2)?.probability, 0);
  assert(choices(1).find(({ node }) => node === 2)?.probability > 0);
  assert(
    choices(1).find(({ node }) => node === 1)?.probability >
      choices(1).find(({ node }) => node === 2)?.probability,
  );
});

Deno.test("edge food trails are local, scalar, and undirected", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 0, 1: 0, 2: 0 },
    fastEdges: { [edgeKey(0, 1)]: 1, [edgeKey(0, 2)]: 3 },
  };
  const choices = (polarity) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({
        foodTrailModel: "edge",
        fastInfluence: 2,
        outboundPolarity: polarity,
      }),
    );
  const expected = (0.06 + 2 * 3) / (0.06 + 2 * 1);
  assert(
    Math.abs(choices(4)[1].probability / choices(4)[0].probability - expected) <
      1e-9,
  );
  assertEquals(choices(-4), choices(4));
  assertEquals(edgeKey(0, 1), edgeKey(1, 0));
});

Deno.test("polarity can climb, descend, or be ignored", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0 },
    fast: { 0: 2, 1: 1, 2: 4 },
  };
  const probabilities = (polarity) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({ fastInfluence: 0, outboundPolarity: polarity }),
    );
  assert(probabilities(4)[1].probability > probabilities(4)[0].probability);
  assert(probabilities(-4)[0].probability > probabilities(-4)[1].probability);
  assertEquals(probabilities(0), []);
});

Deno.test("scouts prefer uncharted endpoints before charted branches", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0, 2: 0, 3: 4, 99: 1_000 },
    slowEdges: {
      [edgeKey(0, 1)]: 0,
      [edgeKey(0, 2)]: 0,
      [edgeKey(0, 3)]: 1,
    },
    fast: { 0: 0, 1: 0, 2: 0, 3: 0 },
  };
  const choices = choiceProbabilities(
    0,
    [1, 2, 3],
    pheromones,
    parameters({
      exploreSignalBias: 4,
      unchartedPreference: 1,
      reversePenalty: 1,
    }),
    true,
  );

  assertEquals(choices.map(({ node }) => node), [1, 2, 3]);
  assertEquals(choices.map(({ probability }) => probability), [0.5, 0.5, 0]);
  assertEquals(
    choiceProbabilities(
      0,
      [1, 3],
      { ...pheromones, slow: { ...pheromones.slow, 1: undefined } },
      parameters({
        exploreSignalBias: 4,
        unchartedPreference: 1,
        reversePenalty: 1,
      }),
      true,
    ).map(({ probability }) => probability),
    [1, 0],
  );
});

Deno.test("charted scout fallback can avoid, ignore, or seek persistent signal", () => {
  const pheromones = {
    slow: { 0: 0.2, 1: 0.1, 2: 1 },
    slowEdges: {
      [edgeKey(0, 1)]: 1,
      [edgeKey(0, 2)]: 1,
    },
    fast: { 0: 0, 1: 0, 2: 0 },
  };
  const choices = (bias, previous = null) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({
        exploreSignalBias: bias,
        unchartedPreference: 1,
        reversePenalty: 0.1,
      }),
      true,
      previous,
    );
  assert(choices(-4)[0].probability > choices(-4)[1].probability);
  assert(choices(4)[1].probability > choices(4)[0].probability);
  assert(Math.abs(choices(0)[0].probability - 0.5) < 1e-9);
  assert(choices(0, 1)[1].probability > choices(0, 1)[0].probability);
});

Deno.test("edge coverage detects an unwalked route to a visited endpoint", () => {
  const choices = choiceProbabilities(
    0,
    [1, 2],
    {
      slow: { 0: 0.4, 1: 0.2, 2: 0.2 },
      slowEdges: {
        [edgeKey(0, 1)]: 1,
        [edgeKey(0, 2)]: 0,
      },
      fast: { 0: 0, 1: 0, 2: 0 },
    },
    parameters({
      exploreSignalBias: 0,
      unchartedPreference: 1,
    }),
    true,
  );

  assertEquals(choices.map(({ probability }) => probability), [0, 1]);
});

Deno.test("a scout treats its incoming edge as walked immediately", () => {
  const choices = choiceProbabilities(
    0,
    [1, 2],
    {
      slow: { 0: 0.4, 1: 0.2, 2: 0.2 },
      slowEdges: {
        [edgeKey(0, 1)]: 0,
        [edgeKey(0, 2)]: 0,
      },
      fast: { 0: 0, 1: 0, 2: 0 },
    },
    parameters({
      exploreSignalBias: 0,
      unchartedPreference: 1,
    }),
    true,
    1,
  );

  assertEquals(choices.map(({ probability }) => probability), [0, 1]);
});

Deno.test("only a frontier-armed scout can leave an exhausted frontier", () => {
  const initial = testSimulation({
    seed: 29,
    params: {
      antCount: 8,
      speed: 0.04,
      stopExploreChance: 0.95,
    },
  });
  const node = initial.graph.nodes.find(({ id }) =>
    id !== initial.graph.hill &&
    !initial.graph.foods.includes(id) &&
    initial.graph.adjacency[id].length > 1
  ).id;
  const neighbors = new Set(initial.graph.adjacency[node]);
  const slow = Object.fromEntries(
    initial.graph.nodes.map(({ id }) => [id, neighbors.has(id) ? 0.8 : 0.1]),
  );
  slow[initial.graph.hill] = 1;
  slow[node] = 0.4;
  const chance = explorationStopProbability(
    initial.params.stopExploreChance,
    0.25,
  );
  const rngSeed = Array.from({ length: 100 }, (_, seed) => seed).find((seed) =>
    nextRandom(seed)[0] < chance
  );
  const stateFor = (frontierArmed) => ({
    ...initial,
    rngSeed,
    pheromones: {
      ...initial.pheromones,
      slow,
      slowEdges: Object.fromEntries(
        initial.graph.edges.map(({ id }) => [id, 1]),
      ),
    },
    ants: [{
      ...initial.ants[0],
      node,
      searchState: { kind: "explore", frontierArmed },
    }],
  });

  const unarmed = stepSimulation(stateFor(false), 0.25).ants[0];
  assertEquals(unarmed.searchState, {
    kind: "explore",
    frontierArmed: false,
  });

  const armed = stepSimulation(stateFor(true), 0.25).ants[0];
  assertEquals(armed.searchState.kind, "escape");
  assertEquals(armed.edge.escaping, true);
  assert(
    slow[armed.edge.to] > slow[node],
    "Escape must choose a strictly higher home-potential endpoint",
  );
});

Deno.test("covered downhill travel never makes an armed scout retreat", () => {
  const initial = testSimulation({
    seed: 29,
    params: {
      antCount: 8,
      stopExploreChance: 0.95,
    },
  });
  const node = initial.graph.nodes.find(({ id }) =>
    id !== initial.graph.hill &&
    !initial.graph.adjacency[id].includes(initial.graph.hill) &&
    initial.graph.adjacency[id].length > 1
  ).id;
  const slow = Object.fromEntries(
    initial.graph.nodes.map(({ id }) => [
      id,
      id === initial.graph.hill ? 1 : id === node ? 0.4 : 0.2,
    ]),
  );
  const ant = {
    ...initial.ants[0],
    node,
    previous: initial.graph.adjacency[node][0],
    searchState: { kind: "explore", frontierArmed: true },
  };
  const stepped = stepSimulation({
    ...initial,
    pheromones: {
      ...initial.pheromones,
      slow,
      slowEdges: Object.fromEntries(
        initial.graph.edges.map(({ id }) => [id, 1]),
      ),
    },
    ants: [ant],
  }, 0.001).ants[0];

  assertEquals(stepped.searchState, {
    kind: "explore",
    frontierArmed: true,
  });
  assert(
    slow[stepped.edge.to] <= slow[node],
    "A covered outward branch must still count as exploration progress",
  );
});

Deno.test("choosing an unwalked edge arms the scout frontier", () => {
  const initial = testSimulation({
    seed: 37,
    params: {
      antCount: 8,
      stopExploreChance: 0,
      unchartedPreference: 1,
    },
  });
  const node = initial.graph.nodes.find(({ id }) =>
    id !== initial.graph.hill &&
    !initial.graph.foods.includes(id) &&
    initial.graph.adjacency[id].length > 1
  ).id;
  const previous = initial.graph.adjacency[node][0];
  const unwalked = initial.graph.adjacency[node][1];
  const ant = {
    ...initial.ants[0],
    node,
    previous,
    searchState: { kind: "explore", frontierArmed: false },
  };
  const stepped = stepSimulation({
    ...initial,
    pheromones: {
      ...initial.pheromones,
      slowEdges: Object.fromEntries(
        initial.graph.edges.map(({ id }) => [
          id,
          id === edgeKey(node, unwalked) ? 0 : 1,
        ]),
      ),
    },
    ants: [ant],
  }, 0.001).ants[0];

  assertEquals(stepped.edge.to, unwalked);
  assertEquals(stepped.searchState, {
    kind: "explore",
    frontierArmed: true,
  });
});

Deno.test("scouts can rejoin a locally usable food trail", () => {
  const resultFor = (trailJoinChance, signaled = true) => {
    const initial = testSimulation({
      seed: 43,
      params: {
        antCount: 8,
        choiceFloor: 0,
        exploreRate: 0,
        fastInfluence: 10,
        headingInfluence: 0,
        outboundPolarity: 0,
        trailJoinChance,
      },
    });
    const node = initial.graph.nodes.find(({ id }) =>
      id !== initial.graph.hill &&
      !initial.graph.foods.includes(id) &&
      initial.graph.adjacency[id].length > 1
    ).id;
    const target = initial.graph.adjacency[node][0];
    const ant = {
      ...initial.ants[0],
      node,
      launchDelay: 0,
      searchState: { kind: "explore", frontierArmed: true },
    };
    return {
      target,
      ant: stepSimulation({
        ...initial,
        pheromones: {
          ...initial.pheromones,
          fast: { ...initial.pheromones.fast, [target]: Number(signaled) },
          fastEdges: {
            ...initial.pheromones.fastEdges,
            [edgeKey(node, target)]: Number(signaled),
          },
          slowEdges: Object.fromEntries(
            initial.graph.edges.map(({ id }) => [id, 1]),
          ),
        },
        ants: [ant],
      }, 0.001).ants[0],
    };
  };

  const ignoring = resultFor(0).ant;
  assertEquals(ignoring.searchState.kind, "explore");
  assertEquals(ignoring.searchState.frontierArmed, true);

  const joining = resultFor(1);
  assertEquals(joining.ant.searchState, { kind: "follow" });
  assertEquals(joining.ant.edge.to, joining.target);

  assertEquals(resultFor(1, false).ant.searchState.kind, "explore");
});

Deno.test("escape ends and resets only at home", () => {
  const initial = testSimulation({
    seed: 31,
    params: { antCount: 8, speed: 0.65 },
  });
  const node = initial.graph.adjacency[initial.graph.hill].find((neighbor) =>
    !initial.graph.foods.includes(neighbor)
  );
  assert(node !== undefined);
  const edge = initial.graph.edgeById[edgeKey(node, initial.graph.hill)];
  const dt = Math.min(0.1, edge.length / (initial.params.speed * 2));
  const ant = {
    ...initial.ants[0],
    node,
    previous:
      initial.graph.adjacency[node].find((neighbor) =>
        neighbor !== initial.graph.hill
      ) ?? null,
    searchState: { kind: "escape" },
    edge: {
      from: node,
      to: initial.graph.hill,
      length: edge.length,
      progress: 1 - initial.params.speed * dt / edge.length,
      escaping: true,
    },
  };
  const stepped = stepSimulation({ ...initial, ants: [ant] }, dt);

  assertEquals(stepped.ants[0].node, initial.graph.hill);
  assertEquals(stepped.ants[0].edge, null);
  assertEquals(stepped.ants[0].searchState, { kind: "follow" });
});

Deno.test("default carriers ignore food signal and follow the home field", () => {
  const pheromones = {
    slow: { 0: 0.2, 1: 1, 2: 0.1 },
    fast: { 0: 0.1, 1: 0, 2: 100 },
    fastEdges: {},
  };
  const params = parameters({
    returnFastInfluence: 0,
    returnFastPolarity: 0,
    returnSlowInfluence: 3.09,
    returnSlowPolarity: 4,
    distanceInfluence: 0,
    reversePenalty: 1,
  });
  const choices = homewardProbabilities(
    0,
    [1, 2],
    pheromones,
    params,
  );

  assert(choices[0].probability > 0.99);
  assert(choices[1].probability < 0.01);
});

Deno.test("homeward priority can exclude or admit non-progress branches", () => {
  const pheromones = {
    slow: { 0: 0.4, 1: 0.8, 2: 0.2 },
    fast: { 0: 0, 1: 0, 2: 0 },
    fastEdges: {},
  };
  const choices = (homewardPreference) =>
    homewardProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({
        homewardPreference,
        returnFastInfluence: 0,
        returnFastPolarity: 0,
        returnSlowInfluence: 1,
        returnSlowPolarity: 0,
      }),
    );

  assertEquals(choices(1).map(({ probability }) => probability), [1, 0]);
  assert(choices(0).every(({ probability }) => probability > 0));
});

Deno.test("the scouting exit control is a frame-rate-independent probability", () => {
  const perSecond = explorationStopProbability(0.2, 1);
  const fourTicks = 1 - Math.pow(
    1 - explorationStopProbability(0.2, 0.25),
    4,
  );
  assert(Math.abs(perSecond - 0.2) < 1e-12);
  assert(Math.abs(perSecond - fourTicks) < 1e-12);
});

Deno.test("the whole colony leaves without route or visited-set memory", () => {
  const initial = testSimulation({ seed: 41 });
  const started = run(initial, initial.ants.length + 1, 1 / 60);
  assert(started.ants.every((ant) =>
    ant.launchDelay < 1e-9 &&
    ant.exploreChoices + ant.followChoices > 0 &&
    !Object.hasOwn(ant, "route") &&
    !Object.hasOwn(ant, "visited") &&
    ant.searchState.kind === "explore"
  ));
});

Deno.test("launch staggering lets later ants see the first edge trail", () => {
  const initial = testSimulation({
    seed: 41,
    params: {
      antCount: 64,
      speed: 0.04,
      unchartedPreference: 1,
    },
  });
  const started = stepSimulation(initial, 0.001);
  const homeNeighbors = initial.graph.adjacency[initial.graph.hill];
  const armed = (state) =>
    state.ants.filter((ant) => ant.searchState.frontierArmed === true);
  const coveredHomeEdges = (state) =>
    homeNeighbors.filter((neighbor) =>
      state.pheromones.slowEdges[edgeKey(initial.graph.hill, neighbor)] > 0
    );

  assertEquals(armed(started).length, 1);
  assertEquals(coveredHomeEdges(started).length, 1);
  assert(
    started.graph.nodes
      .filter(({ id }) => id !== initial.graph.hill)
      .every(({ id }) => started.pheromones.slow[id] === 0),
    "Coverage must be written on edge entry before node potential arrives",
  );

  const reversed = stepSimulation({
    ...initial,
    ants: initial.ants.toReversed(),
  }, 0.001);
  assertEquals(reversed.ants, started.ants);
  assertEquals(reversed.pheromones, started.pheromones);
  assertEquals(reversed.rngSeed, started.rngSeed);

  const spread = run(initial, homeNeighbors.length + 1, 1 / 60);
  assertEquals(armed(spread).length, homeNeighbors.length);
  assertEquals(coveredHomeEdges(spread).length, homeNeighbors.length);
});

Deno.test("food signal is deposited only after pickup", () => {
  let state = testSimulation({
    seed: 7,
    params: { speed: 0.65, antCount: 16 },
  });
  state = run(state, 2);
  assert(Object.values(state.pheromones.fast).every((value) => value === 0));
  assert(Object.values(state.pheromones.fastEdges).every((value) => value === 0));
  for (let step = 0; step < 2_000 && state.stats.discoveries === 0; step += 1) {
    state = stepSimulation(state, 0.25);
  }
  assert(state.stats.discoveries > 0);
  assert(Object.values(state.pheromones.fast).some((value) => value > 0));
  assert(Object.values(state.pheromones.fastEdges).some((value) => value > 0));
  assert(state.ants.some((ant) => ant.mode === "return"));
});

Deno.test("carriers deposit food signal only while making homeward progress", () => {
  const crossing = (destinationLevel, sourceLevel = 0.4) => {
    const initial = testSimulation({
      seed: 37,
      params: { antCount: 8, speed: 0.65 },
    });
    const edge = initial.graph.edges.find(({ a, b }) =>
      ![a, b].includes(initial.graph.hill) &&
      ![a, b].some((node) => initial.graph.foods.includes(node))
    );
    assert(edge);
    const dt = Math.min(0.1, edge.length / (initial.params.speed * 2));
    const slow = {
      ...initial.pheromones.slow,
      [edge.a]: sourceLevel,
      [edge.b]: destinationLevel,
    };
    const ant = {
      ...initial.ants[0],
      node: edge.a,
      mode: "return",
      searchState: { kind: "follow" },
      edge: {
        from: edge.a,
        to: edge.b,
        length: edge.length,
        progress: 1 - initial.params.speed * dt / edge.length,
        returnTrail: "signal",
      },
    };
    return {
      edge,
      state: stepSimulation({
        ...initial,
        pheromones: { ...initial.pheromones, slow },
        ants: [ant],
      }, dt),
    };
  };

  const { state: away } = crossing(0.2);
  assert(Object.values(away.pheromones.fast).every((value) => value === 0));
  assert(Object.values(away.pheromones.fastEdges).every((value) => value === 0));

  const { edge, state: homeward } = crossing(0.8);
  assert(Object.values(homeward.pheromones.fast).some((value) => value > 0));
  assert(Object.values(homeward.pheromones.fastEdges).some((value) => value > 0));
  assertEquals(
    Object.entries(homeward.pheromones.fastEdges)
      .filter(([, value]) => value > 0)
      .map(([key]) => key),
    [edge.id],
  );

  const { state: distantHomeward } = crossing(8e-20, 4e-20);
  assert(Object.values(distantHomeward.pheromones.fast).some((value) => value > 0));
});

Deno.test("food pickup reverses the incoming edge before local homing", () => {
  let state = testSimulation({ seed: 8, params: { speed: 0.65 } });
  let turnaround = null;
  for (let step = 0; step < 2_000 && turnaround === null; step += 1) {
    state = stepSimulation(state, 0.25);
    turnaround = state.ants.find((ant) =>
      ant.mode === "return" && ant.edge?.returnTrail === "turn"
    ) ?? null;
  }
  assert(turnaround !== null);
  assert(state.graph.foods.includes(turnaround.edge.from));
  assert(state.graph.adjacency[turnaround.edge.from].includes(turnaround.edge.to));
});

Deno.test("simulation exposes tagged pickup and delivery measurements", () => {
  let state = testSimulation({
    seed: 8,
    params: { speed: 0.65, antCount: 16 },
  });
  const events = [];
  let firstDiscovery = null;
  for (
    let step = 0;
    step < 2_000 &&
    !events.some(({ type, antId }) =>
      type === "delivery" && antId === firstDiscovery?.antId
    );
    step += 1
  ) {
    state = stepSimulation(state, 0.25);
    events.push(...state.lastEvents);
    firstDiscovery ??= events.find(({ type }) => type === "discovery") ?? null;
  }
  const discovery = firstDiscovery;
  const delivery = events.find(({ type, antId }) =>
    type === "delivery" && antId === discovery?.antId
  );

  assert(discovery !== undefined);
  assert(state.graph.foods.includes(discovery.food));
  assert(discovery.distance >= state.stats.shortestDistance);
  assert(delivery !== undefined);
  assert(delivery.distance >= discovery.distance + state.stats.shortestDistance);
  assert(
    state.ants.every((ant) =>
      !Object.hasOwn(ant, "route") && !Object.hasOwn(ant, "visited")
    ),
  );
});

Deno.test("clustered colonies form productive, predominantly short leading trails", () => {
  const results = Array.from({ length: 12 }, (_, seed) => {
    const final = run(testSimulation({ seed: seed + 1 }), 720);
    const dominant = dominantFoodRoute(final);
    assert(final.stats.deliveries > 0, `Seed ${seed + 1} made no delivery`);
    assert(dominant !== null, `Seed ${seed + 1} has no complete food trail`);
    return dominant.distance / final.stats.shortestDistance;
  });
  const mean = results.reduce((sum, ratio) => sum + ratio, 0) / results.length;
  assert(
    results.filter((ratio) => ratio <= 1.25).length >= 9 && mean <= 1.2,
    `Leading route ratios: ${results.map((ratio) => ratio.toFixed(3))}`,
  );
});

Deno.test("simulation transitions are immutable", () => {
  const initial = testSimulation({
    seed: 93,
    params: {
      nodeCount: 8,
      mapVariation: 0.7,
      density: 0.8,
      antCount: 48,
      speed: 0.6,
    },
  });
  const snapshot = JSON.stringify(initial);
  const final = run(initial, 240);
  assertEquals(JSON.stringify(initial), snapshot);
  assert(final.stats.discoveries > 0);
  assert(final.stats.deliveries > 0);
});

const adaptationFixture = () =>
  run(
    testSimulation({
      seed: 93,
      params: {
        nodeCount: 8,
        mapVariation: 0.7,
        density: 0.8,
        antCount: 24,
        speed: 0.6,
        fastHalfLife: 2,
      },
    }),
    200,
  );

const assertColonyContinues = (before, after) => {
  assert(after.ants === before.ants);
  assert(after.pheromones === before.pheromones);
  assertEquals(after.rngSeed, before.rngSeed);
  assertEquals(after.elapsed, before.elapsed);
  assertEquals(after.stats.deliveries, before.stats.deliveries);
};

Deno.test("food edits preserve the running colony", () => {
  const warm = adaptationFixture();
  const originalSnapshot = JSON.stringify(warm);
  const originalFood = warm.graph.foods[0];
  const added = addFood(warm, 1);
  assertColonyContinues(warm, added);
  const moved = moveFood(added, originalFood, 2);
  assertColonyContinues(added, moved);
  const removed = removeFood(moved, 1);
  assertColonyContinues(moved, removed);
  assertEquals(removed.graph.foods, [2]);
  assertEquals(JSON.stringify(warm), originalSnapshot);
});

Deno.test("food-trail storage switches without resetting the colony", () => {
  const warm = adaptationFixture();
  const changed = updateParams(warm, { foodTrailModel: "edge" });
  assert(changed.ants === warm.ants);
  assert(changed.pheromones === warm.pheromones);
  assertEquals(changed.elapsed, warm.elapsed);
  assertEquals(changed.stats, warm.stats);
  assertEquals(changed.params.foodTrailModel, "edge");
});

Deno.test("the colony adapts to moved food without resetting", () => {
  const warm = adaptationFixture();
  const source = warm.graph.foods[0];
  const destination = [6, 5, 4].find((node) =>
    node !== source && node !== warm.graph.hill
  );
  const oldSignal = warm.pheromones.fast[source];
  const moved = moveFood(warm, source, destination);
  const adapted = run(moved, 360);
  assert(adapted.stats.deliveries > warm.stats.deliveries);
  assert(adapted.stats.discoveries > warm.stats.discoveries);
  assert(adapted.pheromones.fast[destination] > 0);
  assert(adapted.pheromones.fast[source] < oldSignal);
  assert(foodProbabilitiesForNode(adapted, adapted.graph.hill).length > 0);
});

Deno.test("algorithm and map configurations round-trip independently", () => {
  const simulation = testSimulation({
    seed: 123,
    params: {
      mapVariation: 0.9,
      outboundPolarity: -2,
      exploreSignalBias: 3,
      foodTrailModel: "edge",
    },
    hill: 2,
    foods: [7],
  });
  const algorithm = algorithmPreset(simulation);
  const map = mapPreset(simulation);
  assertEquals(algorithm.engineId, simulation.engineId);
  assertEquals(algorithm.params.outboundPolarity, -2);
  assertEquals(algorithm.params.foodTrailModel, "edge");
  assert(!Object.hasOwn(algorithm.params, "mapVariation"));
  assertEquals(map.params.mapVariation, 0.9);
  assert(!Object.hasOwn(map.params, "outboundPolarity"));
  assert(!Object.hasOwn(map.params, "islandCount"));

  const configuration = sharedConfiguration(simulation);
  assertEquals(configuration.version, 2);
  assertEquals(
    decodeConfiguration(encodeConfiguration(configuration)),
    configuration,
  );
});

Deno.test("the playground exposes every requested decision and graph lever", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const css = await Deno.readTextFile(new URL("../styles.css", import.meta.url));
  [
    "exploreRate",
    "stopExploreChance",
    "exploreSignalBias",
    "unchartedPreference",
    "trailJoinChance",
    "reversePenalty",
    "headingInfluence",
    "distanceInfluence",
    "choiceFloor",
    "foodTrailModel",
    "newTrailSignalShare",
    "homeReinforcement",
    "fastInfluence",
    "outboundPolarity",
    "homewardPreference",
    "returnFastInfluence",
    "returnSlowInfluence",
    "returnFastPolarity",
    "returnSlowPolarity",
    "mapVariation",
    "algorithm-presets",
    "map-presets",
    "copy-share-link",
  ].forEach((id) => assert(html.includes(`id="${id}"`), `Missing ${id}`));
  ["islandCount", "islandSeparation", "islandLinks"].forEach((id) =>
    assert(!html.includes(`id="${id}"`), `Obsolete ${id}`)
  );
  assert(html.includes("signal-persistent"));
  assert(html.includes("signal-food"));
  assert(css.includes(".signal-persistent input"));
  assert(css.includes(".signal-food input"));
});

Deno.test("a selected node keeps its inspector above the long control stack", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const app = await Deno.readTextFile(new URL("../src/app.js", import.meta.url));
  const css = await Deno.readTextFile(new URL("../styles.css", import.meta.url));
  const inspector = html.indexOf('id="node-inspector"');

  assert(inspector > html.indexOf('class="control-card transport"'));
  assert(inspector < html.indexOf("LIVE RESULTS"));
  assert(inspector < html.indexOf("PLAYGROUND"));
  assert(
    app.includes(
      'byId("node-inspector").classList.toggle("has-selection", hasSelection)',
    ),
  );
  assert(/\.inspector\.has-selection\s*\{\s*position:\s*sticky;/u.test(css));
  assert(!/\.inspector\s*\{\s*position:\s*sticky;/u.test(css));
});

Deno.test("food visuals share one thin solid green palette", async () => {
  const app = await Deno.readTextFile(new URL("../src/app.js", import.meta.url));
  const css = await Deno.readTextFile(new URL("../styles.css", import.meta.url));

  assert(app.includes('const FOOD_COLOR = "#96b83f"'));
  assertEquals(app.match(/fillStyle = FOOD_COLOR/gu)?.length, 2);
  assert(app.includes("color: FOOD_COLOR"));
  assert(css.includes("--food: #96b83f"));
  assert(css.includes("--fast: var(--food)"));
  assert(/\.legend-fast\s*\{\s*background:\s*var\(--fast\);/u.test(css));
  assert(css.includes("background: rgb(150 184 63 / 28%)"));
  assertEquals(
    app.match(/width: \(intensity\) => 0\.5 \+ intensity \* 2\.6/gu)?.length,
    2,
  );
  assert(!app.includes("const drawLeadingRoute"));
  assert(!app.includes("drawLeadingRoute(current.simulation"));
  assert(!/color:\s*FOOD_COLOR[\s\S]*?dashed:\s*true/u.test(app));
});

Deno.test("every interactive control has help text", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const controlIds = [...html.matchAll(
    /<(?:button|input|select|canvas)\b[^>]*\bid="([^"]+)"/gu,
  )].map(([, id]) => id);

  assertEquals(controlIds.toSorted(), Object.keys(CONTROL_HELP).toSorted());
  Object.values(CONTROL_HELP).forEach((description) =>
    assert(description.length > 20, "Control help should explain behavior")
  );
});

Deno.test("saved map endpoints reproduce on the same graph recipe", () => {
  const source = testSimulation({ seed: 77 });
  const recipe = mapPreset(source);
  const copy = testSimulation({
    seed: recipe.seed,
    params: recipe.params,
    hill: recipe.hill,
    foods: recipe.foods,
  });
  assertEquals(copy.graph.nodes, source.graph.nodes);
  assertEquals(copy.graph.edges, source.graph.edges);
  assertEquals(copy.graph.hill, source.graph.hill);
  assertEquals(copy.graph.foods, source.graph.foods);
  assert(copy.graph.edgeById[edgeKey(copy.graph.edges[0].a, copy.graph.edges[0].b)]);
});

Deno.test("the research library contains readable PDFs and all cited papers", async () => {
  const directory = new URL("../docs/papers/", import.meta.url);
  const papers = [];
  for await (const entry of Deno.readDir(directory)) {
    if (entry.isFile && entry.name.endsWith(".pdf")) papers.push(entry.name);
  }
  assert(papers.length >= 10);
  [
    "2009-dussutour-multiple-pheromones.pdf",
    "2012-perna-individual-trail-rules.pdf",
    "2022-sakamoto-one-way-trails.pdf",
    "2023-garg-distributed-shortest-path.pdf",
  ].forEach((paper) => assert(papers.includes(paper), `Missing ${paper}`));

  for (const paper of papers) {
    const file = await Deno.open(new URL(paper, directory));
    const header = new Uint8Array(5);
    await file.read(header);
    file.close();
    assertEquals(new TextDecoder().decode(header), "%PDF-");
  }

  const index = await Deno.readTextFile(new URL("../docs/README.md", import.meta.url));
  assert(index.includes("10.1038/nature03105"));
});
