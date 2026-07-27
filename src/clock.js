export const SIMULATION_RATES = Object.freeze([0.25, 0.5, 1, 2, 4, 8]);

export const sanitizeSimulationRate = (value) => {
  const numeric = Number(value);
  return SIMULATION_RATES.includes(numeric) ? numeric : 1;
};

export const simulatedSeconds = (wallSeconds, rate) =>
  Math.max(0, Number(wallSeconds)) * sanitizeSimulationRate(rate);
