import {
  arcKey,
  clearPheromones,
  createSimulation,
  deriveMetrics,
  probabilitiesForAntAtNode,
  resetRun,
  setEndpoint,
  stepSimulation,
  updateParams,
} from "./colony.js";

const byId = (id) => document.getElementById(id);
const canvas = byId("colony-canvas");
const context = canvas.getContext("2d");
const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const readSeed = () => Number(byId("seed").value) >>> 0;
const initialSeed = readSeed();

let model = {
  simulation: createSimulation({ seed: initialSeed }),
  running: !prefersReducedMotion,
  selectedNode: null,
  view: { ants: true, trails: true, labels: true },
};

const replaceSimulation = (current, simulation) => ({
  ...current,
  simulation,
  selectedNode: null,
});

const reduceModel = (current, action) => {
  switch (action.type) {
    case "toggle":
      return { ...current, running: !current.running };
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
        createSimulation({
          seed: action.seed,
          params: current.simulation.params,
        }),
      );
    case "reset":
      return replaceSimulation(current, resetRun(current.simulation));
    case "clear":
      return {
        ...current,
        simulation: clearPheromones(current.simulation),
      };
    case "parameter":
      return {
        ...current,
        simulation: updateParams(current.simulation, {
          [action.name]: action.value,
        }),
      };
    case "select":
      return { ...current, selectedNode: action.node };
    case "endpoint":
      return replaceSimulation(
        current,
        setEndpoint(current.simulation, action.kind, current.selectedNode),
      );
    case "view":
      return {
        ...current,
        view: { ...current.view, [action.name]: action.value },
      };
    default:
      return current;
  }
};

const dispatch = (action) => {
  model = reduceModel(model, action);
  renderInterface(model);
};

const formatDistance = (value) => value === null ? "—" : `${value.toFixed(2)} u`;

const formatPercent = (value) => `${Math.round(value * 100)}%`;

const statusCopy = (current, metrics) => {
  if (!current.running) return "Paused — inspect the signal or advance one step.";
  if (metrics.deliveries === 0 && metrics.discoveries === 0) {
    return "Scouts are mapping the graph. No food signal yet.";
  }
  if (metrics.deliveries === 0) {
    return "Food found. Returning ants are laying a directed signal.";
  }
  return `${metrics.deliveries} deliveries · ${
    formatPercent(metrics.efficiency)
  } route efficiency`;
};

const setText = (id, value) => {
  byId(id).textContent = value;
};

const renderMetrics = (current) => {
  const metrics = deriveMetrics(current.simulation);
  setText("delivery-count", metrics.deliveries);
  setText("returning-count", metrics.returning);
  setText("best-distance", formatDistance(metrics.bestDistance));
  setText("best-hops", metrics.bestDistance === null ? "—" : metrics.bestHops);
  setText("efficiency", formatPercent(metrics.efficiency));
  setText("signal-focus", formatPercent(metrics.signalFocus));
  setText("scout-count", `${metrics.scouts}/${current.simulation.ants.length}`);
  setText("stage-status", statusCopy(current, metrics));
  setText("runtime", `${current.simulation.elapsed.toFixed(1)} s`);
  byId("run-state").dataset.running = String(current.running);
  setText("run-state", current.running ? "RUNNING" : "PAUSED");
  setText("toggle-label", current.running ? "Pause colony" : "Run colony");
  byId("toggle-run").setAttribute("aria-pressed", String(current.running));
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
  empty.hidden = hasSelection;
  content.hidden = !hasSelection;
  if (!hasSelection) return;

  const degree = simulation.graph.adjacency[selectedNode].length;
  const role = selectedNode === simulation.graph.hill
    ? "Ant hill"
    : selectedNode === simulation.graph.food
    ? "Food source"
    : "Junction";
  setText("selected-title", `Node ${String(selectedNode + 1).padStart(2, "0")}`);
  setText("selected-meta", `${role} · ${degree} connected edges`);
  byId("set-hill").disabled = selectedNode === simulation.graph.hill ||
    selectedNode === simulation.graph.food;
  byId("set-food").disabled = selectedNode === simulation.graph.food ||
    selectedNode === simulation.graph.hill;
  const rows = probabilitiesForAntAtNode(simulation, selectedNode)
    .map(probabilityRow);
  byId("probabilities").replaceChildren(...rows);
};

