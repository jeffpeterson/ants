import { getEngine } from "./colony.js";
import { activeFoodsFor } from "./playground.js";

const positive = (value) => Number.isFinite(value) && value > 0;
const EMPTY_FIELD = Object.freeze({});

const currentTrailView = (simulation) => {
  const edgeFood = simulation.params.foodTrailModel === "edge";
  return {
    slow: {
      nodes: simulation.pheromones.slow,
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
        nodes: simulation.pheromones.fast,
        edges: EMPTY_FIELD,
        arcs: EMPTY_FIELD,
      },
  };
};

export const trailViewFor = (simulation) =>
  simulation.trailView === undefined
    ? currentTrailView(simulation)
    : simulation.trailView;

const nodeSegment = (channel, edge, view) => {
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

const exploringKinds = new Set([
  "backtrack",
  "discover",
  "escape",
  "explore",
  "probe",
]);

export const antViewFor = (simulation, ant) => ({
  id: ant.id,
  node: ant.node,
  edge: ant.edge === null ? null : {
    from: ant.edge.from,
    to: ant.edge.to,
    progress: Math.min(1, Math.max(0, Number(ant.edge.progress) || 0)),
  },
  returning: ant.mode === "return",
  exploring: ant.mode === "search" &&
    (
      ant.edge?.exploring === true ||
      exploringKinds.has(ant.searchState?.kind) ||
      (
        Number.isFinite(ant.scoutScore) &&
        ant.scoutScore < simulation.params.scoutRate
      )
    ),
});

const finiteOr = (fallback, value) => Number.isFinite(value) ? value : fallback;

export const metricsViewFor = (simulation, metrics) => ({
  ...metrics,
  deliveries: finiteOr(0, metrics.deliveries),
  discoveries: finiteOr(0, metrics.discoveries),
  selectedDistance: metrics.selectedDistance ?? metrics.bestDistance ?? null,
  selectedHops: finiteOr(
    0,
    metrics.selectedHops ?? metrics.bestHops,
  ),
  efficiency: finiteOr(0, metrics.efficiency),
  signalFocus: finiteOr(0, metrics.signalFocus),
  returning: finiteOr(0, metrics.returning),
  exploring: finiteOr(0, metrics.exploring ?? metrics.scouts),
  foods: getEngine(simulation.engineId).capabilities.multipleFoods
    ? finiteOr(activeFoodsFor(simulation).length, metrics.foods)
    : 1,
});
