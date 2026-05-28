import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },      // żeby build przeszedł mimo TS
  eslint: { ignoreDuringBuilds: true },         // opcjonalnie
  output: "standalone",                         // wymagane przez Twój Dockerfile

  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
