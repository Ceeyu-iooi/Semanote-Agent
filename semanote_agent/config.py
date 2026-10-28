"""Explicit provider configuration; local .env is parsed as data, never shell code."""

from dataclasses import dataclass, field
import json
import math
import os
from pathlib import Path
import re
from urllib.parse import urlsplit

from .errors import ConfigError


def loadEnvironment(envFile=".env", environment=None):
    """Read optional UTF-8 KEY=value data; real process variables take precedence."""
    values = {}
    if envFile is not None:
        envPath = Path(envFile)
        if envPath.exists():
            try:
                lines = envPath.read_text(encoding="utf-8-sig").splitlines()
            except (OSError, UnicodeError):
                raise ConfigError("invalidEnvFile", "无法读取本地 UTF-8 配置文件。") from None
            for lineNumber, line in enumerate(lines, 1):
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue
                key, separator, value = stripped.partition("=")
                key, value = key.strip(), value.strip()
                if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) or key in values:
                    raise ConfigError("invalidEnvFile", f"本地配置第 {lineNumber} 行格式或键名有误。")
                if value.startswith(("'", '"')):
                    if len(value) < 2 or value[-1] != value[0]:
                        raise ConfigError("invalidEnvFile", f"本地配置第 {lineNumber} 行引号未闭合。")
                    value = value[1:-1]
                values[key] = value
    values.update(dict(os.environ if environment is None else environment))
    return values


def readPositiveNumber(value, integral=False):
    """Validate numeric settings without echoing configuration content."""
    try:
        parsedValue = int(value) if integral else float(value)
        if not math.isfinite(parsedValue) or parsedValue <= 0:
            raise ValueError()
    except (TypeError, ValueError, OverflowError):
        raise ConfigError("invalidNumericConfig", "超时和输出 token 上限必须为有效正数；token 上限须为整数。") from None
    return parsedValue


@dataclass(frozen=True)
class ProviderConfig:
    """One selected provider, with credentials excluded from repr and diagnostics."""

    provider: str
    baseUrl: str
    model: str
    apiKey: str = field(repr=False)
    timeoutSeconds: float = 60
    maxOutputTokens: int = 8192
    jsonMode: bool = True
    extraBody: dict = field(default_factory=dict, repr=False)

    def __post_init__(self):
        """Also validate callers constructing configs directly, before network activity."""
        if not isinstance(self.provider, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*", self.provider):
            raise ConfigError("invalidProvider", "供应商名称须使用小写英文、数字、下划线或连字符。")
        if not isinstance(self.baseUrl, str):
            raise ConfigError("invalidEndpoint", "供应商端点必须是 HTTPS URL。")
        try:
            parsedUrl = urlsplit(self.baseUrl)
            # Accessing port validates its syntax, even though urllib will use it.
            parsedUrl.port
        except ValueError:
            raise ConfigError("invalidEndpoint", "供应商端点不合法。") from None
        if (parsedUrl.scheme != "https" or not parsedUrl.hostname or parsedUrl.username
                or parsedUrl.password or parsedUrl.query or parsedUrl.fragment
                or any(character.isspace() or ord(character) < 32 for character in self.baseUrl)):
            raise ConfigError("invalidEndpoint", "供应商端点须为无凭据、查询串或片段的 HTTPS 基础 URL。")
        if (not isinstance(self.model, str) or not self.model.strip()
                or self.model.startswith("replace-with")):
            raise ConfigError("missingModel", "请配置实际可用的模型名。")
        if (not isinstance(self.apiKey, str) or not self.apiKey.strip()
                or self.apiKey.startswith("replace-with") or any(character.isspace() for character in self.apiKey)):
            raise ConfigError("missingApiKey", "请在本地环境或 .env 配置所选供应商的有效 API Key。")
        if type(self.maxOutputTokens) is not int or self.maxOutputTokens <= 0:
            raise ConfigError("invalidNumericConfig", "输出 token 上限必须为正整数。")
        if type(self.timeoutSeconds) not in (float, int) or not math.isfinite(self.timeoutSeconds) or self.timeoutSeconds <= 0:
            raise ConfigError("invalidNumericConfig", "超时必须为有限正数。")
        reservedFields = {"model", "messages", "stream", "response_format", "max_tokens", "temperature"}
        if (type(self.jsonMode) is not bool or not isinstance(self.extraBody, dict)
                or reservedFields.intersection(self.extraBody)):
            raise ConfigError("invalidProviderOptions", "供应商扩展参数不合法，或覆盖了保留字段。")
        try:
            json.dumps(self.extraBody, allow_nan=False)
        except (TypeError, ValueError):
            raise ConfigError("invalidProviderOptions", "供应商扩展参数必须为有效 JSON。") from None

    @classmethod
    def fromEnvironment(cls, provider=None, envFile=".env", environment=None):
        """Select one provider explicitly; never borrow another provider's API key."""
        values = loadEnvironment(envFile, environment)
        providerName = provider or values.get("SEMANOTE_PROVIDER", "deepseek")
        if not isinstance(providerName, str) or not re.fullmatch(r"[a-z][a-z0-9_-]*", providerName):
            raise ConfigError("invalidProvider", "供应商名称格式无效。")
        prefix = providerName.upper().replace("-", "_")
        isDeepseek = providerName == "deepseek"
        baseUrl = values.get(prefix + "_BASE_URL", "https://api.deepseek.com" if isDeepseek else "")
        model = values.get(prefix + "_MODEL", "deepseek-flash" if isDeepseek else "")
        apiKey = values.get(prefix + "_API_KEY", "")
        jsonValue = values.get(prefix + "_JSON_MODE", "true" if isDeepseek else "false")
        if jsonValue not in ("true", "false"):
            raise ConfigError("invalidJsonMode", "JSON_MODE 必须为 true 或 false。")
        try:
            extraBody = json.loads(values.get(prefix + "_EXTRA_BODY", "{}"))
        except (ValueError, TypeError):
            raise ConfigError("invalidProviderOptions", "EXTRA_BODY 必须为 JSON 对象。") from None
        if not isinstance(extraBody, dict):
            raise ConfigError("invalidProviderOptions", "EXTRA_BODY 必须为 JSON 对象。")
        if isDeepseek:
            extraBody = {**extraBody, "thinking": {"type": "disabled"}}
        return cls(
            provider=providerName, baseUrl=baseUrl.rstrip("/"), model=model, apiKey=apiKey,
            timeoutSeconds=readPositiveNumber(values.get("SEMANOTE_TIMEOUT_SECONDS", "60")),
            maxOutputTokens=readPositiveNumber(values.get("SEMANOTE_MAX_OUTPUT_TOKENS", "8192"), integral=True),
            jsonMode=jsonValue == "true", extraBody=extraBody,
        )
