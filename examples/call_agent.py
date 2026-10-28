"""Run from the project root with python -m examples.call_agent (uses API quota)."""

import json
from pathlib import Path
import sys

from semanote_agent import AnnotationAgent, ChatCompletionsProvider, ProviderConfig


def main():
    """Load the original synthetic request and emit a verified automatic candidate."""
    projectRoot = Path(__file__).resolve().parent.parent
    request = json.loads((projectRoot / "examples/annotation-request.json").read_text(encoding="utf-8"))
    config = ProviderConfig.fromEnvironment(envFile=projectRoot / ".env")
    response = AnnotationAgent(ChatCompletionsProvider(config)).annotate(request)
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0 if response["status"] == "success" else 3


if __name__ == "__main__":
    raise SystemExit(main())
