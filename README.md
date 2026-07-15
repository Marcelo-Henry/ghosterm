<p align="center">
  <img src="./ghosterm.png" alt="Ghosterm" width="720">
</p>

<p align="center">
  Automate interactive terminal applications from the command line.
</p>

Ghosterm runs a process inside a virtual terminal and gives scripts and agents a small, JSON-based interface for controlling it. Spawn a TUI, send text or special keys, wait for screen output, inspect the terminal as text, or save a PNG snapshot.

## What It Does

- Runs commands in a PTY-backed virtual terminal.
- Keeps one terminal session alive across CLI invocations.
- Sends text input and common control keys.
- Waits for screen content to appear.
- Captures the visible terminal as text or PNG.
- Reports process lifecycle state and cleans up idle sessions.

## Requirements

- Node.js 20 or later
- A Unix-like environment with Unix domain sockets

## Getting Started

Install dependencies and build the project:

```bash
npm install
npm run build
```

Run the built CLI directly:

```bash
node dist/cli.js --help
```

During development, run the TypeScript entrypoint:

```bash
npm run dev -- --help
```

## Example

Start an interactive shell, run a command, and inspect the virtual terminal:

```bash
ghosterm spawn bash --cols 120 --rows 35
ghosterm wait "\\$"
ghosterm input "printf 'hello from Ghosterm'"
ghosterm key enter
ghosterm wait "hello from Ghosterm"
ghosterm screenshot-text
ghosterm close
```

Every command writes JSON to standard output. The daemon persists in the background for the session and exits after ten minutes without activity.

## Commands

| Command | Description |
| --- | --- |
| `spawn <cmd> [args...]` | Start a process in a virtual terminal. Replaces the current session. |
| `screenshot-text` | Return the current terminal buffer as text. |
| `screenshot-png [file]` | Save a PNG snapshot. Defaults to `/tmp/ghosterm.png`. |
| `input <text>` | Write text to the process input stream. |
| `key <key>` | Send a special key such as `enter`, `escape`, `up`, or `ctrl+c`. |
| `wait <pattern>` | Wait until a pattern appears in the terminal buffer. |
| `resize <cols> <rows>` | Resize the virtual terminal. |
| `status` | Return the PID and lifecycle state of the current process. |
| `close` | Stop the current process and shut down the daemon. |

`spawn` accepts `--cwd <path>`, `--cols <number>`, and `--rows <number>`. `wait` accepts `--timeout <milliseconds>` and treats its pattern as a JavaScript regular expression.

## Session Model

Ghosterm uses a local Unix socket to communicate with a background daemon. The daemon owns one active terminal session for the current user. This keeps command invocations simple while allowing terminal state to persist between them.

```text
ghosterm CLI  ->  local daemon  ->  PTY process
                     |
                     +-> xterm screen buffer -> text / PNG snapshot
```

Starting another process with `spawn` closes the existing session. Use `status` to check whether the current process is still running and `close` when the session is no longer needed.

## Development

```bash
npm run build
npm test
```

The test suite covers terminal sessions, the command protocol, daemon lifecycle, and the CLI integration flow.

## License

MIT
