package io.semanote.api;

/** A safe error message whose contents may be returned to the browser. */
public class ApiFailure extends RuntimeException {
    public final int status;
    public final String code;

    public ApiFailure(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}
