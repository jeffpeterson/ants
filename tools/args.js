export const parseArgs = (args) =>
  args.reduce((options, argument) => {
    if (!argument.startsWith("--")) return options;
    const value = argument.slice(2);
    const separator = value.indexOf("=");
    const key = separator < 0 ? value : value.slice(0, separator);
    return {
      ...options,
      [key]: separator < 0 ? "true" : value.slice(separator + 1),
    };
  }, {});

export const parseAssignments = (value = "") =>
  Object.fromEntries(
    value.split(",")
      .filter(Boolean)
      .map((assignment) => {
        const separator = assignment.indexOf("=");
        const key = separator < 0 ? assignment : assignment.slice(0, separator);
        const raw = separator < 0 ? "" : assignment.slice(separator + 1);
        const numeric = Number(raw);
        return [key, Number.isFinite(numeric) && raw !== "" ? numeric : raw];
      }),
  );
