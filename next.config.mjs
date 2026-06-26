/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // We run typechecking separately; don't let an unconfigured ESLint block builds.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
