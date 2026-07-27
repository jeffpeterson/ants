import {
  addFood,
  clearPheromones,
  CURRENT_ENGINE_ID,
  deriveMetrics,
  dominantFoodRoute,
  ENGINES,
  foodProbabilitiesForNode,
  getEngine,
  moveFood,
  removeFood,
  resetRun,
  setEndpoint,
  stepSimulation,
  supportsEngineParameter,
  updateParams,
} from "./colony.js";
import {
  algorithmPreset,
  decodeConfiguration,
  encodeConfiguration,
  GRAPH_KEYS,
  mapPreset,
  migrateAlgorithmPresetLibrary,
  sharedConfiguration,
} from "./config.js";
import { CONTROL_HELP } from "./help.js";
import {
  BUILT_IN_ALGORITHM_PRESETS,
  parsePresetRef,
  presetRef,
  resolveAlgorithmPreset,
} from "./presets.js";
import { sanitizeSimulationRate, simulatedSeconds } from "./clock.js";
import {
  activeFoodsFor,
  createPlaygroundSimulation,
  engineLabel,
  engineNote,
  engineSwitchNotice,
  engineTooltip,
  shortRevision,
  switchSimulationEngine,
} from "./playground.js";
import { antViewFor, metricsViewFor, trailSegments } from "./presentation.js";

const byId = (id) => document.getElementById(id);

Object.entries(CONTROL_HELP).forEach(([id, description]) => {
  const control = byId(id);
  control.title = description;
  control.setAttribute("aria-description", description);
});

const canvas = byId("colony-canvas");
const context = canvas.getContext("2d");
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const readSeed = () => Number(byId("seed").value) >>> 0;
const sharedHash = location.hash.startsWith("#state=")
  ? decodeConfiguration(location.hash.slice(7))
  : null;
const initialSeed = sharedHash?.map.seed ?? readSeed();
const initialEngineId = ENGINES.some(({ id }) => id === sharedHash?.algorithm.engineId)
  ? sharedHash.algorithm.engineId
  : CURRENT_ENGINE_ID;
byId("seed").value = initialSeed;

const initialSimulation = createPlaygroundSimulation({
  engineId: initialEngineId,
  params: sharedHash?.algorithm.params,
  map: {
    seed: initialSeed,
    params: sharedHash?.map.params,
    hill: sharedHash?.map.hill,
    foods: sharedHash?.map.foods,
  },
});

let model = {
  simulation: initialSimulation,
  graphParams: initialSimulation.graphParams,
  running: !prefersReducedMotion,
  simulationRate: 1,
  selectedNode: null,
  movingFood: null,
  notice: "",
  view: { ants: true, trails: true, labels: true },
};

const replaceSimulation = (
  current,
  simulation,
  graphParams = simulation.graphParams,
) => ({
  ...current,
  simulation,
  graphParams,
  selectedNode: null,
  movingFood: null,
  notice: "",
});

