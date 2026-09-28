/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  agentRules: false,
  // Use the compiler API supported by our pinned TypeScript 5 toolchain.
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
