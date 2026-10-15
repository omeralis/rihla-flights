import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['cloakbrowser', 'playwright-core'],
  outputFileTracingIncludes: {
    '/api/search': ['./node_modules/cloakbrowser/**/*', './node_modules/playwright-core/**/*'],
  },
  async redirects() {
    return [
      { source: '/index.html', destination: '/', permanent: true },
      { source: '/results.html', destination: '/results', permanent: true },
    ];
  },
};

export default config;