const reduceModel = (current, action) => {
  switch (action.type) {
    case "toggle":
      return { ...current, running: !current.running };
    case "simulationRate":
      return {
        ...current,
        simulationRate: sanitizeSimulationRate(action.value),
      };
    case "advance":
      return current.running
        ? {
          ...current,
          simulation: stepSimulation(current.simulation, action.dt),
        }
        : current;
    case "step":
      return {
        ...current,
        simulation: stepSimulation(current.simulation, 1 / 15),
      };
    case "newGraph":
      return replaceSimulation(
        current,
        createPlaygroundSimulation({
          engineId: current.simulation.engineId,
          params: current.simulation.params,
          map: {
            seed: action.seed,
            params: current.graphParams,
          },
        }),
      );
    case "reset":
      return replaceSimulation(
        current,
        resetRun(current.simulation),
        current.graphParams,
      );
    case "clear":
      return {
        ...current,
        simulation: clearPheromones(current.simulation),
      };
    case "parameter":
      if (GRAPH_KEYS.includes(action.name)) {
        return {
          ...current,
          graphParams: {
            ...current.graphParams,
            [action.name]: action.value,
          },
        };
      }
      if (
        !supportsEngineParameter(
          getEngine(current.simulation.engineId),
          action.name,
        )
      ) {
        return current;
      }
      return {
        ...current,
        simulation: updateParams(current.simulation, {
          [action.name]: action.value,
        }),
      };
    case "engine": {
      const engine = getEngine(action.engineId);
      const simulation = switchSimulationEngine(
        current.simulation,
        action.engineId,
      );
      return simulation === current.simulation ? current : {
        ...replaceSimulation(current, simulation, current.graphParams),
        notice: engineSwitchNotice(engine),
      };
    }
    case "algorithmPreset": {
      const switched = action.engineId !== current.simulation.engineId;
      const simulation = switched
        ? switchSimulationEngine(
          current.simulation,
          action.engineId,
          action.params,
        )
        : updateParams(current.simulation, action.params);
      const engine = getEngine(action.engineId);
      return switched
        ? {
          ...replaceSimulation(current, simulation, current.graphParams),
          notice: `Loaded “${action.name}”. ${engineSwitchNotice(engine)}`,
        }
        : {
          ...current,
          simulation,
          notice: `Loaded algorithm “${action.name}”.`,
        };
    }
    case "mapPreset":
      return {
        ...replaceSimulation(
          current,
          createPlaygroundSimulation({
            engineId: current.simulation.engineId,
            params: current.simulation.params,
            map: action.map,
          }),
        ),
        notice: `Loaded map “${action.name}”.`,
      };
    case "select":
      return action.place && current.movingFood !== null
        ? reduceModel(current, { type: "placeFood", node: action.node })
        : { ...current, selectedNode: action.node };
    case "endpoint":
      return replaceSimulation(
        current,
        setEndpoint(current.simulation, action.kind, current.selectedNode),
        current.graphParams,
      );
    case "addFood": {
      const simulation = addFood(current.simulation, current.selectedNode);
      return {
        ...current,
        simulation,
        notice: simulation === current.simulation
          ? "That node cannot hold food."
          : `Added food at Node ${String(current.selectedNode + 1).padStart(2, "0")}.`,
      };
    }
    case "removeFood": {
      const simulation = removeFood(current.simulation, current.selectedNode);
      return {
        ...current,
        simulation,
        notice: simulation === current.simulation
          ? "At least one food source must remain."
          : `Removed food from Node ${
            String(current.selectedNode + 1).padStart(2, "0")
          }.`,
      };
    }
    case "beginFoodMove":
      return {
        ...current,
        movingFood: current.selectedNode,
        notice: `Moving food from Node ${
          String(current.selectedNode + 1).padStart(2, "0")
        }. Select its destination.`,
      };
    case "cancelFoodMove":
      return {
        ...current,
        movingFood: null,
        notice: "Food move cancelled.",
      };
    case "placeFood": {
      if (current.movingFood === null || action.node === null) return current;
      const simulation = moveFood(
        current.simulation,
        current.movingFood,
        action.node,
      );
      const resets = getEngine(current.simulation.engineId).capabilities.liveFood ===
        "reset";
      return simulation === current.simulation
        ? {
          ...current,
          selectedNode: action.node,
          notice: "Choose a junction that is not home or another food source.",
        }
        : {
          ...current,
          simulation,
          selectedNode: action.node,
          movingFood: null,
          notice: resets
            ? `Food moved to Node ${
              String(action.node + 1).padStart(2, "0")
            }. This revision reset its ants and trails.`
            : `Food moved to Node ${
              String(action.node + 1).padStart(2, "0")
            }. Old trails will fade naturally.`,
        };
    }
    case "view":
      return {
        ...current,
        view: { ...current.view, [action.name]: action.value },
      };
    case "notice":
      return { ...current, notice: action.notice };
    default:
      return current;
  }
};

const dispatch = (action) => {
  model = reduceModel(model, action);
  updateSharedUrl(model.simulation);
  syncControls(model);
  renderInterface(model);
};

const formatDistance = (value) => value === null ? "—" : `${value.toFixed(2)} u`;

const formatPercent = (value) => `${Math.round(value * 100)}%`;

const statusCopy = (current, metrics) => {
  if (!current.running) return "Paused — inspect the signal or advance one step.";
  if (
    (current.simulation.stats.lastFoodChangeAt ?? null) !== null &&
    current.simulation.stats.bestDistance === null
  ) {
    return "Food changed. Old signals remain while the colony searches and adapts.";
  }
  if (metrics.deliveries === 0 && metrics.discoveries === 0) {
    return "The whole colony is scouting locally uncharted branches.";
  }
  if (metrics.deliveries === 0) {
    return "Food found. Carriers are extending the food field.";
  }
  return `${metrics.deliveries} deliveries · ${
    formatPercent(metrics.efficiency)
  } route efficiency`;
};

const setText = (id, value) => {
  byId(id).textContent = value;
};

const renderMetrics = (current) => {
  const metrics = metricsViewFor(
    current.simulation,
    deriveMetrics(current.simulation),
  );
  setText("delivery-count", metrics.deliveries);
  setText("following-count", metrics.following);
  setText("scouting-count", metrics.scouting);
  setText("frontier-count", metrics.frontier);
  setText("escaping-count", metrics.escaping);
  setText("carrying-count", metrics.carrying);
  setText("best-distance", formatDistance(metrics.selectedDistance));
  setText(
    "best-hops",
    metrics.selectedDistance === null ? "—" : metrics.selectedHops,
  );
  setText("efficiency", formatPercent(metrics.efficiency));
  setText("signal-focus", formatPercent(metrics.signalFocus));
  setText("food-count", metrics.foods);
  setText("stage-status", statusCopy(current, metrics));
  setText("runtime", `${current.simulation.elapsed.toFixed(1)} s`);
  byId("run-state").dataset.running = String(current.running);
  setText("run-state", current.running ? "RUNNING" : "PAUSED");
  setText("toggle-label", current.running ? "Pause colony" : "Run colony");
  byId("toggle-run").setAttribute("aria-pressed", String(current.running));
  setText("environment-status", current.notice);
};