const renderInterface = (current) => {
  renderMetrics(current);
  renderInspector(current);
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

const drawBestRoute = (simulation, points) => {
  if (simulation.stats.bestRoute.length < 2) return;
  context.save();
  context.strokeStyle = "#087f8c";
  context.globalAlpha = 0.09;
  context.lineWidth = 12;
  context.lineCap = "round";
  routePairs(simulation.stats.bestRoute).forEach(([from, to]) =>
    line(context, points[from], points[to])
  );
  context.restore();
};

const drawSlowPheromones = (simulation, points) => {
  context.save();
  context.lineCap = "round";
  simulation.graph.edges.forEach((edge) => {
    const amount = simulation.pheromones.slow[edge.id];
    const intensity = strength(amount);
    if (intensity < 0.01) return;
    context.strokeStyle = "#c58b2a";
    context.globalAlpha = 0.08 + intensity * 0.42;
    context.lineWidth = 1 + intensity * 8;
    line(context, points[edge.a], points[edge.b]);
  });
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

const drawArrow = (from, to, intensity) => {
  const point = pointAlong(from, to, 0.66);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 3.5 + intensity * 3;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = "#087f8c";
  context.globalAlpha = 0.34 + intensity * 0.62;
  context.beginPath();
  context.moveTo(size, 0);
  context.lineTo(-size, -size * 0.65);
  context.lineTo(-size, size * 0.65);
  context.closePath();
  context.fill();
  context.restore();
};

const drawFastArc = (from, to, amount, elapsed) => {
  const intensity = strength(amount);
  if (intensity < 0.008) return;
  const [start, end] = offsetArc(from, to);
  const gradient = context.createLinearGradient(
    start.x,
    start.y,
    end.x,
    end.y,
  );
  gradient.addColorStop(0, "rgba(8, 127, 140, 0.08)");
  gradient.addColorStop(1, `rgba(8, 127, 140, ${0.35 + intensity * 0.6})`);
  context.save();
  context.strokeStyle = gradient;
  context.lineWidth = 1.2 + intensity * 4.6;
  context.lineCap = "round";
  context.setLineDash([7, 8]);
  context.lineDashOffset = -elapsed * 18;
  line(context, start, end);
  context.restore();
  drawArrow(start, end, intensity);
};

const drawFastPheromones = (simulation, points) =>
  simulation.graph.edges.forEach((edge) => {
    drawFastArc(
      points[edge.a],
      points[edge.b],
      simulation.pheromones.fast[arcKey(edge.a, edge.b)],
      simulation.elapsed,
    );
    drawFastArc(
      points[edge.b],
      points[edge.a],
      simulation.pheromones.fast[arcKey(edge.b, edge.a)],
      simulation.elapsed,
    );
  });

const drawHill = (point) => {
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

const drawFood = (point) => {
  context.save();
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

const drawNode = (node, simulation, point, selected, showLabels) => {
  if (node.id === simulation.graph.hill) {
    drawHill(point);
  } else if (node.id === simulation.graph.food) {
    drawFood(point);
  } else {
    context.save();
    context.fillStyle = "#fffaf0";
    context.strokeStyle = selected ? "#315cf5" : "#526068";
    context.lineWidth = selected ? 3 : 1.5;
    context.beginPath();
    context.arc(point.x, point.y, selected ? 7 : 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
  }

  if (
    !showLabels && node.id !== simulation.graph.hill &&
    node.id !== simulation.graph.food
  ) return;

  const label = node.id === simulation.graph.hill
    ? "HILL"
    : node.id === simulation.graph.food
    ? "FOOD"
    : String(node.id + 1).padStart(2, "0");
  context.save();
  context.font = node.id === simulation.graph.hill ||
      node.id === simulation.graph.food
    ? "700 10px ui-monospace, monospace"
    : "600 9px ui-monospace, monospace";
  context.fillStyle = "#38454c";
  context.textAlign = "center";
  context.fillText(label, point.x, point.y + 24);
  context.restore();
};

const antPoint = (ant, points) =>
  ant.edge
    ? pointAlong(points[ant.edge.from], points[ant.edge.to], ant.edge.progress)
    : points[ant.node];

const drawAnt = (ant, points, simulation) => {
  const point = antPoint(ant, points);
  const target = ant.edge ? points[ant.edge.to] : point;
  const angle = Math.atan2(target.y - point.y, target.x - point.x);
  const scout = ant.scoutScore < simulation.params.scoutRate;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.fillStyle = ant.mode === "return" ? "#087f8c" : "#172129";
  context.beginPath();
  context.ellipse(-2, 0, 3.2, 2.2, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(2.4, 0, 1.8, 0, Math.PI * 2);
  context.fill();
  if (scout) {
    context.strokeStyle = "#e75b2a";
    context.lineWidth = 1.2;
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
  drawBestRoute(current.simulation, points);
  drawBaseEdges(current.simulation, points);
  if (current.view.trails) {
    drawSlowPheromones(current.simulation, points);
    drawFastPheromones(current.simulation, points);
  }
  current.simulation.graph.nodes.forEach((node) =>
    drawNode(
      node,
      current.simulation,
      points[node.id],
      node.id === current.selectedNode,
      current.view.labels,
    )
  );
  if (current.view.ants) {
    const limit = size.width < 620 ? 72 : current.simulation.ants.length;
    current.simulation.ants.slice(0, limit).forEach((ant) =>
      drawAnt(ant, points, current.simulation)
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
bindButton("set-hill", () => ({ type: "endpoint", kind: "hill" }));
bindButton("set-food", () => ({ type: "endpoint", kind: "food" }));

const sliderConfigs = [
  ["antCount", (value) => Number(value), (value) => `${value}`],
  ["scoutRate", (value) => Number(value) / 100, (value) => `${value}%`],
  ["speed", (value) => Number(value) / 100, (value) => `${Number(value) / 100} u/s`],
  ["slowHalfLife", Number, (value) => `${value} s`],
  ["fastHalfLife", Number, (value) => `${value} s`],
  ["fastInfluence", (value) => Number(value) / 10, (value) => `${Number(value) / 10}×`],
  ["nodeCount", Number, (value) => `${value}`],
  ["density", (value) => Number(value) / 100, (value) => `${value}%`],
];

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
    dispatch({ type: "select", node: closestNode(event.clientX, event.clientY) }),
);

canvas.addEventListener("keydown", (event) => {
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
  accumulator += model.running ? frameSeconds : 0;
  while (accumulator >= fixedStep) {
    model = reduceModel(model, { type: "advance", dt: fixedStep });
    accumulator -= fixedStep;
  }
  renderMetrics(model);
  drawCanvas(model);
  requestAnimationFrame(frame);
};

renderInterface(model);
requestAnimationFrame(frame);
