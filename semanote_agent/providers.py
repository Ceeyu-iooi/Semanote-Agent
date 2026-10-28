"""Non-streaming Chat Completions adapter using verified HTTPS and no redirects."""

from dataclasses import dataclass
import json
import socket
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

from .errors import ProviderError
from .prompts import buildMessages


def rejectConstant(value):
    """JSON NaN/Infinity are invalid even though Python's decoder accepts them."""
    raise ValueError("non-finite JSON constant")


def uniqueObject(pairs):
    """Fail on duplicate keys instead of silently replacing an earlier value."""
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


def parseJson(rawText):
    """Strictly parse JSON; callers replace parser details with safe public errors."""
    return json.loads(rawText, object_pairs_hook=uniqueObject, parse_constant=rejectConstant)


class NoRedirectHandler(HTTPRedirectHandler):
    """Never forward an authorization header to a redirect destination."""

    def redirect_request(self, request, response, code, message, headers, newUrl):
        """The snake_case method name is required by urllib's external contract."""
        return None


def sendHttps(request, timeoutSeconds):
    """Read one bounded response without printing headers, bodies or credentials."""
    maxResponseBytes = 8 * 1024 * 1024
    opener = build_opener(NoRedirectHandler())
    try:
        with opener.open(request, timeout=timeoutSeconds) as response:
            responseBytes = response.read(maxResponseBytes + 1)
            if len(responseBytes) > maxResponseBytes:
                raise ProviderError("responseTooLarge", "供应商响应超过传输保护上限。")
            return responseBytes
    except HTTPError as httpError:
        statusCode = httpError.code
        httpError.close()
        if statusCode in (401, 403):
            raise ProviderError("authenticationFailed", "供应商拒绝认证或授权。") from None
        if statusCode == 429:
            raise ProviderError("rateLimited", "供应商限流；可稍后显式重试失败层。", True) from None
        raise ProviderError("providerHttpError", f"供应商 HTTP 请求失败（{statusCode}）。", statusCode >= 500) from None
    except (TimeoutError, socket.timeout):
        raise ProviderError("providerTimeout", "供应商请求超时；结果未知，未自动重发。", True) from None
    except (URLError, OSError):
        raise ProviderError("networkUnavailable", "无法完成供应商 HTTPS 连接。", True) from None


@dataclass(frozen=True)
class ProviderReply:
    """Only parsed task data and non-sensitive provenance escape the adapter."""

    payload: dict
    providerRequestId: str | None = None
    resolvedModel: str | None = None


class ChatCompletionsProvider:
    """One configured compatible provider; adapters with other protocols can be injected."""

    def __init__(self, config, transport=None):
        self.config = config
        self.providerName = config.provider
        self.modelName = config.model
        self.transport = transport or sendHttps

    def generate(self, taskType, text, tokens=None):
        """Generate one task; JSON mode never substitutes for local semantic validation."""
        body = {
            **self.config.extraBody,
            "model": self.config.model,
            "messages": buildMessages(taskType, text, tokens),
            "stream": False,
            "max_tokens": self.config.maxOutputTokens,
            "temperature": 0,
        }
        if self.config.jsonMode:
            body["response_format"] = {"type": "json_object"}
        request = Request(
            self.config.baseUrl.rstrip("/") + "/chat/completions",
            data=json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8"),
            headers={"Authorization": "Bearer " + self.config.apiKey, "Content-Type": "application/json", "Accept": "application/json"},
            method="POST",
        )
        rawResponse = self.transport(request, self.config.timeoutSeconds)
        try:
            envelope = parseJson(rawResponse)
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise ProviderError("invalidProviderJson", "供应商响应不是有效 JSON。") from None
        if not isinstance(envelope, dict) or not isinstance(envelope.get("choices"), list) or len(envelope["choices"]) != 1:
            raise ProviderError("invalidProviderEnvelope", "供应商响应缺少唯一的完成结果。")
        choice = envelope["choices"][0]
        if not isinstance(choice, dict) or choice.get("finish_reason") != "stop":
            raise ProviderError("incompleteCompletion", "模型响应被截断、拒绝或未正常完成。")
        message = choice.get("message")
        if not isinstance(message, dict) or message.get("tool_calls") or message.get("refusal"):
            raise ProviderError("unexpectedCompletion", "供应商返回了工具调用、拒绝或非法消息。")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ProviderError("emptyCompletion", "模型返回空内容；未视为零结果成功。")
        try:
            payload = parseJson(content)
        except (ValueError, TypeError, UnicodeError, RecursionError):
            raise ProviderError("invalidCompletionJson", "模型内容不是完整、有效的 JSON 对象。") from None
        providerRequestId = envelope.get("id")
        resolvedModel = envelope.get("model")
        return ProviderReply(
            payload=payload,
            providerRequestId=providerRequestId if isinstance(providerRequestId, str) else None,
            resolvedModel=resolvedModel if isinstance(resolvedModel, str) else None,
        )
