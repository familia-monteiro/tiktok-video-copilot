import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'playwright',
    'playwright-extra',
    'playwright-core',
    'puppeteer-extra-plugin-stealth',
    'puppeteer-extra',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'p16-sign.tiktokcdn-us.com' },
      { protocol: 'https', hostname: 'p77-sign.tiktokcdn-us.com' },
      { protocol: 'https', hostname: '*.tiktokcdn.com' },
    ],
  },
};

export default nextConfig;
