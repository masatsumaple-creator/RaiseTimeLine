package com.raisetimeline.backend.logging;

import static net.logstash.logback.argument.StructuredArguments.kv;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 1 リクエストにつき 1 行、完了時にアクセスログを構造化して出す。
 * Spring Security より前に動くので、401 / 403 も記録できる。
 * MDC に requestId を入れるため、このリクエスト中の他のログにも同じ requestId が付く。
 * userId は認証が済んだあとに {@link UserIdMdcFilter} が MDC へ入れ、ここで完了時に読む。
 * クエリ文字列・ヘッダー・Cookie・本文は、トークンや個人情報が入りうるので記録しない。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID_HEADER = "X-Request-Id";
    public static final String MDC_REQUEST_ID = "requestId";
    public static final String MDC_USER_ID = "userId";

    /** 受け取った X-Request-Id を信用してよい形。ログの改ざんや肥大化を避けるため、短い英数字などに限る。 */
    private static final Pattern SAFE_REQUEST_ID = Pattern.compile("[A-Za-z0-9._-]{1,64}");

    private static final Logger log = LoggerFactory.getLogger("http.access");

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        // API 仕様と Swagger UI は、ログを埋めるだけなので記録しない
        return path.startsWith("/api/v3/api-docs") || path.startsWith("/api/swagger-ui");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long start = System.nanoTime();
        String requestId = resolveRequestId(request.getHeader(REQUEST_ID_HEADER));
        MDC.put(MDC_REQUEST_ID, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            logCompleted(request, response, Duration.ofNanos(System.nanoTime() - start));
            MDC.remove(MDC_REQUEST_ID);
            MDC.remove(MDC_USER_ID);
        }
    }

    private void logCompleted(HttpServletRequest request, HttpServletResponse response, Duration elapsed) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        int status = response.getStatus();
        long durationMs = elapsed.toMillis();
        boolean slow = elapsed.compareTo(LogThresholds.forRequest(method, path)) > 0;

        // 先頭の 4 つがメッセージの {} に入り、残りの kv が JSON のフィールドになる(メッセージには出ない)
        Object[] args = {method, path, status, durationMs,
                kv("method", method), kv("path", path), kv("status", status),
                kv("durationMs", durationMs), kv("slow", slow)};
        String message = "{} {} {} {}ms";
        if (status >= 500) {
            log.error(message, args);
        } else if (status >= 400 || slow) {
            log.warn(message, args);
        } else {
            log.info(message, args);
        }
    }

    private static String resolveRequestId(String header) {
        if (header != null && SAFE_REQUEST_ID.matcher(header).matches()) {
            return header;
        }
        return UUID.randomUUID().toString();
    }
}
