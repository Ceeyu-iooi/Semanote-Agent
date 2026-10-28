"""Stable, deliberately non-sensitive errors for callers and the CLI."""


class AnnotationError(Exception):
    """A public failure; messages must never contain raw text or credentials."""

    def __init__(self, code, message, retryable=False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable

    def asDict(self):
        """Return only the documented, safe error fields."""
        return {"code": self.code, "message": self.message, "retryable": self.retryable}


class InputError(AnnotationError):
    """An invalid request or incompatible retry baseline; no API call is made."""


class ConfigError(AnnotationError):
    """Invalid local provider configuration."""


class ProviderError(AnnotationError):
    """A failed transport or invalid provider envelope."""


class ValidationError(AnnotationError):
    """A candidate failed the frozen annotation rules."""
