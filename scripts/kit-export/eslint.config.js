import bandwise from "@bandwise/config/eslint";

export default [
  // Kit files copied verbatim into the public repo. The kit lints them with its own config.
  { name: "bandwise/kit-export-overlay", ignores: ["overlay/**"] },
  ...bandwise,
];
