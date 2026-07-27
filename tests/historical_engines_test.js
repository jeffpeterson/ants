import { HISTORICAL_ENGINE_MANIFEST } from "../src/engines/historical/manifest.js";
import * as HISTORICAL_ENGINE_SOURCES from "../src/engines/historical/source/index.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

const assertEquals = (value, expected, message) =>
  assert(
    JSON.stringify(value) === JSON.stringify(expected),
    message ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`,
  );

const hex = (bytes) =>
  [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

const gitBlobId = async (url) => {
  const source = await Deno.readFile(url);
  const header = new TextEncoder().encode(`blob ${source.length}\0`);
  const object = new Uint8Array(header.length + source.length);
  object.set(header);
  object.set(source, header.length);
  return hex(await crypto.subtle.digest("SHA-1", object));
};

Deno.test("historical engine manifest is immutable and uniquely identified", () => {
  const ids = HISTORICAL_ENGINE_MANIFEST.map(({ id }) => id);

  assertEquals(ids, ["A0", "A1", "A2", "A3", "A4", "B0", "B1"]);
  assertEquals(new Set(ids).size, ids.length);
  assert(Object.isFrozen(HISTORICAL_ENGINE_MANIFEST));
  HISTORICAL_ENGINE_MANIFEST.forEach((entry) => {
    assert(Object.isFrozen(entry));
    assert(Object.isFrozen(entry.traits));
    assert(/^[0-9a-f]{40}$/u.test(entry.commit));
    assert(/^[0-9a-f]{40}$/u.test(entry.sourceBlob));
    assertEquals(entry.sourcePath, "src/colony.js");
    assert(entry.label.length > 0);
    assert(entry.family.length > 0);
    assert(entry.traits.length > 0);
    assert(entry.sourceModule.startsWith("./source/"));
  });
});

Deno.test("historical engine source modules are namespaced and importable", async () => {
  await Promise.all(
    HISTORICAL_ENGINE_MANIFEST.map(async ({ id, sourceModule }) => {
      const sourceUrl = new URL(
        sourceModule,
        new URL("../src/engines/historical/manifest.js", import.meta.url),
      );
      const source = await import(sourceUrl.href);

      assert(
        source === HISTORICAL_ENGINE_SOURCES[id],
        `${id} namespace does not reference its archived module`,
      );
      [
        "choiceProbabilities",
        "createSimulation",
        "deriveMetrics",
        "generateGraph",
        "sanitizeParams",
        "stepSimulation",
      ].forEach((name) =>
        assert(
          typeof source[name] === "function",
          `${id} does not export ${name}`,
        )
      );
      assert(Object.isFrozen(source.DEFAULTS));
    }),
  );
});

Deno.test("historical source provenance matches the archived Git blobs", async () => {
  await Promise.all(
    HISTORICAL_ENGINE_MANIFEST.map(async ({ id, sourceBlob, sourceModule }) => {
      const sourceUrl = new URL(
        sourceModule,
        new URL("../src/engines/historical/manifest.js", import.meta.url),
      );
      assertEquals(
        await gitBlobId(sourceUrl),
        sourceBlob,
        `${id} source differs from its recorded Git blob`,
      );
    }),
  );
});