const probabilityRow = ({ node, probability }) => {
  const item = document.createElement("li");
  const label = document.createElement("span");
  const meter = document.createElement("span");
  const fill = document.createElement("span");
  const value = document.createElement("output");
  label.textContent = `Node ${String(node + 1).padStart(2, "0")}`;
  meter.className = "probability-meter";
  fill.style.width = formatPercent(probability);
  meter.append(fill);
  value.textContent = formatPercent(probability);
  item.append(label, meter, value);
  return item;
};

const renderInspector = (current) => {
  const { selectedNode, simulation } = current;
  const empty = byId("inspector-empty");
  const content = byId("inspector-content");
  const hasSelection = selectedNode !== null;
  byId("node-inspector").classList.toggle("has-selection", hasSelection);
  empty.hidden = hasSelection;
  content.hidden = !hasSelection;
  if (!hasSelection) return;

  const degree = simulation.graph.adjacency[selectedNode].length;
  const isFood = simulation.graph.foods.includes(selectedNode);
  const isActiveFood = activeFoodsFor(simulation).includes(selectedNode);
  const engine = getEngine(simulation.engineId);
  const moving = current.movingFood !== null;
  const role = selectedNode === simulation.graph.hill
    ? "Colony home"
    : isFood
    ? "Food source"
    : "Junction";
  setText("selected-title", `Node ${String(selectedNode + 1).padStart(2, "0")}`);
  setText("selected-meta", `${role} · ${degree} connected edges`);
  byId("set-home").disabled = moving ||
    selectedNode === simulation.graph.hill || isFood;
  byId("add-food").hidden = !engine.capabilities.multipleFoods || moving || isFood ||
    selectedNode === simulation.graph.hill;
  byId("move-food").hidden = moving || !isActiveFood;
  byId("remove-food").hidden = !engine.capabilities.multipleFoods || moving ||
    !isFood;
  byId("remove-food").disabled = simulation.graph.foods.length === 1;
  byId("food-action-help").textContent = engine.id === "A0"
    ? isActiveFood
      ? "A0 follows one food; moving it resets ants and trails."
      : isFood
      ? "A0 parks this food while its first food remains active."
      : "A0 supports one active food source."
    : isFood && simulation.graph.foods.length === 1
    ? "Move the last food source instead of removing it."
    : "";
  const rows = foodProbabilitiesForNode(simulation, selectedNode)
    .map(probabilityRow);
  byId("probabilities").replaceChildren(...rows);
  byId("probability-empty").hidden = rows.length > 0;
};

const renderInterface = (current) => {
  renderMetrics(current);
  renderInspector(current);
  const moving = current.movingFood !== null;
  setText(
    "canvas-note-text",
    moving ? "SELECT A FOOD DESTINATION" : "CLICK A NODE TO INSPECT",
  );
  byId("cancel-food-move").hidden = !moving;
  canvas.setAttribute(
    "aria-label",
    moving
      ? "Select a junction as the new food destination. Press Escape to cancel."
      : "Random graph with ants traveling between their home and food. Click a node to inspect it; arrow keys move the selection.",
  );
};

const canvasSize = () => {
  const bounds = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(bounds.width * ratio));
  const height = Math.max(1, Math.round(bounds.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { width: bounds.width, height: bounds.height };
};

const project = ({ x, y }, size) => ({
  x: 34 + x * (size.width - 68),
  y: 28 + y * (size.height - 56),
});

const line = (ctx, from, to) => {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
};

const strength = (value) => 1 - Math.exp(-value * 0.42);

const drawBaseEdges = (simulation, points) => {
  context.save();
  context.strokeStyle = "#9ca6a3";
  context.globalAlpha = 0.34;
  context.lineWidth = 1;
  simulation.graph.edges.forEach((edge) =>
    line(context, points[edge.a], points[edge.b])
  );
  context.restore();
};

const routePairs = (route) => route.slice(1).map((node, index) => [route[index], node]);

const drawLeadingRoute = (simulation, points) => {
  const leading = dominantFoodRoute(simulation);
  if (leading === null) return;
  context.save();
  context.strokeStyle = "#087f8c";
  context.globalAlpha = 0.09;
  context.lineWidth = 12;
  context.lineCap = "round";
  routePairs(leading.route).forEach(([from, to]) =>
    line(context, points[from], points[to])
  );
  context.restore();
};

const offsetArc = (from, to, amount = 3.2) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const offset = { x: (-dy / length) * amount, y: (dx / length) * amount };
  return [
    { x: from.x + offset.x, y: from.y + offset.y },
    { x: to.x + offset.x, y: to.y + offset.y },
  ];
};

const pointAlong = (from, to, amount) => ({
  x: from.x + (to.x - from.x) * amount,
  y: from.y + (to.y - from.y) * amount,
});

