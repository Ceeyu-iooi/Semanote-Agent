"""Original synthetic protocol fixtures, not a linguistic gold standard or metric set."""

import copy
import json
import unittest

from semanote_agent import AnnotationAgent, InputError, ProviderError
from semanote_agent.agent import verifyRetryBaseline
from semanote_agent.annotations import convertItems
from semanote_agent.errors import ValidationError
from semanote_agent.providers import ProviderReply
from semanote_agent.rules import textFingerprint


class ScriptedProvider:
    """Deterministic fault injection; never presented as real model capability."""

    providerName = "testFixture"
    modelName = "syntheticFixture"

    def __init__(self, payloads):
        self.payloads = payloads
        self.calls = []

    def generate(self, taskType, text, tokens=None):
        self.calls.append(taskType)
        payload = self.payloads[taskType]
        if isinstance(payload, Exception):
            raise payload
        return ProviderReply(copy.deepcopy(payload), "fixture-request", "fixture-model")


def makeFixture(tasks=None):
    """One mixed-text scenario with manual protocol selections, including a combining mark."""
    request = {"requestId": "fixture-1", "revisionId": "fixture-r1",
               "text": "林澄🙂在杭州。\r\n林澄支付人民币300元。Cafe\u0301",
               "tasks": tasks or ["segmentation", "keywords", "pos", "ner"]}
    words = ["林澄", "🙂", "在", "杭州", "。", "林澄", "支付", "人民币", "300", "元", "。", "Cafe\u0301"]
    tags = ["PROPN", "SYM", "ADP", "PROPN", "PUNCT", "PROPN", "VERB", "NOUN", "NUM", "NOUN", "PUNCT", "NOUN"]
    payloads = {
        "segmentation": {"items": [{"itemText": word} for word in words]},
        "keywords": {"items": [{"itemText": "林澄"}, {"itemText": "杭州"}]},
        "pos": {"items": [{"tokenIndex": index, "label": tag} for index, tag in enumerate(tags)]},
        "ner": {"items": [
            {"itemText": "林澄", "label": "PERSON", "occurrence": 0},
            {"itemText": "林澄", "label": "PERSON", "occurrence": 1},
            {"itemText": "杭州", "label": "LOCATION", "occurrence": 0},
            {"itemText": "人民币300元", "label": "MONEY", "occurrence": 0},
        ]},
    }
    return request, payloads


