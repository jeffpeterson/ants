import { deriveMetrics, edgeKey, ENGINES, stepSimulation } from "../src/colony.js";
import { createPlaygroundSimulation } from "../src/playground.js";
import {
  antStateCountsFor,
  antViewFor,
  metricsViewFor,
  trailSegments,
  trailStrength,
  trailViewFor,
} from "../src/presentation.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const map = {
  seed: 17,
  params: { nodeCount: 8, density: 0.3, mapVariation: 0.7 },
};

const emptyNodes = (graph) => Object.fromEntries(graph.nodes.map(({ id }) => [id, 0]));

const emptyEdges = (graph) => Object.fromEntries(graph.edges.map(({ id }) => [id, 0]));

Deno.test("weak home trails stay visible on the logarithmic scale", () => {
  assert(trailStrength("slow", 1e-30) > 0.008);
  assert(trailStrength("fast", 1e-30) < 0.008);
  assertEquals(trailStrength("slow", 0), 0);
});

Deno.test("synthetic home distances render as homeward closeness", () => {
  const initial = createPlaygroundSimulation({ map });
  const neighbor = initial.graph.adjacency[initial.graph.hill][0];
  const remote =
    initial.graph.nodes.find(({ id }) => id !== initial.graph.hill && id !== neighbor)
      .id;
  const state = {
    ...initial,
    params: { ...initial.params, homeSignalModel: "distance" },
    pheromones: {
      ...initial.pheromones,
      slow: {
        ...initial.pheromones.slow,
        [initial.graph.hill]: 0,
        [neighbor]: 0.5,
        [remote]: -1,
      },
    },
  };
  const nodes = trailViewFor(state).slow.nodes;

  assertEquals(nodes[initial.graph.hill], 1);
  assert(Math.abs(nodes[neighbor] - 2 / 3) < 1e-12);
  assertEquals(nodes[remote], 0);
});

Deno.test("current node and edge trail rendering retains scalar parity", () => {
  const initial = createPlaygroundSimulation({ map });
  const edge = initial.graph.edges[0];
  const slow = { ...emptyNodes(initial.graph), [edge.a]: 0.4, [edge.b]: 0.2 };
  const fast = { ...emptyNodes(initial.graph), [edge.a]: 0.1, [edge.b]: 0.3 };
  const fastEdges = { ...emptyEdges(initial.graph), [edge.id]: 0.25 };
  const nodeState = {
    ...initial,
    params: { ...initial.params, foodTrailModel: "node" },
    pheromones: { slow, fast, fastEdges },
  };
  const nodeView = trailViewFor(nodeState);

  assert(nodeView.slow.nodes === slow);
  assert(nodeView.fast.nodes === fast);
  assertEquals(
    trailSegments(nodeState).filter(({ edgeId }) => edgeId === edge.id),
    [
      {
        channel: "slow",
        kind: "node",
        edgeId: edge.id,
        from: edge.a,
        to: edge.b,
        fromLevel: 0.4,
        toLevel: 0.2,
        amount: 0.6000000000000001,
      },
      {
        channel: "fast",
        kind: "node",
        edgeId: edge.id,
        from: edge.a,
        to: edge.b,
        fromLevel: 0.1,
        toLevel: 0.3,
        amount: 0.4,
      },
    ],
  );

  const edgeState = {
    ...nodeState,
    params: { ...nodeState.params, foodTrailModel: "edge" },
  };
  const edgeView = trailViewFor(edgeState);
  const fastSegments = trailSegments(edgeState).filter(({ channel }) =>
    channel === "fast"
  );
  assert(edgeView.fast.edges === fastEdges);
  assertEquals(fastSegments, [{
    channel: "fast",
    kind: "edge",
    edgeId: edge.id,
    from: edge.a,
    to: edge.b,
    fromLevel: 0.25,
    toLevel: 0.25,
    amount: 0.5,
  }]);

  const ant = antViewFor(initial, initial.ants[0]);
  assertEquals(ant.state, "scouting");
  assertEquals(ant.exploring, true);
  assertEquals(ant.returning, false);
  assertEquals(ant.scouting, true);
  assertEquals(ant.frontier, false);
  assertEquals(ant.escaping, false);
  assertEquals(ant.node, initial.graph.hill);
  assertEquals(antStateCountsFor(initial), {
    following: 0,
    scouting: initial.ants.length,
    frontier: 0,
    escaping: 0,
    carrying: 0,
  });
});

