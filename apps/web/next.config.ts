import type { NextConfig } from "next";

import withBundleAnalyzer from '@next/bundle-analyzer';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

// added by create cloudflare to enable calling `getCloudflareContext()` in `next dev`
initOpenNextCloudflareForDev(
  process.env.NODE_ENV === "production"
    ? { persist: false, remoteBindings: false }
    : undefined,
);

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  eslint: {
    ignoreDuringBuilds: process.env.SKIP_LINTER === 'true'
  },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_LINTER === 'true'
  },
  webpack(config, { dev }) {
    if (!dev && process.env.NEXT_DISABLE_WEBPACK_CACHE === "true") {
      config.cache = false;
    }
    return config;
  }
};

export default process.env.ANALYZE === 'true'
  ? withBundleAnalyzer()(nextConfig)
  : nextConfig;
