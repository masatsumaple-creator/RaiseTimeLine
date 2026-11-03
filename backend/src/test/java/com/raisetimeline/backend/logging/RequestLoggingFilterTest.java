package com.raisetimeline.backend.logging;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class RequestLoggingFilterTest {

    private final RequestLoggingFilter filter = new RequestLoggingFilter();
    private final ListAppender<ILoggingEvent> appender = new ListAppender<>();
    private Logger accessLogger;

    @BeforeEach
    void attachAppender() {
        accessLogger = (Logger) LoggerFactory.getLogger("http.access");
        appender.start();
        accessLogger.addAppender(appender);
    }

    @AfterEach
    void detachAppender() {
        accessLogger.detachAppender(appender);
        MDC.clear();
    }

    @Test
    void 完了時に1行だけ出し_クエリ文字列は含めない() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/timeline");
        request.setQueryString("cursor=secret-token");

        run(request, 200);

        assertThat(appender.list).hasSize(1);
        ILoggingEvent event = appender.list.get(0);
        assertThat(event.getLevel()).isEqualTo(Level.INFO);
        assertThat(event.getFormattedMessage()).startsWith("GET /api/timeline 200").doesNotContain("secret-token");
        // JSON のフィールドとして出す値(kv)が、引数に入っていること
        assertThat(event.getArgumentArray()).extracting(String::valueOf)
                .contains("method=GET", "path=/api/timeline", "status=200", "slow=false");
    }

    @Test
    void 安全なX_Request_Idは引き継ぎ_レスポンスにも返す() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/timeline");
        request.addHeader("X-Request-Id", "abc-123");

        MockHttpServletResponse response = run(request, 200);

        assertThat(response.getHeader("X-Request-Id")).isEqualTo("abc-123");
        assertThat(appender.list.get(0).getMDCPropertyMap()).containsEntry("requestId", "abc-123");
    }

    @Test
    void 不正なX_Request_Idは捨てて採番し直す() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/timeline");
        request.addHeader("X-Request-Id", "bad id\nwith newline");

        MockHttpServletResponse response = run(request, 200);

        assertThat(response.getHeader("X-Request-Id")).matches("[0-9a-f-]{36}");
    }

    @Test
    void ステータスに応じてレベルを変える() throws Exception {
        run(new MockHttpServletRequest("GET", "/api/posts/1"), 404);
        run(new MockHttpServletRequest("GET", "/api/posts/1"), 500);

        assertThat(appender.list).extracting(ILoggingEvent::getLevel).containsExactly(Level.WARN, Level.ERROR);
    }

    @Test
    void 認証後にMDCへ入ったuserIdを完了ログに付け_終わったら消す() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/timeline");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> MDC.put("userId", "42"));

        assertThat(appender.list.get(0).getMDCPropertyMap()).containsEntry("userId", "42");
        assertThat(MDC.get("userId")).isNull();
        assertThat(MDC.get("requestId")).isNull();
    }

    @Test
    void API仕様とSwagger_UIは記録しない() throws Exception {
        run(new MockHttpServletRequest("GET", "/api/v3/api-docs"), 200);
        run(new MockHttpServletRequest("GET", "/api/swagger-ui/index.html"), 200);

        assertThat(appender.list).isEmpty();
    }

    @Test
    void 閾値はリクエストの種類ごとに変わる() {
        assertThat(LogThresholds.forRequest("POST", "/api/auth/login")).isEqualTo(LogThresholds.AUTH);
        assertThat(LogThresholds.forRequest("GET", "/api/timeline")).isEqualTo(LogThresholds.LIST);
        assertThat(LogThresholds.forRequest("GET", "/api/search/users")).isEqualTo(LogThresholds.LIST);
        assertThat(LogThresholds.forRequest("POST", "/api/images/upload-url")).isEqualTo(LogThresholds.IMAGE);
        assertThat(LogThresholds.forRequest("POST", "/api/posts")).isEqualTo(LogThresholds.DEFAULT);
    }

    private MockHttpServletResponse run(MockHttpServletRequest request, int status) throws IOException, jakarta.servlet.ServletException {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> ((MockHttpServletResponse) res).setStatus(status));
        return response;
    }
}
