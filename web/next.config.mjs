/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Prisma + stellar sdk are server-only; keep them external on the server bundle.
  serverExternalPackages: ["@prisma/client", "@stellar/stellar-sdk"],
};
export default nextConfig;
