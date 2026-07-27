import {
  sanitizeSimulationRate,
  simulatedSeconds,
  SIMULATION_RATES,
} from "../src/clock.js";
import { ALGORITHM_KEYS } from "../src/config.js";

const assert = (condition, message = "Assertion failed") => {
  if (!condition) throw new Error(message);
};

Deno.test("simulation rate scales time without becoming an algorithm parameter", () => {
  assert(Object.isFrozen(SIMULATION_RATES));
  assert(simulatedSeconds(0.5, 4) === 2);
  assert(simulatedSeconds(0.5, 0.25) === 0.125);
  assert(simulatedSeconds(-1, 8) === 0);
  assert(sanitizeSimulationRate(3) === 1);
  assert(!ALGORITHM_KEYS.includes("simulationRate"));
});
