import {
  addFood,
  clearPheromones,
  createSimulation,
  CURRENT_ENGINE_ID,
  CURRENT_ENGINE_VERSION,
  deriveMetrics,
  dominantFoodRoute,
  ENGINES,
  foodProbabilitiesForNode,
  getEngine,
  getStateEngine,
  moveFood,
  removeFood,
  resetRun,
  setEndpoint,
  stepSimulation,
  updateParams,
} from "../src/colony.js";
import * as current from "../src/engines/current.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const assertThrows = (action, message) => {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error);
    assert(error.message.includes(message), error.message);
    return;
  }
  throw new Error(`Expected error containing “${message}”`);
};

const withoutEngineTag = ({ engineId: _id, engineVersion: _version, ...state }) =>
  state;

const availableNode = (state, excluded = []) =>
  state.graph.nodes.find(({ id }) =>
    id !== state.graph.hill &&
    !state.graph.foods.includes(id) &&
    !excluded.includes(id)
  ).id;

Deno.test("the current engine satisfies the versioned registry contract", () => {
  const engine = getEngine(CURRENT_ENGINE_ID);
  assert(ENGINES.includes(engine));
  assert(Object.isFrozen(ENGINES));
  assert(Object.isFrozen(engine));
  assertEquals(engine.id, CURRENT_ENGINE_ID);
  assertEquals(engine.version, CURRENT_ENGINE_VERSION);
  assert(engine.defaults === current.DEFAULTS);

  [
    "createSimulation",
    "stepSimulation",
    "updateParams",
    "resetRun",
    "clearPheromones",
    "moveFood",
    "addFood",
    "removeFood",
    "setEndpoint",
    "deriveMetrics",
    "dominantFoodRoute",
    "foodProbabilitiesForNode",
  ].forEach((method) =>
    assert(typeof engine[method] === "function", `Missing engine method ${method}`)
  );
});

Deno.test("the public facade tags state without changing current-engine bytes", () => {
  const options = {
    seed: 72,
    runSeed: 91,
    params: {
      antCount: 12,
      nodeCount: 16,
      density: 0.36,
      speed: 0.3,
    },
  };
  let direct = current.createSimulation(options);
  let facaded = createSimulation(options);

  assertEquals(facaded.engineId, CURRENT_ENGINE_ID);
  assertEquals(facaded.engineVersion, CURRENT_ENGINE_VERSION);
  assertEquals(withoutEngineTag(facaded), direct);

  const transition = (directAction, facadeAction) => {
    direct = directAction(direct);
    facaded = facadeAction(facaded);
    assertEquals(withoutEngineTag(facaded), direct);
    assertEquals(getStateEngine(facaded), getEngine(CURRENT_ENGINE_ID));
  };

  Array.from({ length: 24 }).forEach(() =>
    transition(
      (state) => current.stepSimulation(state, 0.25),
      (state) => stepSimulation(state, 0.25),
    )
  );
  transition(
    (state) => current.updateParams(state, { antCount: 14, exploreRate: 0.04 }),
    (state) => updateParams(state, { antCount: 14, exploreRate: 0.04 }),
  );

  const addedFood = availableNode(facaded);
  transition(
    (state) => current.addFood(state, addedFood),
    (state) => addFood(state, addedFood),
  );
  const originalFood = facaded.graph.foods[0];
  const movedFood = availableNode(facaded, [addedFood]);
  transition(
    (state) => current.moveFood(state, originalFood, movedFood),
    (state) => moveFood(state, originalFood, movedFood),
  );
  transition(
    (state) => current.removeFood(state, addedFood),
    (state) => removeFood(state, addedFood),
  );
  transition(
    (state) => current.clearPheromones(state),
    (state) => clearPheromones(state),
  );

  const newHill = availableNode(facaded);
  transition(
    (state) => current.setEndpoint(state, "hill", newHill),
    (state) => setEndpoint(state, "hill", newHill),
  );
  transition(
    (state) => current.resetRun(state),
    (state) => resetRun(state),
  );

  assertEquals(deriveMetrics(facaded), current.deriveMetrics(direct));
  assertEquals(dominantFoodRoute(facaded), current.dominantFoodRoute(direct));
  assertEquals(
    foodProbabilitiesForNode(facaded, facaded.graph.hill),
    current.foodProbabilitiesForNode(direct, direct.graph.hill),
  );
});

Deno.test("facade transitions retain engine identity and reject unknown schemas", () => {
  const state = createSimulation({ seed: 9 });
  assert(stepSimulation(state, 0) === state);

  [
    stepSimulation(state, 0.1),
    updateParams(state, { speed: 0.2 }),
    clearPheromones(state),
    resetRun(state),
  ].forEach((next) => {
    assertEquals(next.engineId, CURRENT_ENGINE_ID);
    assertEquals(next.engineVersion, CURRENT_ENGINE_VERSION);
  });

  assertThrows(
    () => stepSimulation({ ...state, engineId: "missing" }, 0.1),
    "Unknown colony engine",
  );
  assertThrows(
    () =>
      stepSimulation(
        { ...state, engineVersion: CURRENT_ENGINE_VERSION + 1 },
        0.1,
      ),
    "Unsupported scalar-field state version",
  );
  assertThrows(
    () => createSimulation({ engineId: "missing" }),
    "Unknown colony engine",
  );
});
