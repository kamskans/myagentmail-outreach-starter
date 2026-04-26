/** @type {import("next").NextConfig} */
const nextConfig = {
  // better-sqlite3 is a native module — exclude from the bundler.
  serverExternalPackages: ["better-sqlite3"],
  experimental: { serverComponentsExternalPackages: ["better-sqlite3"] },
};
export default nextConfig;
