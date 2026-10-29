// Launches the shared core through the pinned upstream Linux privilege boundary.
import { spawn, type ChildProcess } from "node:child_process";
import { userInfo } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dropSudo } from "./vendor/openai-codex-action/dropSudo.ts";
import { captureLinuxRunnerCredentials } from "./vendor/openai-codex-action/linuxCredentials.ts";

export const LINUX_DROP_SUDO_SCRIPT = String.raw`
node="$1"
action="$2"
user="$3"
uid="$4"
home="$5"
runner_path="$6"
node_options="$7"
runner_credentials="$8"
shift 8

if [ ! -x /usr/bin/setpriv ]; then
  echo "Linux drop-sudo requires /usr/bin/setpriv." >&2
  exit 1
fi

nobody_gid="$(/usr/bin/id -g nobody 2>/dev/null)" || {
  echo "Linux drop-sudo requires an unprivileged nobody account." >&2
  exit 1
}
case "$nobody_gid" in
  ''|*[!0-9]*|0)
    echo "Linux drop-sudo could not resolve a safe nobody primary group." >&2
    exit 1
    ;;
esac
group_entry="$(/usr/bin/getent group "$nobody_gid" 2>/dev/null)" || {
  echo "Linux drop-sudo could not resolve the nobody primary group." >&2
  exit 1
}
case "$group_entry" in
  nobody:*|nogroup:*) ;;
  *)
    echo "Linux drop-sudo refuses an unexpected nobody primary group." >&2
    exit 1
    ;;
esac

/usr/bin/env -u NODE_OPTIONS "$node" "$action" drop-sudo --root-phase --user "$user" --group sudo --runner-credentials "$runner_credentials" || exit $?
unsafe_nobody_socket="$(/usr/bin/find /run -type s -uid 0 -gid "$nobody_gid" -perm -020 -print -quit)" || {
  echo "Linux drop-sudo could not verify the nobody primary group." >&2
  exit 1
}
if [ -n "$unsafe_nobody_socket" ]; then
  echo "Linux drop-sudo refuses an unsafe nobody primary group." >&2
  exit 1
fi
if /usr/bin/sudo -n -u "$user" -- /usr/bin/sudo -n true 2>/dev/null; then
  echo "Expected sudo to be disabled, but sudo succeeded." >&2
  exit 1
fi
echo "Confirmed the standard sudo probe is disabled."

set -- /usr/bin/setpriv \
  --reuid="$uid" \
  --regid="$nobody_gid" \
  --clear-groups \
  --no-new-privs \
  --bounding-set=-all \
  --inh-caps=-all \
  --ambient-caps=-all \
  -- /usr/bin/env \
  -u SUDO_COMMAND -u SUDO_USER -u SUDO_UID -u SUDO_GID \
  "HOME=$home" "USER=$user" "LOGNAME=$user" "PATH=$runner_path" \
  "NODE_OPTIONS=$node_options" \
  "$@"
echo "Launching Codex with no_new_privs and empty capability sets."
exec "$@"
`;

export function isolationCommand(
  command: string[],
  credentials = captureLinuxRunnerCredentials(),
) {
  if (process.platform !== "linux")
    throw new Error("Isolation requires a disposable Linux runner");
  if (!command.length) throw new Error("Missing isolated command");
  const account = userInfo();
  // Explicit Node options prevent debugger injection into the proxy-connected process.
  const runnerPath = [
    dirname(process.execPath),
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(delimiter);
  return [
    "-n",
    "-E",
    "--",
    "/usr/bin/env",
    "-u",
    "ENV",
    "-u",
    "BASH_ENV",
    "-u",
    "SHELLOPTS",
    "/bin/sh",
    "-c",
    LINUX_DROP_SUDO_SCRIPT,
    "design-review-drop-sudo",
    process.execPath,
    fileURLToPath(import.meta.url),
    account.username,
    String(credentials.userId),
    account.homedir,
    runnerPath,
    "--disable-sigusr1",
    JSON.stringify(credentials),
    ...command,
  ];
}

export function forwardCancellation(
  child: Pick<ChildProcess, "kill" | "once">,
  signalSource: Pick<NodeJS.Process, "on" | "removeListener"> = process,
) {
  const interrupt = () => {
    child.kill("SIGINT");
  };
  const terminate = () => {
    child.kill("SIGTERM");
  };
  signalSource.on("SIGINT", interrupt);
  signalSource.on("SIGTERM", terminate);
  const cleanup = () => {
    signalSource.removeListener("SIGINT", interrupt);
    signalSource.removeListener("SIGTERM", terminate);
  };
  child.once("exit", cleanup);
  child.once("error", cleanup);
  return cleanup;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "drop-sudo") {
    const argument = (name: string) => args[args.indexOf(name) + 1];
    await dropSudo({
      user: argument("--user"),
      group: argument("--group"),
      rootPhase: args.includes("--root-phase"),
      runnerCredentials: argument("--runner-credentials"),
    });
    return;
  }
  if (command !== "run") throw new Error("Expected run or drop-sudo command");
  const child = spawn("/usr/bin/sudo", isolationCommand(args), {
    stdio: "inherit",
  });
  forwardCancellation(child);
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
