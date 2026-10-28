"""Independent general-Chinese annotation agent; Python 3.12, no third-party runtime."""

from .agent import AnnotationAgent
from .config import ProviderConfig
from .errors import AnnotationError, ConfigError, InputError, ProviderError, ValidationError
from .providers import ChatCompletionsProvider
from .rules import contractVersion

__all__ = ["AnnotationAgent", "ProviderConfig", "ChatCompletionsProvider", "AnnotationError", "ConfigError",
           "InputError", "ProviderError", "ValidationError", "contractVersion"]
