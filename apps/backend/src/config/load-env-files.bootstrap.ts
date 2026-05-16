import { loadEnvFiles } from './load-env-files';

// Import this module before any module that reads process.env.
loadEnvFiles();
