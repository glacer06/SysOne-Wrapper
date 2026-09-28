import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next writes AGENTS.md and CLAUDE.md into the app on `next dev` by default. The repo's own
  // CLAUDE.md and the bandwise-builder skill are the agent rules here.
  agentRules: false,
};

export default nextConfig;
