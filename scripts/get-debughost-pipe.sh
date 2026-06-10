#!/bin/bash
# Waits for the debug host to start, then prints the path to its debug pipe
# Used by launch.json pipeTransport to auto-attach without a process picker

PID_FILE="$(dirname "$0")/../.debughost.pid"

# Wait for PID file
for i in $(seq 1 60); do
  if [ -f "$PID_FILE" ]; then
    break
  fi
  sleep 0.5
done

if [ ! -f "$PID_FILE" ]; then
  echo "ERROR: PID file not found" >&2
  exit 1
fi

PID=$(cat "$PID_FILE")

# Wait for the debug pipe to appear
for i in $(seq 1 30); do
  PIPE=$(find /var/folders /tmp -name "clr-debug-pipe-${PID}-*-in" 2>/dev/null | head -1)
  if [ -n "$PIPE" ]; then
    # Return the pipe base path (without -in/-out suffix)
    echo "${PIPE%-in}"
    exit 0
  fi
  sleep 0.5
done

echo "ERROR: Debug pipe not found for PID $PID" >&2
exit 1
