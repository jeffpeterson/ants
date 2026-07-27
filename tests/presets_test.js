import { CURRENT_ENGINE_ID, DEFAULTS } from "../src/colony.js";
import { ALGORITHM_KEYS, algorithmPreset, selectParameters } from "../src/config.js";
import { createPlaygroundSimulation } from "../src/playground.js";
import {
  BUILT_IN_ALGORITHM_PRESETS,
  parsePresetRef,
  presetRef,
  resolveAlgorithmPreset,
} from "../src/presets.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

Deno.test("built-in algorithms are complete, immutable, and uniquely named", () => {
  const ids = BUILT_IN_ALGORITHM_PRESETS.map(({ id }) => id);
  const names = BUILT_IN_ALGORITHM_PRESETS.map(({ name }) => name);

  assertEquals(new Set(ids).size, ids.length);
  assertEquals(new Set(names).size, names.length);
  assert(Object.isFrozen(BUILT_IN_ALGORITHM_PRESETS));
  BUILT_IN_ALGORITHM_PRESETS.forEach((preset) => {
    assert(Object.isFrozen(preset));
    assert(Object.isFrozen(preset.params));
    assertEquals(preset.engineId, CURRENT_ENGINE_ID);
    assertEquals(
      Object.keys(preset.params).toSorted(),
      [...ALGORITHM_KEYS].toSorted(),
    );
  });
  assertEquals(
    BUILT_IN_ALGORITHM_PRESETS[0].params,
    selectParameters(DEFAULTS, ALGORITHM_KEYS),
  );
  const joinChance = (id) =>
    BUILT_IN_ALGORITHM_PRESETS.find((preset) => preset.id === id)
      ?.params.trailJoinChance;
  assertEquals(joinChance("balanced-node"), 0.25);
  assertEquals(joinChance("persistent-scouting"), 0);
  assertEquals(joinChance("steady-food"), 0.06);
  assertEquals(joinChance("adaptive-edge"), 0);
  assertEquals(joinChance("legacy"), 0);
  const homeRate = (id) =>
    BUILT_IN_ALGORITHM_PRESETS.find((preset) => preset.id === id)
      ?.params.homeReinforcement;
  assertEquals(homeRate("balanced-node"), 0.25);
  assertEquals(homeRate("rapid-home"), 0.5);
  assertEquals(homeRate("adaptive-edge"), 1);
  assertEquals(homeRate("legacy"), 1);
});

Deno.test("preset references preserve provenance and names containing colons", () => {
  const reference = presetRef("user", "dense: summer");
  assertEquals(reference, "user:dense: summer");
  assertEquals(parsePresetRef(reference), {
    source: "user",
    key: "dense: summer",
  });
  ["", "user:", "unknown:name", ":name"].forEach((value) =>
    assertEquals(parsePresetRef(value), null)
  );
});

Deno.test("built-ins and user presets resolve independently", () => {
  const builtIn = BUILT_IN_ALGORITHM_PRESETS[0];
  const users = {
    [builtIn.name]: { exploreRate: 0.2 },
    tagged: {
      engineId: "another-engine",
      params: { exploreRate: 0.1 },
    },
  };
  const resolvedBuiltIn = resolveAlgorithmPreset(
    presetRef("builtin", builtIn.id),
    users,
  );
  const resolvedUser = resolveAlgorithmPreset(
    presetRef("user", builtIn.name),
    users,
  );
  const resolvedTagged = resolveAlgorithmPreset("user:tagged", users);

  assertEquals(resolvedBuiltIn, builtIn);
  assertEquals(resolvedUser.name, builtIn.name);
  assertEquals(resolvedUser.engineId, CURRENT_ENGINE_ID);
  assertEquals(resolvedUser.params.exploreRate, 0.2);
  assertEquals(resolvedUser.params.foodTrailModel, DEFAULTS.foodTrailModel);
  assertEquals(resolvedTagged.engineId, "another-engine");
  assertEquals(resolvedTagged.params.exploreRate, 0.1);
  assert(!Object.hasOwn(resolvedTagged.params, "foodTrailModel"));
  assertEquals(resolveAlgorithmPreset("builtin:missing", users), null);
});

Deno.test("saved historical presets round-trip their engine parameters", () => {
  const simulation = createPlaygroundSimulation({
    engineId: "A1",
    params: {
      scoutRate: 0.23,
      slowAvoidance: 0.81,
    },
    map: {
      seed: 31,
      params: {
        nodeCount: 16,
        density: 0.3,
        mapVariation: 0.7,
      },
    },
  });
  const saved = algorithmPreset(simulation);
  const resolved = resolveAlgorithmPreset("user:archived", {
    archived: saved,
  });

  assertEquals(resolved.engineId, "A1");
  assertEquals(resolved.params, saved.params);
  assertEquals(resolved.params.scoutRate, 0.23);
  assertEquals(resolved.params.slowAvoidance, 0.81);
  assert(!Object.hasOwn(resolved.params, "nodeCount"));
});

Deno.test("static controls exactly reproduce optimized defaults", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  const inputScale = {
    antCount: 1,
    exploreRate: 100,
    stopExploreChance: 100,
    exploreSignalBias: 10,
    unchartedPreference: 100,
    trailJoinChance: 100,
    choiceFloor: 100,
    newTrailSignalShare: 100,
    reversePenalty: 100,
    speed: 100,
    headingInfluence: 10,
    distanceInfluence: 10,
    fastInfluence: 10,
    outboundPolarity: 10,
    homewardPreference: 100,
    returnFastInfluence: 10,
    returnSlowInfluence: 10,
    returnFastPolarity: 10,
    returnSlowPolarity: 10,
    homeReinforcement: 100,
    slowHalfLife: 1,
    fastHalfLife: 1,
  };

  Object.entries(inputScale).forEach(([name, scale]) => {
    const tag = html.match(new RegExp(`<input id="${name}"[^>]*>`, "u"))?.[0];
    assert(tag !== undefined, `Missing input ${name}`);
    const value = Number(tag.match(/\bvalue="([^"]+)"/u)?.[1]);
    const step = Number(tag.match(/\bstep="([^"]+)"/u)?.[1] ?? 1);
    const minimum = Number(tag.match(/\bmin="([^"]+)"/u)?.[1] ?? 0);
    assert(
      Math.abs(value - DEFAULTS[name] * scale) < 1e-9,
      `${name} differs from DEFAULTS`,
    );
    const steps = (value - minimum) / step;
    assert(Math.abs(steps - Math.round(steps)) < 1e-9, `${name} snaps in its slider`);
  });
  assert(
    html.includes(`<option value="${DEFAULTS.foodTrailModel}" selected>`),
    "Food-trail selector differs from DEFAULTS",
  );
});
