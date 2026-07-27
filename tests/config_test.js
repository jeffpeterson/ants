import { CURRENT_ENGINE_ID, ENGINES } from "../src/colony.js";
import {
  algorithmPreset,
  decodeConfiguration,
  encodeConfiguration,
  migrateAlgorithmPreset,
  migrateAlgorithmPresetLibrary,
  migrateConfiguration,
} from "../src/config.js";
import { createPlaygroundSimulation } from "../src/playground.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const map = {
  seed: 73,
  params: { nodeCount: 28, density: 0.4, mapVariation: 0.6 },
  hill: 2,
  foods: [9],
};

Deno.test("v1 share URLs migrate to the scalar-field v2 shape", () => {
  const legacy = {
    version: 1,
    algorithm: { speed: 0.2, exploreRate: 0.03 },
    map,
  };
  const migrated = decodeConfiguration(encodeConfiguration(legacy));

  assertEquals(migrated, {
    version: 2,
    algorithm: {
      engineId: CURRENT_ENGINE_ID,
      params: {
        ...legacy.algorithm,
        homeSignalModel: "pheromone",
        scoutLifecycle: "frontier",
        trailJoinChance: 0,
        newTrailSignalShare: 0,
        homeReinforcement: 1,
      },
    },
    map,
  });
  assertEquals(legacy.version, 1);
  assert(!Object.hasOwn(legacy.algorithm, "engineId"));
});

Deno.test("v2 share URLs retain their engine-aware algorithm data", () => {
  const configuration = {
    version: 2,
    algorithm: {
      engineId: "another-engine",
      params: { speed: 0.12 },
    },
    map,
  };

  assertEquals(
    decodeConfiguration(encodeConfiguration(configuration)),
    configuration,
  );
});

Deno.test("new lever migration preserves explicit values and old behavior", () => {
  const explicit = {
    version: 2,
    algorithm: {
      engineId: CURRENT_ENGINE_ID,
      params: {
        speed: 0.12,
        foodTrailModel: "distance",
        homeSignalModel: "distance",
        scoutLifecycle: "complete",
        trailJoinChance: 0.06,
        newTrailSignalShare: 0.2,
        homeReinforcement: 0.25,
      },
    },
    map,
  };
  const old = {
    ...explicit,
    algorithm: {
      ...explicit.algorithm,
      params: { speed: 0.12 },
    },
  };

  assertEquals(decodeConfiguration(encodeConfiguration(explicit)), explicit);
  assertEquals(
    decodeConfiguration(encodeConfiguration(old)).algorithm.params,
    {
      speed: 0.12,
      homeSignalModel: "pheromone",
      scoutLifecycle: "frontier",
      trailJoinChance: 0,
      newTrailSignalShare: 0,
      homeReinforcement: 1,
    },
  );
});

Deno.test("configuration migration rejects malformed versioned shapes", () => {
  [
    null,
    {},
    { version: 3, algorithm: {}, map },
    { version: 1, algorithm: [], map },
    { version: 2, algorithm: { speed: 0.2 }, map },
    {
      version: 2,
      algorithm: { engineId: CURRENT_ENGINE_ID, params: [] },
      map,
    },
    {
      version: 2,
      algorithm: { engineId: CURRENT_ENGINE_ID, params: {} },
      map: { seed: "73", params: {} },
    },
  ].forEach((configuration) => assertEquals(migrateConfiguration(configuration), null));
  assertEquals(decodeConfiguration("not-base64-json"), null);
});

Deno.test("user algorithm preset migration accepts legacy and tagged values", () => {
  const legacy = { speed: 0.2 };
  const tagged = {
    engineId: "another-engine",
    params: { speed: 0.1 },
    ignored: true,
  };

  assertEquals(migrateAlgorithmPreset(legacy), {
    engineId: CURRENT_ENGINE_ID,
    params: {
      ...legacy,
      homeSignalModel: "pheromone",
      scoutLifecycle: "frontier",
      trailJoinChance: 0,
      newTrailSignalShare: 0,
      homeReinforcement: 1,
    },
  });
  assertEquals(migrateAlgorithmPreset(tagged), {
    engineId: "another-engine",
    params: tagged.params,
  });
  [null, [], { engineId: CURRENT_ENGINE_ID }, { params: {} }].forEach((value) =>
    assertEquals(migrateAlgorithmPreset(value), null)
  );
});

Deno.test("legacy localStorage libraries migrate entry by entry", () => {
  const stored = {
    legacy: { speed: 0.2 },
    tagged: {
      engineId: "another-engine",
      params: { speed: 0.1 },
    },
    malformed: null,
  };

  assertEquals(migrateAlgorithmPresetLibrary(stored), {
    legacy: {
      engineId: CURRENT_ENGINE_ID,
      params: {
        ...stored.legacy,
        homeSignalModel: "pheromone",
        scoutLifecycle: "frontier",
        trailJoinChance: 0,
        newTrailSignalShare: 0,
        homeReinforcement: 1,
      },
    },
    tagged: stored.tagged,
  });
  assertEquals(migrateAlgorithmPresetLibrary(null), {});
  assertEquals(stored.legacy, { speed: 0.2 });
});

Deno.test("engine algorithms retain behavior and omit their graph recipe", () => {
  ENGINES.forEach((engine) => {
    const simulation = createPlaygroundSimulation({
      engineId: engine.id,
      map: {
        seed: 91,
        params: {
          nodeCount: 16,
          density: 0.35,
          mapVariation: 0.8,
        },
      },
    });
    const algorithm = algorithmPreset(simulation);
    const expected = Object.keys(engine.defaults)
      .filter((key) => !engine.graphParameterKeys.includes(key))
      .toSorted();

    assertEquals(algorithm.engineId, engine.id);
    assertEquals(Object.keys(algorithm.params).toSorted(), expected, engine.id);
    engine.graphParameterKeys.forEach((key) =>
      assert(!Object.hasOwn(algorithm.params, key), `${engine.id}.${key}`)
    );
    const configuration = {
      version: 2,
      algorithm,
      map: {
        seed: simulation.graphSeed,
        params: simulation.graphParams,
        hill: simulation.graph.hill,
        foods: simulation.graph.foods,
      },
    };
    assertEquals(
      decodeConfiguration(encodeConfiguration(configuration)),
      configuration,
      engine.id,
    );
  });
});
