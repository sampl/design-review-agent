// Connects terminal interruption and process exit status to the local adapter.
import { runCli } from "./runCli.ts";

const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
try {
  process.exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    signal: controller.signal,
    write: (message) => console.log(message),
  });
} finally {
  process.off("SIGINT", cancel);
  process.off("SIGTERM", cancel);
}
