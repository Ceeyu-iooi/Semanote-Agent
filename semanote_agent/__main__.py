"""JSON file/stdin CLI with safe diagnostics and exclusive output creation."""

import argparse
import json
from pathlib import Path
import sys

from .agent import AnnotationAgent
from .config import ProviderConfig
from .errors import AnnotationError, InputError
from .providers import ChatCompletionsProvider, parseJson


def readJsonFile(fileName):
    """Load UTF-8 JSON without interpolating code, environment variables or shell syntax."""
    try:
        rawBytes = sys.stdin.buffer.read() if fileName == "-" else Path(fileName).read_bytes()
        return parseJson(rawBytes.decode("utf-8-sig"))
    except (OSError, UnicodeError, ValueError, RecursionError):
        raise InputError("invalidInputFile", "无法读取有效的 UTF-8 JSON 输入。") from None


def writeResult(result, fileName=None):
    """Create a new output only; explicitly selected files are never overwritten."""
    serialized = json.dumps(result, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if fileName is None:
        sys.stdout.write(serialized)
        return
    try:
        with Path(fileName).open("x", encoding="utf-8", newline="\n") as outputFile:
            outputFile.write(serialized)
    except FileExistsError:
        raise InputError("outputExists", "输出文件已存在，请选择新的文件名。") from None
    except OSError:
        raise InputError("outputUnavailable", "无法创建输出文件；请核对目录和权限。") from None


def main(arguments=None):
    """Return 0 on success, 2 on invalid input/config, 3 on failed/partial annotation."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="独立中文文本标注智能体：分词、关键词、词性、命名实体。")
    commands = parser.add_subparsers(dest="command", required=True)
    annotateParser = commands.add_parser("annotate", help="标注一个确定修订的 JSON 请求")
    annotateParser.add_argument("--input", required=True, help="UTF-8 JSON 请求文件；- 表示 stdin")
    annotateParser.add_argument("--output", help="新建的输出文件；省略则输出到 stdout")
    annotateParser.add_argument("--retry-from", help="显式重试此前响应的失败层，保留成功层")
    annotateParser.add_argument("--quiet", action="store_true", help="关闭 stderr 逐层进度")
    checkParser = commands.add_parser("check-config", help="仅检查本地配置，不调用供应商")
    for commandParser in (annotateParser, checkParser):
        commandParser.add_argument("--provider", help="显式选择供应商及其同名前缀配置")
        commandParser.add_argument("--env-file", default=".env", help="本地 KEY=value 文件，默认 .env")
    parsed = parser.parse_args(arguments)
    try:
        # Check output ownership before incurring any model request or cost.
        if parsed.command == "annotate" and parsed.output and (Path(parsed.output).exists() or Path(parsed.output).is_symlink()):
            raise InputError("outputExists", "输出路径已存在，请选择新的文件名。")
        if parsed.command == "annotate" and parsed.output and not Path(parsed.output).parent.is_dir():
            raise InputError("outputUnavailable", "输出目录不存在；未调用供应商。")
        request = readJsonFile(parsed.input) if parsed.command == "annotate" else None
        previousResponse = readJsonFile(parsed.retry_from) if parsed.command == "annotate" and parsed.retry_from else None
        config = ProviderConfig.fromEnvironment(parsed.provider, parsed.env_file)
        if parsed.command == "check-config":
            writeResult({"status": "configured", "provider": config.provider, "model": config.model,
                         "timeoutSeconds": config.timeoutSeconds, "maxOutputTokens": config.maxOutputTokens})
            return 0
        progressCallback = None if parsed.quiet else lambda task, status: print(f"{task}: {status}", file=sys.stderr)
        agent = AnnotationAgent(ChatCompletionsProvider(config), progressCallback)
        result = agent.retryFailed(request, previousResponse) if previousResponse is not None else agent.annotate(request)
        writeResult(result, parsed.output)
        return 0 if result["status"] == "success" else 3
    except AnnotationError as error:
        print(json.dumps({"error": error.asDict()}, ensure_ascii=False), file=sys.stderr)
        return 2
    except (OSError, UnicodeError, ValueError, RecursionError, TypeError):
        print(json.dumps({"error": {"code": "internalFailure", "message": "处理未完成；未输出可能含敏感内容的异常细节。", "retryable": False}}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
