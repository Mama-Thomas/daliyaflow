from fastapi import HTTPException, status


class AppError(HTTPException):
    """Base for app-level errors with stable error codes."""

    code: str = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        field: str | None = None,
    ):
        detail = {"code": self.code, "message": message}
        if field:
            detail["field"] = field
        super().__init__(status_code=status_code, detail=detail)


class ResourceNotFoundError(AppError):
    code = "RESOURCE_NOT_FOUND"

    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status_code=status.HTTP_404_NOT_FOUND)


class PermissionDeniedError(AppError):
    code = "PERMISSION_DENIED"

    def __init__(self, message: str = "You do not have access to this resource"):
        super().__init__(message, status_code=status.HTTP_403_FORBIDDEN)


class AuthenticationError(AppError):
    code = "AUTHENTICATION_FAILED"

    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status_code=status.HTTP_401_UNAUTHORIZED)


class ValidationError(AppError):
    code = "VALIDATION_ERROR"

    def __init__(self, message: str, field: str | None = None):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, field=field)


class RateLimitError(AppError):
    code = "RATE_LIMIT_EXCEEDED"

    def __init__(self, message: str = "Too many requests"):
        super().__init__(message, status_code=status.HTTP_429_TOO_MANY_REQUESTS)


class ConflictError(AppError):
    code = "CONFLICT"

    def __init__(self, message: str = "Conflict"):
        super().__init__(message, status_code=status.HTTP_409_CONFLICT)