class AgentBehaviorTests(unittest.TestCase):
    """Check observable task, revision, Unicode and recovery behavior."""

    def testCombinedUnicodeAndRepeatLocations(self):
        request, payloads = makeFixture()
        provider = ScriptedProvider(payloads)
        response = AnnotationAgent(provider).annotate(request)
        self.assertEqual(response["status"], "success")
        self.assertEqual(provider.calls, ["segmentation", "keywords", "pos", "ner"])
        self.assertEqual(response["textHash"], textFingerprint(request["text"]))
        tokens = response["layers"]["segmentation"]["result"]["items"]
        self.assertEqual(tokens[1]["spans"], [{"start": 2, "end": 3, "surfaceText": "🙂"}])
        self.assertEqual(tokens[5]["spans"][0]["start"], 9)
        self.assertEqual(tokens[-1]["itemText"], "Cafe\u0301")
        keyword = response["layers"]["keywords"]["result"]["items"][0]
        self.assertEqual([span["start"] for span in keyword["spans"]], [0, 9])
        self.assertEqual(response["layers"]["pos"]["result"]["items"][5]["tokenItemId"], tokens[5]["itemId"])
        verifyRetryBaseline(request, response)

    def testEachTaskCanBeSelectedIndependently(self):
        for taskType in ("segmentation", "keywords", "pos", "ner"):
            with self.subTest(task=taskType):
                request, payloads = makeFixture([taskType])
                provider = ScriptedProvider(payloads)
                response = AnnotationAgent(provider).annotate(request)
                self.assertEqual(response["status"], "success")
                expectedCalls = ["segmentation", "pos"] if taskType == "pos" else [taskType]
                self.assertEqual(provider.calls, expectedCalls)
                if taskType == "pos":
                    self.assertEqual(response["layers"]["segmentation"]["selectionReason"], "dependency")
                verifyRetryBaseline(request, response)

    def testSegmentationFailureBlocksOnlyPos(self):
        request, payloads = makeFixture()
        payloads["segmentation"] = {"items": []}
        provider = ScriptedProvider(payloads)
        response = AnnotationAgent(provider).annotate(request)
        self.assertEqual(response["status"], "partialFailure")
        self.assertNotIn("pos", provider.calls)
        self.assertEqual(response["layers"]["pos"]["error"]["code"], "dependencyFailed")
        self.assertEqual(response["layers"]["pos"]["attempts"], [])
        self.assertEqual(response["layers"]["ner"]["status"], "success")
        self.assertIsNone(response["layers"]["segmentation"]["result"])
        verifyRetryBaseline(request, response)

    def testEmptyResultUnrequestedAndFailureAreDistinct(self):
        request, payloads = makeFixture(["ner"])
        payloads["ner"] = {"items": []}
        agent = AnnotationAgent(ScriptedProvider(payloads))
        emptyResponse = agent.annotate(request)
        self.assertEqual(emptyResponse["status"], "success")
        self.assertEqual(emptyResponse["layers"]["ner"]["result"]["items"], [])
        self.assertIsNone(emptyResponse["layers"]["keywords"]["result"])
        self.assertEqual(emptyResponse["layers"]["keywords"]["status"], "notRequested")
        payloads["ner"] = ProviderError("providerTimeout", "已脱敏超时。", True)
        failedResponse = AnnotationAgent(ScriptedProvider(payloads)).annotate(request)
        self.assertEqual(failedResponse["status"], "failed")
        self.assertIsNone(failedResponse["layers"]["ner"]["result"])
        self.assertEqual(len(failedResponse["layers"]["ner"]["attempts"]), 1)

    def testExplicitRetryRetainsSuccessAndAppendsOnlyFailedAttempt(self):
        request, payloads = makeFixture()
        brokenPayloads = copy.deepcopy(payloads)
        brokenPayloads["ner"] = {"items": [{"itemText": "不存在", "label": "PERSON", "occurrence": 0}]}
        response = AnnotationAgent(ScriptedProvider(brokenPayloads)).annotate(request)
        baselineCopy, requestCopy = copy.deepcopy(response), copy.deepcopy(request)
        provider = ScriptedProvider(payloads)
        repairedResponse = AnnotationAgent(provider).retryFailed(request, response)
        self.assertEqual(provider.calls, ["ner"])
        self.assertEqual(repairedResponse["status"], "success")
        self.assertEqual(response, baselineCopy)
        self.assertEqual(request, requestCopy)
        self.assertEqual(repairedResponse["layers"]["keywords"], response["layers"]["keywords"])
        self.assertEqual(len(repairedResponse["layers"]["ner"]["attempts"]), 2)
        verifyRetryBaseline(request, repairedResponse)

    def testRetryAfterDependencyFailureCreatesCompatiblePos(self):
        request, payloads = makeFixture(["pos"])
        broken = {**payloads, "segmentation": ProviderError("networkUnavailable", "连接失败。", True)}
        response = AnnotationAgent(ScriptedProvider(broken)).annotate(request)
        repaired = AnnotationAgent(ScriptedProvider(payloads)).retryFailed(request, response)
        self.assertEqual(repaired["status"], "success")
        self.assertEqual(repaired["layers"]["pos"]["result"]["dependencyResultId"], repaired["layers"]["segmentation"]["result"]["resultId"])
        verifyRetryBaseline(request, repaired)

    def testChangedTextCannotReuseOldResult(self):
        request, payloads = makeFixture()
        response = AnnotationAgent(ScriptedProvider(payloads)).annotate(request)
        request["text"] += "新"
        provider = ScriptedProvider(payloads)
        with self.assertRaises(InputError):
            AnnotationAgent(provider).retryFailed(request, response)
        self.assertEqual(provider.calls, [])

    def testTamperedBaselineRejectedBeforeCallingProvider(self):
        request, payloads = makeFixture()
        response = AnnotationAgent(ScriptedProvider(payloads)).annotate(request)
        for mutation in ("span", "dependency", "status", "label", "rank", "unexpectedField"):
            with self.subTest(mutation=mutation):
                modified = copy.deepcopy(response)
                if mutation == "span":
                    modified["layers"]["ner"]["result"]["items"][0]["spans"][0]["start"] = -1
                elif mutation == "dependency":
                    modified["layers"]["pos"]["result"]["dependencyResultId"] = "other-result"
                elif mutation == "status":
                    modified["status"] = "failed"
                elif mutation == "label":
                    modified["layers"]["pos"]["result"]["items"][0]["label"] = "fake"
                elif mutation == "rank":
                    modified["layers"]["keywords"]["result"]["items"][0]["rank"] = True
                else:
                    modified["layers"]["keywords"]["result"]["items"][0]["extra"] = "fake"
                provider = ScriptedProvider(payloads)
                with self.assertRaises(InputError):
                    AnnotationAgent(provider).retryFailed(request, modified)
                self.assertEqual(provider.calls, [])

    def testReinferenceCreatesNewResultWithoutMutatingOld(self):
        request, payloads = makeFixture(["ner"])
        agent = AnnotationAgent(ScriptedProvider(payloads))
        first = agent.annotate(request)
        original = copy.deepcopy(first)
        second = agent.annotate(request)
        self.assertNotEqual(first["layers"]["ner"]["result"]["resultId"], second["layers"]["ner"]["result"]["resultId"])
        self.assertEqual(first, original)

    def testInvalidInputNeverCallsProvider(self):
        for changedField, invalidValue in (("text", " \r\n"), ("text", "\ud800"), ("tasks", []),
                                          ("tasks", ["ner", "ner"]), ("tasks", ["fake"]), ("tasks", [{}]), ("requestId", "")):
            with self.subTest(field=changedField, value=repr(invalidValue)):
                request, payloads = makeFixture()
                request[changedField] = invalidValue
                provider = ScriptedProvider(payloads)
                with self.assertRaises(InputError):
                    AnnotationAgent(provider).annotate(request)
                self.assertEqual(provider.calls, [])