Deno.test("node food rendering excludes adjacent untraversed edges", () => {
  const initial = createPlaygroundSimulation({ map });
  const junction = initial.graph.nodes.find(({ id }) =>
    initial.graph.adjacency[id].length > 1
  );
  assert(junction);
  const [traversed, adjacent] = initial.graph.adjacency[junction.id];
  const traversedEdge = edgeKey(junction.id, traversed);
  const adjacentEdge = edgeKey(junction.id, adjacent);
  const state = {
    ...initial,
    params: { ...initial.params, foodTrailModel: "node" },
    pheromones: {
      ...initial.pheromones,
      fast: {
        ...initial.pheromones.fast,
        [junction.id]: 0.7,
        [traversed]: 1,
      },
      fastEdges: {
        ...initial.pheromones.fastEdges,
        [traversedEdge]: 0.7,
      },
    },
  };
  const fastEdges = trailSegments(state)
    .filter(({ channel }) => channel === "fast")
    .map(({ edgeId }) => edgeId);

  assert(fastEdges.includes(traversedEdge));
  assert(!fastEdges.includes(adjacentEdge));
});

Deno.test("all engine schemas normalize trails, ants, and metrics for rendering", () => {
  ENGINES.forEach((engine) => {
    let simulation = createPlaygroundSimulation({
      engineId: engine.id,
      params: { antCount: 8, speed: 0.3 },
      map,
    });
    simulation = Array.from({ length: 8 }).reduce(
      (state) => stepSimulation(state, 0.25),
      simulation,
    );
    const trailView = trailViewFor(simulation);
    ["slow", "fast"].forEach((channel) => {
      ["nodes", "edges", "arcs"].forEach((field) =>
        assert(
          trailView[channel][field] !== null &&
            typeof trailView[channel][field] === "object",
          `${engine.id}.${channel}.${field}`,
        )
      );
    });
    trailSegments(simulation).forEach((segment) => {
      assert(["node", "edge", "arc"].includes(segment.kind));
      assert(Number.isFinite(segment.amount));
      assert(Object.hasOwn(simulation.graph.adjacency, segment.from));
      assert(Object.hasOwn(simulation.graph.adjacency, segment.to));
    });
    simulation.ants.forEach((ant) => {
      const view = antViewFor(simulation, ant);
      assert(Number.isInteger(view.id));
      assert(typeof view.returning === "boolean");
      assert(typeof view.exploring === "boolean");
      assert(typeof view.scouting === "boolean");
      assert(typeof view.frontier === "boolean");
      assert(typeof view.escaping === "boolean");
      assert(
        ["following", "scouting", "frontier", "escaping", "carrying"].includes(
          view.state,
        ),
      );
      if (view.edge !== null) {
        assert(Number.isFinite(view.edge.progress));
        assert(view.edge.progress >= 0 && view.edge.progress <= 1);
      }
    });
    const metrics = metricsViewFor(simulation, deriveMetrics(simulation));
    [
      "deliveries",
      "discoveries",
      "selectedHops",
      "efficiency",
      "signalFocus",
      "returning",
      "exploring",
      "following",
      "scouting",
      "frontier",
      "escaping",
      "carrying",
      "foods",
    ].forEach((key) => assert(Number.isFinite(metrics[key]), `${engine.id}.${key}`));
    assertEquals(
      metrics.following +
        metrics.scouting +
        metrics.frontier +
        metrics.escaping +
        metrics.carrying,
      simulation.ants.length,
      `${engine.id} state counts must partition the colony`,
    );
    assert(
      metrics.selectedDistance === null ||
        Number.isFinite(metrics.selectedDistance),
    );
  });
});
