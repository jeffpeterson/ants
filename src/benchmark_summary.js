export const BENCHMARK_SUMMARY_VERSION = 1;
export const DEFAULT_BASELINE_ENGINE_ID = "scalar-field";

const mean = (values) =>
  values.reduce((total, value) => total + value, 0) / values.length;

const percentile = (values, fraction) => {
  const sorted = values.toSorted((first, second) => first - second);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] +
    (sorted[upper] - sorted[lower]) * (position - lower);
};

const finiteNonNegative = (name, value) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number`);
  }
  return value;
};

const runKey = (scenarioId, runSeed) => JSON.stringify([scenarioId, runSeed]);

const engineRuns = (lane, result) => {
  if (!Array.isArray(result.scenarios)) {
    throw new Error(`${lane}/${result.engine?.id ?? "unknown"} has no scenarios`);
  }
  const runs = result.scenarios.flatMap((scenario) => {
    if (typeof scenario.id !== "string" || !Array.isArray(scenario.runs)) {
      throw new Error(
        `${lane}/${result.engine?.id ?? "unknown"} has an invalid scenario`,
      );
    }
    return scenario.runs.map((run) => ({
      key: runKey(scenario.id, run.runSeed),
      steadyQ: finiteNonNegative(
        `${lane}/${result.engine.id}/${scenario.id} steady Q`,
        run.steady?.normalizedThroughput,
      ),
      visibleDeliveries: finiteNonNegative(
        `${lane}/${result.engine.id}/${scenario.id} visible deliveries`,
        run.visible?.deliveries,
      ),
    }));
  });
  if (runs.length === 0) {
    throw new Error(`${lane}/${result.engine.id} has no runs`);
  }
  if (new Set(runs.map(({ key }) => key)).size !== runs.length) {
    throw new Error(`${lane}/${result.engine.id} has duplicate scenario/runSeed pairs`);
  }
  return runs;
};

const rates = ({ wins, ties, losses }) => {
  const matchedRuns = wins + ties + losses;
  return {
    matchedRuns,
    wins,
    ties,
    losses,
    winRate: matchedRuns === 0 ? null : wins / matchedRuns,
    tieRate: matchedRuns === 0 ? null : ties / matchedRuns,
    lossRate: matchedRuns === 0 ? null : losses / matchedRuns,
  };
};

const pairedResult = (runs, baselineRuns, baselineEngineId) => {
  const baselineByRun = new Map(
    baselineRuns.map(({ key, steadyQ }) => [key, steadyQ]),
  );
  const counts = runs.reduce(
    (result, { key, steadyQ }) => {
      const baselineQ = baselineByRun.get(key);
      if (baselineQ === undefined) return result;
      if (steadyQ > baselineQ) return { ...result, wins: result.wins + 1 };
      if (steadyQ < baselineQ) return { ...result, losses: result.losses + 1 };
      return { ...result, ties: result.ties + 1 };
    },
    { wins: 0, ties: 0, losses: 0 },
  );
  return { baselineEngineId, ...rates(counts) };
};

const engineSummary = (result, runs, baselineRuns, baselineEngineId) => {
  const q = runs.map(({ steadyQ }) => steadyQ);
  const visible = runs.map(({ visibleDeliveries }) => visibleDeliveries);
  return {
    engine: {
      id: result.engine.id,
      name: result.engine.name ?? result.engine.id,
      revision: result.engine.revision ?? null,
      family: result.engine.family ?? null,
    },
    runCount: runs.length,
    steadyQ: {
      mean: mean(q),
      median: percentile(q, 0.5),
      p10: percentile(q, 0.1),
      minimum: Math.min(...q),
      maximum: Math.max(...q),
    },
    visible: {
      meanDeliveries: mean(visible),
      noDeliveryRuns: visible.filter((deliveries) => deliveries === 0).length,
    },
    paired: pairedResult(runs, baselineRuns, baselineEngineId),
  };
};

const laneSummary = (lane, value, baselineEngineId) => {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray(value.engines) ||
    value.engines.length === 0
  ) {
    throw new Error(`${lane} lane has no engines`);
  }
  const ids = value.engines.map(({ engine }) => engine?.id);
  if (ids.some((id) => typeof id !== "string" || id.length === 0)) {
    throw new Error(`${lane} lane has an invalid engine id`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error(`${lane} lane has duplicate engine ids`);
  }
  const baseline = value.engines.find(({ engine }) => engine.id === baselineEngineId);
  if (baseline === undefined) {
    throw new Error(`Baseline engine ${baselineEngineId} is missing from ${lane} lane`);
  }
  const runsByEngine = new Map(
    value.engines.map((result) => [result.engine.id, engineRuns(lane, result)]),
  );
  const baselineRuns = runsByEngine.get(baselineEngineId);
  return {
    lane,
    baselineEngineId,
    engines: value.engines.map((result) =>
      engineSummary(
        result,
        runsByEngine.get(result.engine.id),
        baselineRuns,
        baselineEngineId,
      )
    ),
  };
};

export const summarizeBenchmarkReport = (
  report,
  { baselineEngineId = DEFAULT_BASELINE_ENGINE_ID } = {},
) => {
  if (
    typeof baselineEngineId !== "string" ||
    baselineEngineId.length === 0
  ) {
    throw new Error("Baseline engine id must be a non-empty string");
  }
  if (
    report === null ||
    typeof report !== "object" ||
    report.lanes === null ||
    typeof report.lanes !== "object"
  ) {
    throw new Error("Benchmark report must contain lanes");
  }
  const lanes = Object.entries(report.lanes);
  if (lanes.length === 0) throw new Error("Benchmark report has no lanes");

  return {
    schema: "formic-historical-benchmark-summary",
    version: BENCHMARK_SUMMARY_VERSION,
    source: {
      schema: report.schema ?? null,
      version: report.version ?? null,
      suite: report.provenance?.suite ?? null,
    },
    baselineEngineId,
    lanes: Object.fromEntries(
      lanes.map(([lane, value]) => [
        lane,
        laneSummary(lane, value, baselineEngineId),
      ]),
    ),
  };
};

const decimal = (value) => value === null ? "—" : Number(value.toFixed(4)).toString();

const percent = (value) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

const cell = (value) => String(value).replaceAll("|", "\\|");

const engineRow = ({ engine, runCount, steadyQ, visible, paired }) =>
  [
    `${cell(engine.name)} (\`${cell(engine.id)}\`)`,
    runCount,
    decimal(steadyQ.mean),
    decimal(steadyQ.median),
    decimal(steadyQ.p10),
    decimal(steadyQ.minimum),
    decimal(steadyQ.maximum),
    decimal(visible.meanDeliveries),
    visible.noDeliveryRuns,
    paired.matchedRuns,
    `${paired.wins}/${paired.ties}/${paired.losses}`,
    `${percent(paired.winRate)}/${percent(paired.tieRate)}/${percent(paired.lossRate)}`,
  ].join(" | ");

const laneMarkdown = ({ lane, engines }) =>
  [
    `## ${cell(lane)}`,
    "",
    "| Engine | Runs | Mean Q | Median Q | P10 Q | Min Q | Max Q | Mean visible deliveries | No-delivery runs | Pairs | W/T/L | W/T/L rate |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...engines.map((engine) => `| ${engineRow(engine)} |`),
  ].join("\n");

export const benchmarkSummaryToMarkdown = (summary) =>
  [
    "# Historical benchmark summary",
    "",
    `Baseline: \`${cell(summary.baselineEngineId)}\``,
    "",
    ...Object.values(summary.lanes).flatMap((lane, index) =>
      index === 0 ? [laneMarkdown(lane)] : ["", laneMarkdown(lane)]
    ),
    "",
  ].join("\n");
