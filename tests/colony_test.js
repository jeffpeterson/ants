import {
  addFood,
  choiceProbabilities,
  createSimulation,
  decayPheromones,
  dominantFoodRoute,
  edgeKey,
  explorationStopProbability,
  foodProbabilitiesForNode,
  generateGraph,
  isConnected,
  moveFood,
  nextRandom,
  removeFood,
  stepSimulation,
  trailGradient,
} from "../src/colony.js";
import {
  algorithmPreset,
  decodeConfiguration,
  encodeConfiguration,
  mapPreset,
  sharedConfiguration,
} from "../src/config.js";

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

const parameters = (patch = {}) => ({
  ...createSimulation({ seed: 1 }).params,
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

Deno.test("scouting can avoid, ignore, or seek persistent signal", () => {
  const pheromones = {
    slow: { 0: 0, 1: 0.1, 2: 1 },
    fast: { 0: 0, 1: 0, 2: 0 },
  };
  const choices = (bias, previous = null) =>
    choiceProbabilities(
      0,
      [1, 2],
      pheromones,
      parameters({ exploreSignalBias: bias, reversePenalty: 0.1 }),
      true,
      previous,
    );
  assert(choices(-4)[0].probability > choices(-4)[1].probability);
  assert(choices(4)[1].probability > choices(4)[0].probability);
  assert(Math.abs(choices(0)[0].probability - 0.5) < 1e-9);
  assert(choices(0, 1)[1].probability > choices(0, 1)[0].probability);
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
  const initial = createSimulation({ seed: 41 });
  const started = stepSimulation(initial, 1 / 30);
  assertEquals(
    started.ants.filter(({ edge }) => edge !== null).length,
    initial.ants.length,
  );
  assert(started.ants.every((ant) =>
    !Object.hasOwn(ant, "route") &&
    !Object.hasOwn(ant, "visited") &&
    ant.searchState.kind === "explore"
  ));
});

Deno.test("food signal is deposited only after pickup", () => {
  let state = createSimulation({
    seed: 7,
    params: { speed: 0.65, antCount: 16 },
  });
  state = run(state, 2);
  assert(Object.values(state.pheromones.fast).every((value) => value === 0));
  for (let step = 0; step < 2_000 && state.stats.discoveries === 0; step += 1) {
    state = stepSimulation(state, 0.25);
  }
  assert(state.stats.discoveries > 0);
  assert(Object.values(state.pheromones.fast).some((value) => value > 0));
  assert(state.ants.some((ant) => ant.mode === "return"));
});

Deno.test("food pickup reverses the incoming edge before local homing", () => {
  let state = createSimulation({ seed: 8, params: { speed: 0.65 } });
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

Deno.test("clustered colonies form productive, mostly efficient leading trails", () => {
  const results = Array.from({ length: 12 }, (_, seed) => {
    const final = run(createSimulation({ seed: seed + 1 }), 720);
    const dominant = dominantFoodRoute(final);
    assert(final.stats.deliveries > 0, `Seed ${seed + 1} made no delivery`);
    assert(dominant !== null, `Seed ${seed + 1} has no complete food trail`);
    return dominant.distance / final.stats.shortestDistance;
  });
  assert(
    results.filter((ratio) => ratio <= 1.25).length >= 10,
    `Leading route ratios: ${results.map((ratio) => ratio.toFixed(3))}`,
  );
});

Deno.test("simulation transitions are immutable", () => {
  const initial = createSimulation({
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
    createSimulation({
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
  const simulation = createSimulation({
    seed: 123,
    params: {
      mapVariation: 0.9,
      outboundPolarity: -2,
      exploreSignalBias: 3,
    },
    hill: 2,
    foods: [7],
  });
  const algorithm = algorithmPreset(simulation);
  const map = mapPreset(simulation);
  assertEquals(algorithm.outboundPolarity, -2);
  assert(!Object.hasOwn(algorithm, "mapVariation"));
  assertEquals(map.params.mapVariation, 0.9);
  assert(!Object.hasOwn(map.params, "outboundPolarity"));
  assert(!Object.hasOwn(map.params, "islandCount"));

  const configuration = sharedConfiguration(simulation);
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
    "reversePenalty",
    "headingInfluence",
    "distanceInfluence",
    "fastInfluence",
    "outboundPolarity",
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

Deno.test("saved map endpoints reproduce on the same graph recipe", () => {
  const source = createSimulation({ seed: 77 });
  const recipe = mapPreset(source);
  const copy = createSimulation({
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
