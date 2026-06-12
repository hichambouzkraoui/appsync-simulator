"""
Generic Lambda Host for Python — runs any Lambda handler in persistent mode.

Usage: python3 lambda_host.py <path_to_module.py> <handler_function_name>

Protocol:
  - Prints __READY__ to stdout when loaded
  - Reads one JSON line per invocation from stdin
  - Invokes the handler with (event, context) and writes JSON response to stdout

The Lambda code requires NO modifications.
"""

import sys
import json
import importlib.util
import os
import traceback
from types import SimpleNamespace

def load_handler(module_path, handler_name):
    """Load a Python module from path and return the handler function."""
    module_dir = os.path.dirname(os.path.abspath(module_path))
    if module_dir not in sys.path:
        sys.path.insert(0, module_dir)

    spec = importlib.util.spec_from_file_location("lambda_module", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    handler = getattr(module, handler_name, None)
    if handler is None:
        raise AttributeError(f"Handler '{handler_name}' not found in {module_path}")
    return handler


def create_context():
    """Create a minimal Lambda context object."""
    return SimpleNamespace(
        function_name=os.environ.get("AWS_LAMBDA_FUNCTION_NAME", "local"),
        function_version="$LATEST",
        memory_limit_in_mb=128,
        aws_request_id="local-request-id",
        log_group_name="/aws/lambda/local",
        log_stream_name="local",
        invoked_function_arn="arn:aws:lambda:us-east-1:000000000000:function:local",
        get_remaining_time_in_millis=lambda: 30000,
    )


def main():
    if len(sys.argv) < 3:
        print("Usage: lambda_host.py <module_path> <handler_name>", file=sys.stderr)
        sys.exit(1)

    module_path = sys.argv[1]
    handler_name = sys.argv[2]

    # If PYTHON_LAMBDA_DEBUG is set, start debugpy listener
    debug_port = os.environ.get("PYTHON_LAMBDA_DEBUG")
    if debug_port:
        try:
            import debugpy
            port = int(debug_port)
            debugpy.listen(("localhost", port))
            print(f"[LambdaHost] 🐛 debugpy listening on port {port}", file=sys.stderr)
        except ImportError:
            print("[LambdaHost] debugpy not installed — run: pip install debugpy", file=sys.stderr)
        except Exception as e:
            print(f"[LambdaHost] debugpy failed: {e}", file=sys.stderr)

    try:
        handler = load_handler(module_path, handler_name)
    except Exception as e:
        print(f"Failed to load handler: {e}", file=sys.stderr)
        sys.exit(1)

    # Signal ready
    print("__READY__", flush=True)

    # Persistent loop
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            event = json.loads(line)
            context = create_context()

            # Redirect stdout to stderr during handler execution
            # so print() in Lambda code doesn't corrupt the JSON protocol
            old_stdout = sys.stdout
            sys.stdout = sys.stderr

            result = handler(event, context)

            # Restore stdout for our JSON response
            sys.stdout = old_stdout
            print(json.dumps(result, default=str), flush=True)
        except Exception as e:
            sys.stdout = sys.__stdout__  # ensure stdout is restored
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
