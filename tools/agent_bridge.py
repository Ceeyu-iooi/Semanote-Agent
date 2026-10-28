"""Historical P03 Python bridge; Web 0.1.1 uses agent/bridge.mjs instead."""

import json
from pathlib import Path
import sys
from dataclasses import replace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from semanote_agent import AnnotationAgent
from semanote_agent.agent import verifyRetryBaseline
from semanote_agent.annotations import convertItems, newIdentity
from semanote_agent.config import ProviderConfig
from semanote_agent.errors import AnnotationError
from semanote_agent.providers import ChatCompletionsProvider, parseJson
from semanote_agent.rules import specVersion, taskTypes


def runEnvelope(envelope):
    """Keep manual conversion local and require explicit remote consent for inference."""
    action = envelope.get("action")
    if action == "manual":
        text, revisionId, requestedLayers = envelope["text"], envelope["revisionId"], envelope["layers"]
        if not isinstance(requestedLayers, dict) or not set(requestedLayers).issubset(taskTypes):
            raise ValueError("Invalid layers")
        layers, tokens, segmentationId = {}, [], None
        for taskType in taskTypes:
            rawItems = requestedLayers.get(taskType)
            if rawItems is None:
                layers[taskType] = {"taskType": taskType, "status": "notRequested", "result": None, "error": None}
                continue
            if taskType == "pos" and segmentationId is None:
                raise ValueError("POS requires segmentation")
            items = convertItems(taskType, {"items": rawItems}, text, tokens)
            resultId = newIdentity()
            if taskType == "segmentation":
                tokens, segmentationId = items, resultId
            layers[taskType] = {"taskType": taskType, "status": "success", "error": None, "result": {
                "resultId": resultId, "revisionId": revisionId, "specVersion": specVersion,
                "producerKind": "manual", "dependencyResultId": segmentationId if taskType == "pos" else None,
                "items": items,
            }}
        if not any(layer["status"] == "success" for layer in layers.values()):
            raise ValueError("No layers")
        return {"layers": layers}
    request = envelope["request"]
    if action == "validateAutomatic":
        verifyRetryBaseline(request, envelope["response"])
        return envelope["response"]
    if action != "annotate" or envelope.get("remoteConsent") is not True:
        raise ValueError("Missing explicit remote consent")
    config = ProviderConfig.fromEnvironment(envelope.get("provider"), ".env")
    preferencesPath=Path('profile/runtime/model-preferences.json')
    preferences=envelope.get('modelPreferences')
    if preferences is None and preferencesPath.exists():
        preferences=json.loads(preferencesPath.read_text(encoding='utf-8'))
    if preferences is not None:
        if preferences.get('provider')==config.provider:
            config=replace(config,model=preferences.get('model') or config.model,timeoutSeconds=preferences.get('timeoutSeconds',config.timeoutSeconds))
    def checkpoint(taskType, status, layer):
        if envelope.get('streamProgress'):
            print(json.dumps({'event':'progress','taskType':taskType,'status':status,'layer':layer},ensure_ascii=False),flush=True)
    agent = AnnotationAgent(ChatCompletionsProvider(config), onCheckpoint=checkpoint)
    previousResponse = envelope.get("previousResponse")
    return agent.retryFailed(request, previousResponse) if previousResponse else agent.annotate(request)


if __name__ == "__main__":
    try:
        envelope = parseJson(sys.stdin.buffer.read(8 * 1024 * 1024).decode("utf-8"))
        result = runEnvelope(envelope)
        print(json.dumps(result, ensure_ascii=False, allow_nan=False))
    except AnnotationError as error:
        print(json.dumps({"error": error.asDict()}, ensure_ascii=False))
        raise SystemExit(2)
    except (KeyError, TypeError, ValueError, OSError, RecursionError):
        print(json.dumps({"error": {"code": "invalidAnnotation", "message": "标注数据、依赖或配置不符合契约。", "retryable": False}}, ensure_ascii=False))
        raise SystemExit(2)
