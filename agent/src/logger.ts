/**
 * PARRY Logger — minimal structured logger for terminal output
 */

const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const MAGENTA = "\x1b[35m";

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

export const logger = {
  info: (msg: string) =>
    console.log(`${DIM}${ts()}${RESET} ${CYAN}[INFO]${RESET}  ${msg}`),

  warn: (msg: string) =>
    console.log(`${DIM}${ts()}${RESET} ${YELLOW}[WARN]${RESET}  ${msg}`),

  error: (msg: string) =>
    console.log(`${DIM}${ts()}${RESET} ${RED}[ERROR]${RESET} ${msg}`),

  debug: (msg: string) => {
    if (process.env.DEBUG) {
      console.log(`${DIM}${ts()}${RESET} ${DIM}[DEBUG]${RESET} ${msg}`);
    }
  },

  PARRY: (msg: string) =>
    console.log(`${DIM}${ts()}${RESET} ${MAGENTA}${BOLD}[PARRY]${RESET} ${msg}`),

  success: (msg: string) =>
    console.log(`${DIM}${ts()}${RESET} ${GREEN}[✓]${RESET}     ${msg}`),

  banner: () => {
    console.log(`
${CYAN}${BOLD}
  ███████╗██╗  ██╗██╗███████╗██╗     ██████╗
  ██╔════╝██║  ██║██║██╔════╝██║     ██╔══██╗
  ███████╗███████║██║█████╗  ██║     ██║  ██║
  ╚════██║██╔══██║██║██╔══╝  ██║     ██║  ██║
  ███████║██║  ██║██║███████╗███████╗██████╔╝
  ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═════╝
${RESET}${DIM}  Delta-Neutral LP Protection Protocol — X Layer${RESET}
${DIM}  Powered by OnchainOS • Uniswap V3 • EIP-712${RESET}
    `);
  },
};
