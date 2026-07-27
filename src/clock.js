export const SIMULATION_RATE_RANGE = Object.freeze({
  minimum: 0.25,
  maximum: 8,
  default: 1,
});

export const sanitizeSimulationRate = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return SIMULATION_RATE_RANGE.default;
  return Math.min(
    SIMULATION_RATE_RANGE.maximum,
    Math.max(SIMULATION_RATE_RANGE.minimum, numeric),
  );
};

export const simulatedSeconds = (wallSeconds, rate) =>
  Math.max(0, Number(wallSeconds)) * sanitizeSimulationRate(rate);
