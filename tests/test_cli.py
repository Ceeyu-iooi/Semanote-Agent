"""CLI integration boundaries without real calls or real credentials."""

from contextlib import redirect_stderr, redirect_stdout
import copy
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from semanote_agent.__main__ import main
from test_agent import ScriptedProvider, makeFixture
from test_providers import makeTemporaryDirectory


class CliBehaviorTests(unittest.TestCase):
    """Exit codes, machine-readable output, explicit recovery and no-clobber files."""

    def invoke(self, arguments, provider):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr), patch("semanote_agent.__main__.ProviderConfig.fromEnvironment"), patch(
                "semanote_agent.__main__.ChatCompletionsProvider", return_value=provider):
            exitCode = main(arguments)
        return exitCode, stdout.getvalue(), stderr.getvalue()

    def testCliWritesValidJsonAndRetriesOnlyFailure(self):
        with makeTemporaryDirectory() as temporaryDirectory:
            request, payloads = makeFixture()
            root = Path(temporaryDirectory)
            inputPath, initialPath, retryPath = root / "input.json", root / "initial.json", root / "retry.json"
            inputPath.write_text(json.dumps(request, ensure_ascii=False), encoding="utf-8")
            broken = copy.deepcopy(payloads)
            broken["ner"] = {"items": None}
            initialProvider = ScriptedProvider(broken)
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", str(inputPath), "--output", str(initialPath)], initialProvider)
            self.assertEqual(exitCode, 3)
            self.assertEqual(stdout, "")
            self.assertIn("ner: failed", stderr)
            self.assertNotIn(request["text"], stderr)
            self.assertEqual(json.loads(initialPath.read_text(encoding="utf-8"))["status"], "partialFailure")
            provider = ScriptedProvider(payloads)
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", str(inputPath), "--retry-from", str(initialPath), "--output", str(retryPath), "--quiet"], provider)
            self.assertEqual(exitCode, 0)
            self.assertEqual(provider.calls, ["ner"])
            self.assertEqual(stderr, "")
            self.assertEqual(json.loads(retryPath.read_text(encoding="utf-8"))["status"], "success")

    def testExistingOutputNeverOverwrittenOrSentToModel(self):
        with makeTemporaryDirectory() as temporaryDirectory:
            outputPath = Path(temporaryDirectory) / "existing.json"
            outputPath.write_text("keep original", encoding="utf-8")
            provider = ScriptedProvider({})
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", "not-read.json", "--output", str(outputPath)], provider)
            self.assertEqual(exitCode, 2)
            self.assertEqual(json.loads(stderr)["error"]["code"], "outputExists")
            self.assertEqual(outputPath.read_text(encoding="utf-8"), "keep original")
            self.assertEqual(provider.calls, [])

    def testMissingOutputDirectoryFailsBeforeModelCall(self):
        with makeTemporaryDirectory() as temporaryDirectory:
            provider = ScriptedProvider({})
            outputPath = Path(temporaryDirectory) / "missing" / "result.json"
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", "not-read.json", "--output", str(outputPath)], provider)
            self.assertEqual(exitCode, 2)
            self.assertEqual(json.loads(stderr)["error"]["code"], "outputUnavailable")
            self.assertEqual(provider.calls, [])

    def testStdoutContainsOnlyJson(self):
        with makeTemporaryDirectory() as temporaryDirectory:
            request, payloads = makeFixture(["ner"])
            inputPath = Path(temporaryDirectory) / "input.json"
            inputPath.write_text(json.dumps(request), encoding="utf-8")
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", str(inputPath)], ScriptedProvider(payloads))
            self.assertEqual(exitCode, 0)
            self.assertEqual(json.loads(stdout)["status"], "success")
            self.assertIn("ner: success", stderr)

    def testMalformedInputNeverReachesModel(self):
        with makeTemporaryDirectory() as temporaryDirectory:
            inputPath = Path(temporaryDirectory) / "input.json"
            inputPath.write_text('{"text":"private", "text":"other"}', encoding="utf-8")
            provider = ScriptedProvider({})
            exitCode, stdout, stderr = self.invoke(["annotate", "--input", str(inputPath)], provider)
            self.assertEqual(exitCode, 2)
            self.assertNotIn("private", stderr)
            self.assertEqual(provider.calls, [])


if __name__ == "__main__":
    unittest.main()