const drawArrow = (from, to, intensity, color) => {
  const point = pointAlong(from, to, 0.66);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 3.5 + intensity * 3;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = color;
  context.globalAlpha = 0.34 + intensity * 0.62;
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(-size, -size * 0.65);
  context.lineTo(-size, size * 0.65);
  context.closePath();
  context.fill();
  context.restore();
};

const drawPheromoneEdge = (
  from,
  to,
  fromLevel,
  toLevel,
  {
    color,
    faint,
    strong,
    offset,
    width,
    dashed = false,
  },
) => {
  const fromIntensity = strength(fromLevel);
  const toIntensity = strength(toLevel);
  const intensity = Math.max(fromIntensity, toIntensity);
  if (intensity < 0.008) return;
  const [start, end] = offsetArc(from, to, offset);
  const [weaker, stronger] = fromLevel <= toLevel ? [start, end] : [end, start];
  const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, fromIntensity < 0.008 ? faint : strong(fromIntensity));
  gradient.addColorStop(1, toIntensity < 0.008 ? faint : strong(toIntensity));
  context.save();
  context.strokeStyle = gradient;
  context.lineWidth = width(intensity);
  context.lineCap = "round";
  if (dashed) {
    context.setLineDash([7, 8]);
  }
  line(context, start, end);
  context.restore();
  if (Math.abs(toLevel - fromLevel) > 1e-6) {
    drawArrow(weaker, stronger, intensity, color);
  }
};

const trailStyle = (channel) =>
  channel === "slow"
    ? {
      color: "#c58b2a",
      faint: "rgba(197, 139, 42, 0.06)",
      strong: (intensity) => `rgba(197, 139, 42, ${0.28 + intensity * 0.58})`,
      offset: 2.8,
      width: (intensity) => 1 + intensity * 5.2,
    }
    : {
      color: "#087f8c",
      faint: "rgba(8, 127, 140, 0.08)",
      strong: (intensity) => `rgba(8, 127, 140, ${0.35 + intensity * 0.6})`,
      offset: -3.2,
      width: (intensity) => 1.2 + intensity * 4.6,
      dashed: true,
    };

const drawTrailSegment = (segment, points) =>
  drawPheromoneEdge(
    points[segment.from],
    points[segment.to],
    segment.fromLevel,
    segment.toLevel,
    trailStyle(segment.channel),
  );

