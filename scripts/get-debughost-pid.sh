#!/bin/bash
# Waits for the .NET debug host to start, then prints its PID
PID_FILE="./examples/.debug-host/.debughost.pid"
for i in $(seq 1 30); do
  if [ -f "$PID_FILE" ]; then
    cat "$PID_FILE"
    exit 0
  fi
  sleep 1
done
echo "0"
