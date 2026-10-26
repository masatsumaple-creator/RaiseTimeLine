package com.raisetimeline.backend.exception;

import java.util.Map;
import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    private final Map<String, String> fieldErrors;

    public ApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    /** fieldErrors は、入力項目名 → メッセージ(画面が、その項目の下に出す)。無ければ null。 */
    public ApiException(HttpStatus status, String code, String message, Map<String, String> fieldErrors) {
        super(message);
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors;
    }

    /** 入力の検証エラー(400)。画面は、message を field の項目の下に出す。 */
    public static ApiException invalid(String field, String message) {
        return new ApiException(
                HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, message, Map.of(field, message));
    }

    public Map<String, String> getFieldErrors() {
        return fieldErrors;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
