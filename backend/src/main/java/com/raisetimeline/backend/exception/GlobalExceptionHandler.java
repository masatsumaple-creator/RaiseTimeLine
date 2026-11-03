package com.raisetimeline.backend.exception;

import static net.logstash.logback.argument.StructuredArguments.kv;

import com.raisetimeline.backend.dto.ErrorResponse;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * すべてのエラーを { code, message, fieldErrors? } の形で返す。
 * アプリが投げる ApiException と、入力の検証エラーに加えて、Spring 標準のエラー(型の不一致、必須パラメータの欠落、
 * 405・415・404 など)も、ステータスやヘッダー(405 の Allow など)はそのままに、本文だけ同じ形に変える。
 * 想定外の例外は 500 にし、内容(スタックトレースや例外のメッセージ)は返さず、ログにだけ残す。
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    public static final String VALIDATION_ERROR = "VALIDATION_ERROR";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String METHOD_NOT_ALLOWED = "METHOD_NOT_ALLOWED";
    public static final String UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE";
    public static final String NOT_ACCEPTABLE = "NOT_ACCEPTABLE";
    public static final String INTERNAL_ERROR = "INTERNAL_ERROR";

    static final String INVALID_INPUT_MESSAGE = "入力内容が正しくありません";
    static final String INTERNAL_ERROR_MESSAGE = "サーバーでエラーが発生しました。しばらくしてからやり直してください";

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<ErrorResponse> handleApi(ApiException e) {
        // 想定内のエラー。原因をたどれるよう code を残す(メッセージは利用者向けで、個人情報を含まない)
        log.warn("業務エラー", kv("errorCode", e.getCode()), kv("status", e.getStatus().value()));
        return ResponseEntity.status(e.getStatus()).body(new ErrorResponse(e.getCode(), e.getMessage(), e.getFieldErrors()));
    }

    /**
     * 想定外の例外。ログに残し、利用者には内容を見せない。
     * 認証・認可の例外は、Spring Security が 401 / 403 に変えるので、ここでは受けずに投げ直す。
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception e) throws Exception {
        if (e instanceof AccessDeniedException || e instanceof AuthenticationException) {
            throw e;
        }
        log.error("想定外の例外", kv("errorType", e.getClass().getName()), e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(new ErrorResponse(INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE));
    }

    /** 入力の検証エラー。項目ごとのメッセージを fieldErrors に入れる。 */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        e.getBindingResult().getFieldErrors()
                .forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        String message = fieldErrors.values().stream().findFirst().orElse(INVALID_INPUT_MESSAGE);
        return body(HttpStatus.BAD_REQUEST, headers, new ErrorResponse(VALIDATION_ERROR, message, fieldErrors));
    }

    /** 本文が JSON として読めない。 */
    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(
            HttpMessageNotReadableException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return body(HttpStatus.BAD_REQUEST, headers, new ErrorResponse(VALIDATION_ERROR, INVALID_INPUT_MESSAGE));
    }

    /** パスやクエリの値の型が違う(例: 数値の場所に abc、大きすぎる数)。どの項目かを、fieldErrors で返す。 */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, String> fieldErrors = e.getPropertyName() == null
                ? null
                : Map.of(e.getPropertyName(), "値の形式が正しくありません");
        return body(HttpStatus.BAD_REQUEST, headers, new ErrorResponse(VALIDATION_ERROR, INVALID_INPUT_MESSAGE, fieldErrors));
    }

    /** 必須のクエリパラメータが無い。 */
    @Override
    protected ResponseEntity<Object> handleMissingServletRequestParameter(
            MissingServletRequestParameterException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        Map<String, String> fieldErrors = Map.of(e.getParameterName(), "必須です");
        return body(HttpStatus.BAD_REQUEST, headers, new ErrorResponse(VALIDATION_ERROR, INVALID_INPUT_MESSAGE, fieldErrors));
    }

    /** 上のどれにも当たらない Spring 標準のエラー(405・406・415・404 など)。ステータスとヘッダーはそのままで、本文だけ共通の形にする。 */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception e, Object ignoredBody, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        return body(statusCode, headers, forStatus(statusCode));
    }

    private static ResponseEntity<Object> body(HttpStatusCode status, HttpHeaders headers, ErrorResponse response) {
        return ResponseEntity.status(status).headers(headers).body(response);
    }

    private static ErrorResponse forStatus(HttpStatusCode status) {
        return switch (status.value()) {
            case 400 -> new ErrorResponse(VALIDATION_ERROR, INVALID_INPUT_MESSAGE);
            case 404 -> new ErrorResponse(NOT_FOUND, "見つかりません");
            case 405 -> new ErrorResponse(METHOD_NOT_ALLOWED, "この操作は許可されていません");
            case 406 -> new ErrorResponse(NOT_ACCEPTABLE, "リクエストの形式に対応していません");
            case 415 -> new ErrorResponse(UNSUPPORTED_MEDIA_TYPE, "リクエストの形式が正しくありません");
            default -> status.is5xxServerError()
                    ? new ErrorResponse(INTERNAL_ERROR, INTERNAL_ERROR_MESSAGE)
                    : new ErrorResponse(VALIDATION_ERROR, "リクエストを処理できませんでした");
        };
    }
}
