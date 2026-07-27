import {
  sanitizeSimulationRate,
  simulatedSeconds,
  SIMULATION_RATE_RANGE,
} from "../src/clock.js";
import { ALGORITHM_KEYS } from "../src/config.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("simulation rate scales time without becoming an algorithm parameter", () => {
  assert(Object.isFrozen(SIMULATION_RATE_RANGE));
  assert(simulatedSeconds(0.5, 3) === 1.5);
  assert(simulatedSeconds(0.5, 0.25) === 0.125);
  assert(simulatedSeconds(-1, 8) === 0);
  assert(sanitizeSimulationRate(3.25) === 3.25);
  assert(sanitizeSimulationRate(0) === SIMULATION_RATE_RANGE.minimum);
  assert(sanitizeSimulationRate(100) === SIMULATION_RATE_RANGE.maximum);
  assert(sanitizeSimulationRate("invalid") === SIMULATION_RATE_RANGE.default);
  assert(!ALGORITHM_KEYS.includes("simulationRate"));
});

Deno.test("simulation rate is exposed as a continuous slider", async () => {
  const html = await Deno.readTextFile(new URL("../index.html", import.meta.url));
  assert(/<input id="simulationRate" type="range"/u.test(html));
  assert(!/<select id="simulationRate"/u.test(html));
  assert(html.includes('id="simulationRate-value"'));
});
