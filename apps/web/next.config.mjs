/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@laurus/parser"],
  experimental: {
    // `next upgrade --agent` keeps the app on published security patches.
    agentUpgrade: "security",
  },
};
export default nextConfig;
