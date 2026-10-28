"""Bounded task planning, verified results and explicit failed-layer recovery."""

import copy
from datetime import datetime, timezone

from .annotations import convertItems, exactPositions, newIdentity
from .errors import AnnotationError, InputError
from .rules import adapterVersion, contractVersion, promptVersion, specVersion, taskTypes, textFingerprint, validateRequest


def utcTimestamp():
    """Use explicit UTC for machine evidence; never infer the course schedule."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def summarizeStatus(layers, effectiveTasks):
    """Count selected/dependency layers only; missing and empty are distinct."""
    successfulCount = sum(layers[task]["status"] == "success" for task in effectiveTasks)
    if successfulCount == len(effectiveTasks):
        return "success"
    return "partialFailure" if successfulCount else "failed"


def requireBaseline(condition):
    """Keep retry validation active under python -O as well."""
    if not condition:
        raise ValueError("invalid retry baseline")


def verifyRetryBaseline(request, response):
    """Validate retained layer contents and provenance before reusing any success."""
    requestedTasks, effectiveTasks = validateRequest(request)
    expectedTopFields = {"contractVersion", "requestId", "revisionId", "textHash", "textLength", "offsetUnit",
                         "requestedTasks", "effectiveTasks", "status", "layers"}
    try:
        requireBaseline(isinstance(response, dict) and set(response) == expectedTopFields)
        requireBaseline(response['contractVersion'] == contractVersion)
        requireBaseline(response['requestId'] == request['requestId'] and response['revisionId'] == request['revisionId'])
        requireBaseline(response['textHash'] == textFingerprint(request['text']))
        requireBaseline(type(response['textLength']) is int and response['textLength'] == len(request['text']))
        requireBaseline(response['offsetUnit'] == 'unicodeCodePoint')
        requireBaseline(response['requestedTasks'] == requestedTasks and response['effectiveTasks'] == effectiveTasks)
        layers = response["layers"]
        requireBaseline(isinstance(layers, dict) and set(layers) == set(taskTypes))
        resultIdentities, itemIdentities = set(), set()
        for taskType in taskTypes:
            layer = layers[taskType]
            requireBaseline(isinstance(layer, dict) and set(layer) == {'taskType', 'selectionReason', 'status', 'attempts', 'result', 'error'})
            requireBaseline(layer['taskType'] == taskType)
            selectionReason = "requested" if taskType in requestedTasks else "dependency" if taskType in effectiveTasks else "notRequested"
            requireBaseline(layer['selectionReason'] == selectionReason)
            requireBaseline(isinstance(layer['attempts'], list))
            for attempt in layer["attempts"]:
                requireBaseline(isinstance(attempt, dict) and set(attempt) == {'attemptId', 'provider', 'model', 'resolvedModel', 'adapterVersion', 'promptVersion', 'startedAt', 'finishedAt', 'status', 'providerRequestId', 'error'})
                requireBaseline(all((isinstance(attempt[field], str) and attempt[field] for field in ('attemptId', 'provider', 'model', 'adapterVersion', 'promptVersion', 'startedAt', 'finishedAt'))))
                requireBaseline(attempt['status'] in ('success', 'failed'))
                requireBaseline(attempt['adapterVersion'] == adapterVersion and attempt['promptVersion'] == promptVersion)
                requireBaseline(attempt['resolvedModel'] is None or isinstance(attempt['resolvedModel'], str))
                requireBaseline(attempt['providerRequestId'] is None or isinstance(attempt['providerRequestId'], str))
                verifySavedError(attempt["error"], attempt["status"] == "failed")
            if taskType not in effectiveTasks:
                requireBaseline(layer['status'] == 'notRequested' and (not layer['attempts']))
                requireBaseline(layer['result'] is None and layer['error'] is None)
                continue
            requireBaseline(layer['status'] in ('success', 'failed'))
            verifySavedError(layer["error"], layer["status"] == "failed")
            if layer["status"] == "failed":
                requireBaseline(layer['result'] is None)
                if layer["error"]["code"] == "dependencyFailed":
                    requireBaseline(taskType == "pos" and layers["segmentation"]["status"] == "failed" and not layer["attempts"])
                else:
                    requireBaseline(layer["attempts"] and layer["attempts"][-1]["status"] == "failed")
                continue
            requireBaseline(layer['attempts'] and layer['attempts'][-1]['status'] == 'success')
            result = layer["result"]
            requireBaseline(isinstance(result, dict) and set(result) == {'resultId', 'revisionId', 'specVersion', 'producerKind', 'dependencyResultId', 'items'})
            requireBaseline(isinstance(result['resultId'], str) and result['resultId'] and (result['resultId'] not in resultIdentities))
            resultIdentities.add(result["resultId"])
            requireBaseline(result['revisionId'] == request['revisionId'] and result['specVersion'] == specVersion)
            requireBaseline(result['producerKind'] == 'automatic' and isinstance(result['items'], list))
            if taskType == "pos":
                segmentationLayer = layers["segmentation"]
                requireBaseline(segmentationLayer['status'] == 'success')
                tokens = segmentationLayer["result"]["items"]
                requireBaseline(result['dependencyResultId'] == segmentationLayer['result']['resultId'])
            else:
                tokens = []
                requireBaseline(result['dependencyResultId'] is None)
            rawItems = []
            for index, item in enumerate(result["items"]):
                requireBaseline(isinstance(item, dict) and isinstance(item['itemId'], str) and item['itemId'])
                requireBaseline(item['itemId'] not in itemIdentities)
                itemIdentities.add(item["itemId"])
                expectedItemFields = {"itemId", "itemText", "spans"}
                if taskType == "keywords":
                    expectedItemFields.add("rank")
                    requireBaseline(type(item['rank']) is int and item['rank'] == index + 1)
                if taskType in ("pos", "ner"):
                    expectedItemFields.add("label")
                if taskType == "pos":
                    expectedItemFields.add("tokenItemId")
                    requireBaseline(index < len(tokens) and item['tokenItemId'] == tokens[index]['itemId'])
                requireBaseline(set(item) == expectedItemFields)
                requireBaseline(isinstance(item['spans'], list))
                for span in item["spans"]:
                    requireBaseline(isinstance(span, dict) and set(span) == {'start', 'end', 'surfaceText'})
                    requireBaseline(type(span['start']) is int and type(span['end']) is int)
                    requireBaseline(0 <= span['start'] < span['end'] <= len(request['text']))
                    requireBaseline(request['text'][span['start']:span['end']] == span['surfaceText'] == item['itemText'])
                if taskType == "pos":
                    rawItems.append({"tokenIndex": index, "label": item["label"]})
                elif taskType == "ner":
                    requireBaseline(len(item['spans']) == 1)
                    positions = exactPositions(request["text"], item["itemText"])
                    rawItems.append({"itemText": item["itemText"], "label": item["label"],
                                     "occurrence": positions.index(item["spans"][0]["start"])})
                else:
                    rawItems.append({"itemText": item["itemText"]})
            rebuiltItems = convertItems(taskType, {"items": rawItems}, request["text"], tokens)
            for item, rebuilt in zip(result["items"], rebuiltItems):
                requireBaseline({key: value for key, value in item.items() if key != 'itemId'} == {key: value for key, value in rebuilt.items() if key != 'itemId'})
            requireBaseline(len(result['items']) == len(rebuiltItems))
        requireBaseline(response['status'] == summarizeStatus(layers, effectiveTasks))
    except (AssertionError, KeyError, TypeError, ValueError, IndexError, AnnotationError):
        raise InputError("incompatibleRetry", "重试基线的文本修订、规则、结果结构或依赖不一致。") from None


def verifySavedError(error, required):
    """Validate error structure without echoing saved error content."""
    if not required:
        requireBaseline(error is None)
    else:
        requireBaseline(isinstance(error, dict) and set(error) == {'code', 'message', 'retryable'})
        requireBaseline(isinstance(error['code'], str) and error['code'])
        requireBaseline(isinstance(error['message'], str) and type(error['retryable']) is bool)


class AnnotationAgent:
    """A synchronous, stateless agent; persistence and cross-process dedup belong to P04."""

    def __init__(self, provider, onProgress=None):
        self.provider = provider
        self.onProgress = onProgress

    def annotate(self, request):
        """Run a new bounded plan without modifying the request or earlier results."""
        return self.runPlan(request)

    def retryFailed(self, request, previousResponse):
        """Explicitly retry only failed effective layers, retaining verified successes."""
        verifyRetryBaseline(request, previousResponse)
        return self.runPlan(request, previousResponse)

    def runPlan(self, request, previousResponse=None):
        """Execute in dependency order, isolate expected failures and preserve history."""
        requestedTasks, effectiveTasks = validateRequest(request)
        text = request["text"]
        layers = {}
        for taskType in taskTypes:
            selectionReason = "requested" if taskType in requestedTasks else "dependency" if taskType in effectiveTasks else "notRequested"
            layers[taskType] = {"taskType": taskType, "selectionReason": selectionReason,
                                "status": "notRequested", "attempts": [], "result": None, "error": None}
        if previousResponse is not None:
            layers = copy.deepcopy(previousResponse["layers"])
        for taskType in taskTypes:
            layer = layers[taskType]
            if taskType not in effectiveTasks or layer["status"] == "success":
                continue
            if taskType == "pos" and layers["segmentation"]["status"] != "success":
                layer.update(status="failed", result=None, error={
                    "code": "dependencyFailed", "message": "词性依赖的分词未成功；未调用词性模型。", "retryable": True,
                })
                self.reportProgress(taskType, "failed")
                continue
            tokens = layers["segmentation"]["result"]["items"] if taskType == "pos" else None
            attempt = {"attemptId": newIdentity(), "provider": self.provider.providerName,
                       "model": self.provider.modelName, "resolvedModel": None, "adapterVersion": adapterVersion,
                       "promptVersion": promptVersion, "startedAt": utcTimestamp(), "finishedAt": "",
                       "status": "failed", "providerRequestId": None, "error": None}
            self.reportProgress(taskType, "running")
            try:
                reply = self.provider.generate(taskType, text, tokens)
                attempt["providerRequestId"] = reply.providerRequestId
                attempt["resolvedModel"] = reply.resolvedModel
                items = convertItems(taskType, reply.payload, text, tokens)
                result = {"resultId": newIdentity(), "revisionId": request["revisionId"], "specVersion": specVersion,
                          "producerKind": "automatic", "dependencyResultId": layers["segmentation"]["result"]["resultId"] if taskType == "pos" else None,
                          "items": items}
                layer.update(status="success", result=result, error=None)
                attempt["status"] = "success"
            except AnnotationError as error:
                layer.update(status="failed", result=None, error=error.asDict())
                attempt["error"] = error.asDict()
            attempt["finishedAt"] = utcTimestamp()
            layer["attempts"].append(attempt)
            self.reportProgress(taskType, layer["status"])
        return {"contractVersion": contractVersion, "requestId": request["requestId"], "revisionId": request["revisionId"],
                "textHash": textFingerprint(text), "textLength": len(text), "offsetUnit": "unicodeCodePoint",
                "requestedTasks": requestedTasks, "effectiveTasks": effectiveTasks,
                "status": summarizeStatus(layers, effectiveTasks), "layers": layers}

    def reportProgress(self, taskType, status):
        """Progress contains task identity and state only, never source text."""
        if self.onProgress is not None:
            self.onProgress(taskType, status)
