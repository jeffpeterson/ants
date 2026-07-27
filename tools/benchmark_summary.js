import {
  benchmarkSummaryToMarkdown,
  summarizeBenchmarkReport,
} from "../src/benchmark_summary.js";
import { parseArgs } from "./args.js";

const options = parseArgs(Deno.args);
const input = options.input;
if (typeof input !== "string" || input === "true") {
  throw new Error(
    "Usage: --input=report.json [--format=markdown|json] [--baseline=id]",
  );
}

const format = options.format ?? "markdown";
if (format !== "markdown" && format !== "json") {
  throw new Error("Summary format must be markdown or json");
}

const report = JSON.parse(await Deno.readTextFile(input));
const summary = summarizeBenchmarkReport(report, {
  baselineEngineId: options.baseline,
});
console.log(
  format === "json"
    ? JSON.stringify(summary, null, 2)
    : benchmarkSummaryToMarkdown(summary).trimEnd(),
);
