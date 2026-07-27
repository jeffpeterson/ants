import { foodCloseness, getEngine, homeCloseness } from "./colony.js";
import { activeFoodsFor } from "./playground.js";

const positive = (value) => Number.isFinite(value) && value > 0;
const EMPTY_FIELD = Object.freeze({});
const mapField = (field, transform) =>
  Object.fromEntries(
    Object.entries(field).map(([key, value]) => [key, transform(value)]),
  );

export const trailStrength = (channel, value) => {
  if (!positive(value)) return 0;
  return channel === "slow"
    ? 1 / (3 + 0.25 * Math.max(0, -Math.log(value)))
    : 1 - Math.exp(-value * 0.42);
};

const currentTrailView = (simulation) => {
  const edgeFood = simulation.params.foodTrailModel === "edge";
  const homeNodes = simulation.params.homeSignalModel === "distance"
    ? mapField(
      simulation.pheromones.slow,
      (value) => homeCloseness(value, "distance"),
    )
    : simulation.pheromones.slow;
  const distanceFood = simulation.params.foodTrailModel === "distance";
  const foodLevel = (value) =>
    foodCloseness(
      value,
      simulation.params.foodTrailModel,
      simulation.params.foodHalfDistance,
    );
  const foodNodes = distanceFood
    ? mapField(simulation.pheromones.fast, foodLevel)
    : simulation.pheromones.fast;
  const foodEdges = distanceFood
    ? mapField(simulation.pheromones.fastEdges, foodLevel)
    : simulation.pheromones.fastEdges;
  return {
    slow: {
      nodes: homeNodes,
      edges: EMPTY_FIELD,
      arcs: EMPTY_FIELD,
    },
    fast: edgeFood
      ? {
        nodes: EMPTY_FIELD,
        edges: simulation.pheromones.fastEdges,
        arcs: EMPTY_FIELD,
      }
      : {
        nodes: foodNodes,
        edges: EMPTY_FIELD,
        arcs: EMPTY_FIELD,
        edgeMask: foodEdges,
      },
  };
};

export const trailViewFor = (simulation) =>
  simulation.trailView === undefined
    ? currentTrailView(simulation)
    : simulation.trailView;

const nodeSegment = (channel, edge, view) => {
  if (view.edgeMask !== undefined && !positive(view.edgeMask[edge.id])) return [];
  const fromLevel = view.nodes[edge.a] ?? 0;
  const toLevel = view.nodes[edge.b] ?? 0;
  return positive(fromLevel + toLevel)
    ? [{
      channel,
      kind: "node",
      edgeId: edge.id,
      from: edge.a,
      to: edge.b,
      fromLevel,
      toLevel,
      amount: fromLevel + toLevel,
    }]
    : [];
};

const edgeSegment = (channel, edge, view) => {
  const level = view.edges[edge.id] ?? 0;
  return positive(level)
    ? [{
      channel,
      kind: "edge",
      edgeId: edge.id,
      from: edge.a,
      to: edge.b,
      fromLevel: level,
      toLevel: level,
      amount: level * 2,
    }]
    : [];
};

const arcSegments = (channel, edge, view) =>
  [
    [edge.a, edge.b],
    [edge.b, edge.a],
  ].flatMap(([from, to]) => {
    const level = view.arcs[`${from}>${to}`] ?? 0;
    return positive(level)
      ? [{
        channel,
        kind: "arc",
        edgeId: edge.id,
        from,
        to,
        fromLevel: 0,
        toLevel: level,
        amount: level,
      }]
      : [];
  });

export const trailSegments = (simulation) => {
  const view = trailViewFor(simulation);
  return ["slow", "fast"].flatMap((channel) =>
    simulation.graph.edges.flatMap((edge) => [
      ...nodeSegment(channel, edge, view[channel]),
      ...edgeSegment(channel, edge, view[channel]),
      ...arcSegments(channel, edge, view[channel]),
    ])
  );
};

const escapingKinds = new Set([
  "backtrack",
  "escape",
]);

const scoutingKinds = new Set([
  "discover",
  "explore",
  "probe",
]);

export const antStateFor = (simulation, ant) => {
  if (ant.mode === "return") return "carrying";
  if (escapingKinds.has(ant.searchState?.kind)) return "escaping";
  if (
    ant.searchState?.kind === "explore" &&
    ant.searchState.frontierArmed === true
  ) {
    return "frontier";
  }
  if (
    ant.mode === "search" &&
    (
      ant.edge?.exploring === true ||
      scoutingKinds.has(ant.searchState?.kind) ||
      (
        Number.isFinite(ant.scoutScore) &&
        ant.scoutScore < simulation.params.scoutRate
      )
    )
  ) {
    return "scouting";
  }
  return "following";
};

const EMPTY_ANT_STATES = Object.freeze({
  following: 0,
  scouting: 0,
  frontier: 0,
  escaping: 0,
  carrying: 0,
});

export const antStateCountsFor = (simulation) =>
  simulation.ants.reduce(
    (counts, ant) => {
      const state = antStateFor(simulation, ant);
      return { ...counts, [state]: counts[state] + 1 };
    },
    EMPTY_ANT_STATES,
  );

export const antViewFor = (simulation, ant) => {
  const state = antStateFor(simulation, ant);
  return {
    id: ant.id,
    node: ant.node,
    edge: ant.edge === null ? null : {
      from: ant.edge.from,
      to: ant.edge.to,
      progress: Math.min(1, Math.max(0, Number(ant.edge.progress) || 0)),
    },
    state,
    returning: state === "carrying",
    exploring: state === "scouting" || state === "frontier",
    scouting: state === "scouting",
    frontier: state === "frontier",
    escaping: state === "escaping",
  };
};

const finiteOr = (fallback, value) => Number.isFinite(value) ? value : fallback;

export const metricsViewFor = (simulation, metrics) => {
  const states = antStateCountsFor(simulation);
  return {
    ...metrics,
    ...states,
    deliveries: finiteOr(0, metrics.deliveries),
    discoveries: finiteOr(0, metrics.discoveries),
    selectedDistance: metrics.selectedDistance ?? metrics.bestDistance ?? null,
    selectedHops: finiteOr(
      0,
      metrics.selectedHops ?? metrics.bestHops,
    ),
    efficiency: finiteOr(0, metrics.efficiency),
    signalFocus: finiteOr(0, metrics.signalFocus),
    returning: states.carrying,
    exploring: states.scouting + states.frontier + states.escaping,
    foods: getEngine(simulation.engineId).capabilities.multipleFoods
      ? finiteOr(activeFoodsFor(simulation).length, metrics.foods)
      : 1,
  };
};