const drawHome = (point) => {
  context.save();
  context.translate(point.x, point.y);
  context.fillStyle = "#fffaf0";
  context.strokeStyle = "#e75b2a";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#e75b2a";
  context.beginPath();
  context.arc(0, 3, 7, Math.PI, 0);
  context.lineTo(7, 7);
  context.lineTo(-7, 7);
  context.closePath();
  context.fill();
  context.fillStyle = "#fffaf0";
  context.beginPath();
  context.arc(0, 4, 2.2, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

const drawFood = (point, active = true) => {
  context.save();
  context.globalAlpha = active ? 1 : 0.36;
  context.translate(point.x, point.y);
  context.fillStyle = "#f8fbe7";
  context.strokeStyle = "#78982b";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(0, 0, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.rotate(-0.65);
  context.fillStyle = "#96b83f";
  context.beginPath();
  context.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#607d22";
  context.lineWidth = 1.2;
  line(context, { x: -6, y: 0 }, { x: 7, y: 0 });
  context.restore();
};

const drawSelectionRing = (point, moving) => {
  context.save();
  context.strokeStyle = "#315cf5";
  context.lineWidth = 2;
  context.setLineDash(moving ? [4, 4] : []);
  context.beginPath();
  context.arc(point.x, point.y, 18, 0, Math.PI * 2);
  context.stroke();
  context.restore();
};

const drawNode = (
  node,
  simulation,
  point,
  selected,
  moving,
  showLabels,
  activeFoods,
) => {
  const isFood = simulation.graph.foods.includes(node.id);
  const isActiveFood = activeFoods.includes(node.id);
  const compact = simulation.graph.nodes.length > 180;
  if (node.id === simulation.graph.hill) {
    drawHome(point);
  } else if (isFood) {
    drawFood(point, isActiveFood);
  } else {
    context.save();
    context.fillStyle = "#fffaf0";
    context.strokeStyle = "#526068";
    context.lineWidth = compact ? 1 : 1.5;
    context.beginPath();
    context.arc(point.x, point.y, compact ? 2.3 : 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }
  if (selected || moving) drawSelectionRing(point, moving);

  const endpoint = node.id === simulation.graph.hill || isFood;
  if (!endpoint && (!showLabels || compact) && !selected) return;

  const foodIndex = simulation.graph.foods.indexOf(node.id);
  const label = node.id === simulation.graph.hill
    ? "HOME"
    : isFood
    ? !isActiveFood
      ? `PARKED ${foodIndex + 1}`
      : simulation.graph.foods.length > 1
      ? `FOOD ${foodIndex + 1}`
      : "FOOD"
    : String(node.id + 1).padStart(2, "0");
  context.save();
  context.font = endpoint
    ? "700 10px ui-monospace, monospace"
    : "600 9px ui-monospace, monospace";
  context.fillStyle = "#38454c";
  context.textAlign = "center";
  context.fillText(label, point.x, point.y + 24);
  context.restore();
};

const antPoint = (view, points) =>
  view.edge
    ? pointAlong(points[view.edge.from], points[view.edge.to], view.edge.progress)
    : points[view.node];

const drawAnt = (view, points) => {
  const point = antPoint(view, points);
  const target = view.edge ? points[view.edge.to] : point;
  const angle = Math.atan2(target.y - point.y, target.x - point.x);
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = "#172129";
  context.beginPath();
  context.ellipse(-2, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(2.4, 0, 1.8, 0, Math.PI * 2);
  context.fill();
  if (view.returning) {
    context.fillStyle = "#83b719";
    context.strokeStyle = "#fffaf0";
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(6, 0, 3.4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  if (view.scouting) {
    context.strokeStyle = "#e75b2a";
    context.lineWidth = 1.2;
    context.beginPath();
    context.arc(-2, 0, 4.6, 0, Math.PI * 2);
    context.stroke();
  }
  if (view.frontier) {
    context.strokeStyle = "#e75b2a";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(-2, 0, 5.2, 0, Math.PI * 2);
    context.stroke();
  }
  if (view.escaping) {
    context.strokeStyle = "#c58b2a";
    context.lineWidth = 1.2;
    context.setLineDash([2, 2]);
    context.beginPath();
    context.arc(-2, 0, 4.6, 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
};

const drawCanvas = (current) => {
  const size = canvasSize();
  context.clearRect(0, 0, size.width, size.height);
  const points = Object.fromEntries(
    current.simulation.graph.nodes.map((node) => [node.id, project(node, size)]),
  );
  const activeFoods = activeFoodsFor(current.simulation);
  drawLeadingRoute(current.simulation, points);
  drawBaseEdges(current.simulation, points);
  if (current.view.trails) {
    trailSegments(current.simulation).forEach((segment) =>
      drawTrailSegment(segment, points)
    );
  }
  current.simulation.graph.nodes.forEach((node) =>
    drawNode(
      node,
      current.simulation,
      points[node.id],
      node.id === current.selectedNode,
      node.id === current.movingFood,
      current.view.labels,
      activeFoods,
    )
  );
  if (current.view.ants) {
    const limit = size.width < 620 ? 72 : current.simulation.ants.length;
    current.simulation.ants.slice(0, limit).forEach((ant) =>
      drawAnt(antViewFor(current.simulation, ant), points)
    );
  }
};

const bindButton = (id, action) =>
  byId(id).addEventListener("click", () => dispatch(action()));

bindButton("toggle-run", () => ({ type: "toggle" }));
bindButton("step-once", () => ({ type: "step" }));
bindButton("reset-run", () => ({ type: "reset" }));
bindButton("clear-trails", () => ({ type: "clear" }));
bindButton("new-graph", () => {
  const seed = (model.simulation.graphSeed + 1) >>> 0;
  byId("seed").value = seed;
  return { type: "newGraph", seed };
});
bindButton("load-seed", () => ({ type: "newGraph", seed: readSeed() }));
bindButton("set-home", () => ({ type: "endpoint", kind: "hill" }));
bindButton("add-food", () => ({ type: "addFood" }));
bindButton("move-food", () => ({ type: "beginFoodMove" }));
bindButton("remove-food", () => ({ type: "removeFood" }));
bindButton("cancel-food-move", () => ({ type: "cancelFoodMove" }));

const conciseNumber = (value) => Number(Number(value).toFixed(2)).toString();

const simulationRateLabel = (value) => `${conciseNumber(value)}×`;
const simulationRateFromSlider = (value) => 2 ** Number(value);
const simulationRateToSlider = (value) => Math.log2(value);

const polarityLabel = (value) => {
  const scaled = Number(value) / 10;
  if (scaled === 0) return "ignore";
  return `${conciseNumber(Math.abs(scaled))}× ${scaled < 0 ? "lower" : "higher"}`;
};

const homePolarityLabel = (value) => {
  const scaled = Number(value) / 10;
  if (scaled === 0) return "ignore";
  return `${conciseNumber(Math.abs(scaled))}× ${scaled < 0 ? "away" : "homeward"}`;
};

const influenceLabel = (value) => `${conciseNumber(Number(value) / 10)}×`;

const durationLabel = (value) => {
  const seconds = Number(value);
  if (seconds < 60) return `${conciseNumber(seconds)} s`;
  if (seconds < 3_600) return `${conciseNumber(seconds / 60)} min`;
  return `${conciseNumber(seconds / 3_600)} h`;
};

const sliderConfigs = [
  ["antCount", Number, (value) => `${value}`, (value) => value],
  [
    "exploreRate",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "stopExploreChance",
    (value) => Number(value) / 100,
    (value) => `${value}% / s`,
    (value) => value * 100,
  ],
  [
    "exploreSignalBias",
    (value) => Number(value) / 10,
    homePolarityLabel,
    (value) => value * 10,
  ],
  [
    "unchartedPreference",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "trailJoinChance",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "reversePenalty",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "speed",
    (value) => Number(value) / 100,
    (value) => `${Number(value) / 100} u/s`,
    (value) => value * 100,
  ],
  [
    "headingInfluence",
    (value) => Number(value) / 10,
    influenceLabel,
    (value) => value * 10,
  ],
  [
    "distanceInfluence",
    (value) => Number(value) / 10,
    influenceLabel,
    (value) => value * 10,
  ],
  [
    "choiceFloor",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "fastInfluence",
    (value) => Number(value) / 10,
    influenceLabel,
    (value) => value * 10,
  ],
  [
    "outboundPolarity",
    (value) => Number(value) / 10,
    polarityLabel,
    (value) => value * 10,
  ],
  [
    "homewardPreference",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "returnFastInfluence",
    (value) => Number(value) / 10,
    influenceLabel,
    (value) => value * 10,
  ],
  [
    "returnSlowInfluence",
    (value) => Number(value) / 10,
    influenceLabel,
    (value) => value * 10,
  ],
  [
    "returnFastPolarity",
    (value) => Number(value) / 10,
    polarityLabel,
    (value) => value * 10,
  ],
  [
    "returnSlowPolarity",
    (value) => Number(value) / 10,
    homePolarityLabel,
    (value) => value * 10,
  ],
  ["slowHalfLife", Number, durationLabel, (value) => value],
  ["fastHalfLife", Number, (value) => `${value} s`, (value) => value],
  ["nodeCount", Number, (value) => `${value}`, (value) => value],
  [
    "density",
    (value) => Number(value) / 100,
    (value) => `${value}%`,
    (value) => value * 100,
  ],
  [
    "mapVariation",
    (value) => Number(value) / 100,
    (value) => (Number(value) / 100).toFixed(2),
    (value) => value * 100,
  ],
];

const setControlSupport = (input, name, supported, engine) => {
  input.disabled = !supported;
  input.closest(".slider-row").dataset.supported = String(supported);
  input.title = supported
    ? CONTROL_HELP[name]
    : `${engine.id} — ${engine.name} does not define this parameter.`;
};

const syncControls = (current) => {
  const { simulation } = current;
  const engine = getEngine(simulation.engineId);
  sliderConfigs.forEach(([name, , format, toInput]) => {
    const input = byId(name);
    const graphControl = GRAPH_KEYS.includes(name);
    const supported = graphControl ||
      supportsEngineParameter(engine, name);
    const parameter = graphControl
      ? current.graphParams[name]
      : simulation.params[name];
    setControlSupport(input, name, supported, engine);
    if (supported) {
      const value = toInput(parameter);
      input.value = value;
      byId(`${name}-value`).textContent = format(value);
    } else {
      byId(`${name}-value`).textContent = "not available";
    }
  });
  const foodTrailModel = byId("foodTrailModel");
  const supportsFoodTrail = supportsEngineParameter(engine, "foodTrailModel");
  setControlSupport(
    foodTrailModel,
    "foodTrailModel",
    supportsFoodTrail,
    engine,
  );
  if (supportsFoodTrail) {
    foodTrailModel.value = simulation.params.foodTrailModel;
  }
  byId("engineId").value = simulation.engineId;
  setText("engine-revision", shortRevision(engine));
  setText("engine-note", engineNote(engine));
  byId("engineId").title = engineTooltip(engine);
  byId("simulationRate").value = simulationRateToSlider(current.simulationRate);
  setText("simulationRate-value", simulationRateLabel(current.simulationRate));
  byId("seed").value = simulation.graphSeed;
};

const updateSharedUrl = (simulation) => {
  const encoded = encodeConfiguration(sharedConfiguration(simulation));
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#state=${encoded}`,
  );
};

const renderEngineOptions = () => {
  const options = ENGINES.map((engine) => {
    const option = new Option(engineLabel(engine), engine.id);
    option.title = engineTooltip(engine);
    return option;
  });
  byId("engineId").replaceChildren(...options);
};

sliderConfigs.forEach(([name, parse, format]) => {
  const input = byId(name);
  const output = byId(`${name}-value`);
  const update = () => {
    output.textContent = format(input.value);
    dispatch({ type: "parameter", name, value: parse(input.value) });
  };
  input.addEventListener("input", update);
  output.textContent = format(input.value);
});

byId("foodTrailModel").addEventListener("change", (event) =>
  dispatch({
    type: "parameter",
    name: "foodTrailModel",
    value: event.currentTarget.value,
  }));
byId("engineId").addEventListener("change", (event) =>
  dispatch({
    type: "engine",
    engineId: event.currentTarget.value,
  }));
byId("simulationRate").addEventListener("input", (event) => {
  const value = simulationRateFromSlider(event.currentTarget.value);
  setText("simulationRate-value", simulationRateLabel(value));
  dispatch({
    type: "simulationRate",
    value,
  });
});

const readPresetLibrary = (key) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) =>
        value !== null && typeof value === "object" && !Array.isArray(value)
      ),
    );
  } catch {
    return {};
  }
};

const writePresetLibrary = (key, library) => {
  localStorage.setItem(key, JSON.stringify(library));
  return library;
};

const ALGORITHM_PRESET_KEY = "formic.algorithm-presets.v1";
const MAP_PRESET_KEY = "formic.map-presets.v1";
let algorithmPresets = migrateAlgorithmPresetLibrary(
  readPresetLibrary(ALGORITHM_PRESET_KEY),
);
let mapPresets = readPresetLibrary(MAP_PRESET_KEY);

const selectedAlgorithmPreset = () => {
  const value = byId("algorithm-presets").value;
  const reference = parsePresetRef(value);
  const preset = resolveAlgorithmPreset(value, algorithmPresets);
  return reference === null || preset === null ? null : { ...reference, ...preset };
};

const syncAlgorithmPresetActions = () => {
  const selection = selectedAlgorithmPreset();
  byId("load-algorithm-preset").disabled = selection === null;
  byId("delete-algorithm-preset").disabled = selection?.source !== "user";
};

const presetOption = (preset, value) => {
  const suffix = preset.engineId === undefined ? "" : ` · ${preset.engineId}`;
  const option = new Option(`${preset.name}${suffix}`, value);
  option.title = preset.engineId === undefined
    ? preset.description
    : `${preset.description} Engine: ${preset.engineId}.`;
  return option;
};

const renderAlgorithmPresetOptions = (selected = "") => {
  const select = byId("algorithm-presets");
  const placeholder = new Option("Choose an algorithm…", "");
  placeholder.disabled = true;

  const builtIns = document.createElement("optgroup");
  builtIns.label = "Built in";
  builtIns.append(
    ...BUILT_IN_ALGORITHM_PRESETS.map((preset) =>
      presetOption(preset, presetRef("builtin", preset.id))
    ),
  );

  const userNames = Object.keys(algorithmPresets).toSorted((left, right) =>
    left.localeCompare(right)
  );
  const user = document.createElement("optgroup");
  user.label = "Your presets";
  user.append(
    ...userNames.map((name) =>
      presetOption(
        {
          name,
          description: "Saved in this browser.",
          engineId: algorithmPresets[name].engineId,
        },
        presetRef("user", name),
      )
    ),
  );

  const available = new Set([
    ...BUILT_IN_ALGORITHM_PRESETS.map(({ id }) => presetRef("builtin", id)),
    ...userNames.map((name) => presetRef("user", name)),
  ]);
  select.replaceChildren(
    placeholder,
    builtIns,
    ...(userNames.length === 0 ? [] : [user]),
  );
  select.value = available.has(selected) ? selected : "";
  syncAlgorithmPresetActions();
};

const renderPresetOptions = (id, library, emptyLabel, selected = "") => {
  const select = byId(id);
  const names = Object.keys(library).toSorted((left, right) =>
    left.localeCompare(right)
  );
  select.replaceChildren(
    ...(names.length === 0
      ? [new Option(emptyLabel, "")]
      : names.map((name) => new Option(name, name))),
  );
  select.value = names.includes(selected) ? selected : names[0] ?? "";
};

const saveNamedPreset = ({
  inputId,
  selectId,
  storageKey,
  library,
  value,
  emptyLabel,
}) => {
  const input = byId(inputId);
  const name = input.value.trim();
  if (name === "") {
    dispatch({ type: "notice", notice: "Give the preset a name first." });
    input.focus();
    return library;
  }
  if (Object.hasOwn(library, name) && !confirm(`Replace “${name}”?`)) {
    return library;
  }
  const next = writePresetLibrary(storageKey, { ...library, [name]: value });
  renderPresetOptions(selectId, next, emptyLabel, name);
  input.value = "";
  dispatch({ type: "notice", notice: `Saved “${name}”.` });
  return next;
};

const deleteNamedPreset = ({
  selectId,
  storageKey,
  library,
  emptyLabel,
}) => {
  const name = byId(selectId).value;
  if (name === "" || !confirm(`Delete “${name}”?`)) return library;
  const next = Object.fromEntries(
    Object.entries(library).filter(([saved]) => saved !== name),
  );
  writePresetLibrary(storageKey, next);
  renderPresetOptions(selectId, next, emptyLabel);
  dispatch({ type: "notice", notice: `Deleted “${name}”.` });
  return next;
};

renderAlgorithmPresetOptions();
renderPresetOptions("map-presets", mapPresets, "No saved maps");

byId("save-algorithm-preset").addEventListener("click", () => {
  const input = byId("algorithm-preset-name");
  const name = input.value.trim();
  if (name === "") {
    dispatch({ type: "notice", notice: "Give the preset a name first." });
    input.focus();
    return;
  }
  if (
    Object.hasOwn(algorithmPresets, name) &&
    !confirm(`Replace “${name}”?`)
  ) {
    return;
  }
  algorithmPresets = writePresetLibrary(ALGORITHM_PRESET_KEY, {
    ...algorithmPresets,
    [name]: algorithmPreset(model.simulation),
  });
  renderAlgorithmPresetOptions(presetRef("user", name));
  input.value = "";
  dispatch({ type: "notice", notice: `Saved “${name}”.` });
});

byId("load-algorithm-preset").addEventListener("click", () => {
  const selection = selectedAlgorithmPreset();
  if (selection !== null) {
    dispatch({
      type: "algorithmPreset",
      name: selection.name,
      engineId: selection.engineId,
      params: selection.params,
    });
  }
});

byId("delete-algorithm-preset").addEventListener("click", () => {
  const selection = selectedAlgorithmPreset();
  if (selection === null) return;
  if (selection.source !== "user") {
    dispatch({ type: "notice", notice: "Built-in presets cannot be deleted." });
    return;
  }
  if (!confirm(`Delete “${selection.name}”?`)) return;
  algorithmPresets = writePresetLibrary(
    ALGORITHM_PRESET_KEY,
    Object.fromEntries(
      Object.entries(algorithmPresets).filter(([name]) => name !== selection.key),
    ),
  );
  renderAlgorithmPresetOptions();
  dispatch({ type: "notice", notice: `Deleted “${selection.name}”.` });
});

byId("algorithm-presets").addEventListener(
  "change",
  syncAlgorithmPresetActions,
);

byId("save-map-preset").addEventListener("click", () => {
  mapPresets = saveNamedPreset({
    inputId: "map-preset-name",
    selectId: "map-presets",
    storageKey: MAP_PRESET_KEY,
    library: mapPresets,
    value: mapPreset(model.simulation),
    emptyLabel: "No saved maps",
  });
});

byId("load-map-preset").addEventListener("click", () => {
  const name = byId("map-presets").value;
  if (name !== "") {
    dispatch({ type: "mapPreset", name, map: mapPresets[name] });
  }
});

byId("delete-map-preset").addEventListener("click", () => {
  mapPresets = deleteNamedPreset({
    selectId: "map-presets",
    storageKey: MAP_PRESET_KEY,
    library: mapPresets,
    emptyLabel: "No saved maps",
  });
});

byId("copy-share-link").addEventListener("click", async () => {
  updateSharedUrl(model.simulation);
  try {
    await navigator.clipboard.writeText(location.href);
    dispatch({ type: "notice", notice: "Share link copied." });
  } catch {
    dispatch({
      type: "notice",
      notice: "Could not access the clipboard. Copy the address bar instead.",
    });
  }
});

["ants", "trails", "labels"].forEach((name) => {
  byId(`show-${name}`).addEventListener(
    "change",
    (event) => dispatch({ type: "view", name, value: event.currentTarget.checked }),
  );
});

const closestNode = (clientX, clientY) => {
  const bounds = canvas.getBoundingClientRect();
  const size = { width: bounds.width, height: bounds.height };
  const click = { x: clientX - bounds.left, y: clientY - bounds.top };
  const candidates = model.simulation.graph.nodes.map((node) => ({
    id: node.id,
    distance: Math.hypot(
      project(node, size).x - click.x,
      project(node, size).y - click.y,
    ),
  }));
  const closest = candidates.reduce((best, item) =>
    item.distance < best.distance ? item : best
  );
  return closest.distance <= 22 ? closest.id : null;
};

canvas.addEventListener(
  "click",
  (event) =>
    dispatch({
      type: "select",
      node: closestNode(event.clientX, event.clientY),
      place: true,
    }),
);

canvas.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && model.movingFood !== null) {
    event.preventDefault();
    dispatch({ type: "cancelFoodMove" });
    return;
  }
  if (
    event.key === "Enter" &&
    model.movingFood !== null &&
    model.selectedNode !== null
  ) {
    event.preventDefault();
    dispatch({ type: "placeFood", node: model.selectedNode });
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const count = model.simulation.graph.nodes.length;
  const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const current = model.selectedNode ?? model.simulation.graph.hill;
  dispatch({ type: "select", node: (current + direction + count) % count });
});

new ResizeObserver(() => drawCanvas(model)).observe(canvas);

let previousTime = performance.now();
let accumulator = 0;
const fixedStep = 1 / 60;

const frame = (time) => {
  const frameSeconds = Math.min(0.08, Math.max(0, (time - previousTime) / 1000));
  previousTime = time;
  accumulator += model.running
    ? simulatedSeconds(frameSeconds, model.simulationRate)
    : 0;
  while (accumulator >= fixedStep) {
    model = reduceModel(model, { type: "advance", dt: fixedStep });
    accumulator -= fixedStep;
  }
  renderMetrics(model);
  drawCanvas(model);
  requestAnimationFrame(frame);
};

renderEngineOptions();
syncControls(model);
updateSharedUrl(model.simulation);
renderInterface(model);
requestAnimationFrame(frame);