class AnnotationRuleTests(unittest.TestCase):
    """Boundary and selection failures which cannot be verified by plain JSON parsing."""

    def testKeywordsEnumerateOverlappingPositions(self):
        items = convertItems("keywords", {"items": [{"itemText": "哈哈"}]}, "哈哈哈")
        self.assertEqual(items[0]["spans"], [
            {"start": 0, "end": 2, "surfaceText": "哈哈"}, {"start": 1, "end": 3, "surfaceText": "哈哈"}])

    def testNestedEntitiesAndSameSpanDifferentLabels(self):
        items = convertItems("ner", {"items": [
            {"itemText": "杭州青禾研究院", "label": "ORGANIZATION", "occurrence": 0},
            {"itemText": "杭州", "label": "LOCATION", "occurrence": 0},
            {"itemText": "杭州", "label": "ORGANIZATION", "occurrence": 0},
        ]}, "杭州青禾研究院")
        self.assertEqual(len(items), 3)
        self.assertEqual([item["spans"][0]["start"] for item in items], [0, 0, 0])

    def testInvalidCandidatesFailInsteadOfBeingSilentlyDropped(self):
        cases = [
            ("segmentation", {"items": [{"itemText": "甲"}]}, "甲乙"),
            ("segmentation", {"items": [{"itemText": "甲。"}]}, "甲。"),
            ("segmentation", {"items": [{"itemText": "甲 乙"}]}, "甲 乙"),
            ("keywords", {"items": [{"itemText": "乙"}]}, "甲"),
            ("keywords", {"items": [{"itemText": "甲"}] * 2}, "甲"),
            ("keywords", {"items": [{"itemText": str(index)} for index in range(11)]}, "012345678910"),
            ("ner", {"items": [{"itemText": "甲", "label": "PERSON", "occurrence": True}]}, "甲"),
            ("ner", {"items": [{"itemText": "甲", "label": "PERSON", "occurrence": -1}]}, "甲"),
            ("ner", {"items": [{"itemText": "甲", "label": [], "occurrence": 0}]}, "甲"),
            ("ner", {"items": [{"itemText": "甲", "label": "PERSON", "occurrence": 0}] * 2}, "甲"),
            ("ner", {}, "甲"), ("ner", {"items": None}, "甲"),
        ]
        for taskType, payload, text in cases:
            with self.subTest(task=taskType, payload=payload):
                with self.assertRaises(ValidationError):
                    convertItems(taskType, payload, text)


if __name__ == "__main__":
    unittest.main()
