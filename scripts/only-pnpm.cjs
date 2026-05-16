// pnpm 10 set npm_config_user_agent='pnpm/...'. pnpm 11 no longer sets it,
// so fall back to inspecting npm_execpath, which points to the binary
// running the install (pnpm's path always contains 'pnpm').
const userAgent = process.env.npm_config_user_agent || '';
const execPath = process.env.npm_execpath || '';
const isPnpm = userAgent.startsWith('pnpm') || /[\\/]pnpm/i.test(execPath);
if (!isPnpm) {
  console.error(
    '\n[template] Use pnpm. This repo enforces a single package manager.\n' +
      '  corepack enable && pnpm install\n',
  );
  process.exit(1);
}
