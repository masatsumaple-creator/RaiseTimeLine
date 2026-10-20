package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class RefreshTokenIntegrationTest {

    private static final String COOKIE_NAME = "refresh_token";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void cleanUsers() {
        // refresh_tokens は ON DELETE CASCADE で一緒に消える
        jdbc.update("DELETE FROM users");
    }

    private MvcResult signup(String email, String handle) throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"password1","handle":"%s","displayName":"テスト"}
                                """.formatted(email, handle)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private MvcResult login(String email) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"password1\"}".formatted(email)))
                .andExpect(status().isOk())
                .andReturn();
    }

    private static String setCookieHeader(MvcResult result) {
        return result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(h -> h.startsWith(COOKIE_NAME + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("refresh_token の Set-Cookie がありません"));
    }

    private static String refreshTokenOf(MvcResult result) {
        String header = setCookieHeader(result);
        return header.substring((COOKIE_NAME + "=").length(), header.indexOf(';'));
    }

    private static String accessTokenOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
    }

    private int refreshStatus(String refreshToken) throws Exception {
        return refreshRaw(refreshToken).andReturn().getResponse().getStatus();
    }

    private org.springframework.test.web.servlet.ResultActions refreshRaw(String refreshToken) throws Exception {
        var request = post("/api/auth/refresh");
        if (refreshToken != null) {
            request = request.cookie(new Cookie(COOKIE_NAME, refreshToken));
        }
        return mockMvc.perform(request);
    }

    private MvcResult refresh(String refreshToken) throws Exception {
        return refreshRaw(refreshToken).andExpect(status().isOk()).andReturn();
    }

    private int revokedRows() {
        return jdbc.queryForObject("SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NOT NULL", Integer.class);
    }

    // ---- 発行 ----

    @Test
    void signupAndLoginSetHttpOnlyStrictCookieScopedToAuthApi() throws Exception {
        MvcResult signedUp = signup("tamura@example.com", "tamura");
        MvcResult loggedIn = login("tamura@example.com");

        for (MvcResult result : List.of(signedUp, loggedIn)) {
            String header = setCookieHeader(result);
            assertThat(header).contains("HttpOnly", "SameSite=Strict", "Path=/api/auth", "Max-Age=604800");
            assertThat(refreshTokenOf(result)).hasSizeGreaterThanOrEqualTo(43);
            // 生のトークンはレスポンスボディに含めない
            assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                    .doesNotContain(refreshTokenOf(result));
        }
        assertThat(refreshTokenOf(signedUp)).isNotEqualTo(refreshTokenOf(loggedIn));
    }

    @Test
    void onlyTheHashOfTheTokenIsStored() throws Exception {
        String raw = refreshTokenOf(signup("tamura@example.com", "tamura"));

        List<String> hashes = jdbc.queryForList("SELECT token_hash FROM refresh_tokens", String.class);
        assertThat(hashes).hasSize(1);
        assertThat(hashes.get(0)).hasSize(64).matches("[0-9a-f]{64}").isNotEqualTo(raw);
    }

    // ---- refresh ----

    @Test
    void refreshRotatesTheTokenAndReturnsUsableAccessTokenAndUser() throws Exception {
        String token1 = refreshTokenOf(signup("tamura@example.com", "tamura"));

        MvcResult refreshed = refresh(token1);

        String token2 = refreshTokenOf(refreshed);
        assertThat(token2).isNotEqualTo(token1);
        assertThat(setCookieHeader(refreshed)).contains("HttpOnly", "SameSite=Strict", "Path=/api/auth");
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + accessTokenOf(refreshed)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("tamura"));
        assertThat(JsonPath.<String>read(refreshed.getResponse().getContentAsString(StandardCharsets.UTF_8),
                "$.user.handle")).isEqualTo("tamura");
        // 新しいトークンでもう一度更新できる(同じ系統が続く)
        refresh(token2);
        assertThat(jdbc.queryForObject("SELECT count(DISTINCT family_id) FROM refresh_tokens", Integer.class))
                .isEqualTo(1);
    }

    @Test
    void reusingAnOldTokenAfterTheGraceRevokesTheWholeFamily() throws Exception {
        String token1 = refreshTokenOf(signup("tamura@example.com", "tamura"));
        String token2 = refreshTokenOf(refresh(token1));
        // 猶予時間(既定 10 秒)を過ぎてから、使用済みの token1 が再提示された状況にする
        jdbc.update("UPDATE refresh_tokens SET used_at = now() - interval '1 minute' WHERE used_at IS NOT NULL");

        refreshRaw(token1)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        // 盗用の疑いがあるため、正規に発行された最新の token2 も使えなくなる
        assertThat(refreshStatus(token2)).isEqualTo(401);
        assertThat(revokedRows()).isEqualTo(2);
    }

    @Test
    void reusingATokenWithinTheGraceIsRejectedButDoesNotRevokeTheFamily() throws Exception {
        String token1 = refreshTokenOf(signup("tamura@example.com", "tamura"));
        String token2 = refreshTokenOf(refresh(token1));

        assertThat(refreshStatus(token1)).isEqualTo(401);

        assertThat(revokedRows()).isZero();
        assertThat(refreshStatus(token2)).isEqualTo(200);
    }

    @Test
    void expiredMissingAndUnknownTokensAreRejectedAndTheCookieIsCleared() throws Exception {
        String token = refreshTokenOf(signup("tamura@example.com", "tamura"));
        jdbc.update("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'");

        for (String candidate : new String[] {token, null, "not-a-real-token", " "}) {
            MvcResult result = refreshRaw(candidate)
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
                    .andExpect(jsonPath("$.accessToken").doesNotExist())
                    .andReturn();
            assertThat(setCookieHeader(result)).contains("Max-Age=0");
        }
    }

    @Test
    void refreshReturns401WhenTheUserNoLongerExists() throws Exception {
        String token = refreshTokenOf(signup("tamura@example.com", "tamura"));
        // 外部キーのカスケードでトークンも消えるため、トークンだけ残った状況は作れない。消えていることを確認する
        jdbc.update("DELETE FROM users");

        assertThat(jdbc.queryForObject("SELECT count(*) FROM refresh_tokens", Integer.class)).isZero();
        assertThat(refreshStatus(token)).isEqualTo(401);
    }

    @Test
    void concurrentRefreshesWithTheSameTokenYieldExactlyOneSuccessWithoutRevoking() throws Exception {
        String token = refreshTokenOf(signup("tamura@example.com", "tamura"));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> tasks = List.of(() -> refreshStatus(token), () -> refreshStatus(token));
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(tasks)) {
                statuses.add(f.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(200, 401);
            assertThat(revokedRows()).isZero();
        } finally {
            pool.shutdown();
        }
    }

    // ---- logout ----

    @Test
    void logoutRevokesTheFamilyAndClearsTheCookieWithoutAnAccessToken() throws Exception {
        String token = refreshTokenOf(signup("tamura@example.com", "tamura"));

        MvcResult result = mockMvc.perform(post("/api/auth/logout").cookie(new Cookie(COOKIE_NAME, token)))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(setCookieHeader(result)).contains("Max-Age=0", "Path=/api/auth");
        assertThat(refreshStatus(token)).isEqualTo(401);
    }

    @Test
    void logoutOnlyAffectsTheFamilyOfThatLogin() throws Exception {
        signup("tamura@example.com", "tamura");
        String deviceA = refreshTokenOf(login("tamura@example.com"));
        String deviceB = refreshTokenOf(login("tamura@example.com"));

        mockMvc.perform(post("/api/auth/logout").cookie(new Cookie(COOKIE_NAME, deviceA)))
                .andExpect(status().isNoContent());

        assertThat(refreshStatus(deviceA)).isEqualTo(401);
        assertThat(refreshStatus(deviceB)).isEqualTo(200);
    }

    @Test
    void logoutWithoutACookieStillReturns204AndClearsIt() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(setCookieHeader(result)).contains("Max-Age=0");
    }
}
