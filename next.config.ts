import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['pg', 'pg-cursor', 'pgsql-parser'],
};
export default config;
