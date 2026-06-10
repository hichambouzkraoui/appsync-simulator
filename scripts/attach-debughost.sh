#!/bin/bash
# Waits for the .NET debug host, then launches vsdbg attached to it via pipe.
# Called by launch.json pipeTransport.

WORKSPACE="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="${WORKSPACE}/.debughost.pid"
VSDBG="${HOME}/.vscode/extensions/ms-dotnettools.csharp-2.140.8-darwin-x64/.debugger/x86_64/vsdbg"

# Wait for PID file
for i in $(seq 1 60); do
  [ -f "$PID_FILE" ] && break
  sleep 0.5
done

[ ! -f "$PID_FILE" ] && echo '{"error":"PID file not found"}' && exit 1

PID=$(cat "$PID_FILE")

# Wait for debug pipe
for i in $(seq 1 30); do
  PIPE=$(find /var/folders /tmp -name "clr-debug-pipe-${PID}-*-in" 2>/dev/null | head -1)
  [ -n "$PIPE" ] && break
  sleep 0.5
done

[ -z "$PIPE" ] && echo '{"error":"Debug pipe not found"}' && exit 1

PIPE_BASE="${PIPE%-in}"

# Launch vsdbg connected to the pipe
exec "$VSDBG" --interpreter=vscode --engineLogging --processId=$PID
