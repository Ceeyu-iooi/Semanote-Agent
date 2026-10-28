package io.semanote.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice
public class ApiErrors {
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public ResponseEntity<?> missingResource() {
        return known(new ApiFailure(404, "notFound", "页面或资料不存在，请返回工作台。"));
    }
    @ExceptionHandler(ApiFailure.class)
    public ResponseEntity<?> known(ApiFailure failure) {
        return ResponseEntity.status(failure.status).body(Map.of("error", Map.of("code", failure.code, "message", failure.getMessage())));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<?> tooLarge() {
        return known(new ApiFailure(413, "fileTooLarge", "文件超过 5 MiB，请拆分后导入。"));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, IllegalArgumentException.class})
    public ResponseEntity<?> invalid() {
        return known(new ApiFailure(400, "invalidRequest", "请求格式不正确，请检查输入。"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> unexpected(Exception exception) {
        // Never expose SQL, source text, credentials, or arbitrary exception messages.
        return known(new ApiFailure(500, "operationFailed", "操作未完成；请重试，或检查本地服务配置。"));
    }
}
