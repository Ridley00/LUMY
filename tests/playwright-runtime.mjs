import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// Resolve a project dependency, or an explicitly configured shared installation.
export const playwright = require(process.env.LUMI_PLAYWRIGHT_PATH || 'playwright');
