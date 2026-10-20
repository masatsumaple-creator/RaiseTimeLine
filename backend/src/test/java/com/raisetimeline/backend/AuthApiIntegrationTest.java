package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class AuthApiIntegrationTest {

    private static final String LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    JwtEncoder jwtEncoder;

    @BeforeEach
    void cleanUsers() {
        jdbc.update("DELETE FROM users");
    }

    private static String signupJson(String email, String password, String handle, String displayName) {
        return """
                {"email":"%s","password":"%s","handle":"%s","displayName":"%s"}
                """.formatted(email, password, handle, displayName);
    }

    private MvcResult signup(String email, String handle) throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson(email, "password1", handle, "テスト太郎")))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private static String accessToken(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }

    private String jwt(JwtEncoder encoder, String issuer, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer).subject("1").issuedAt(issuedAt).expiresAt(expiresAt).build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    // ---- signup ----

    @Test
    void signupCreatesUserAndReturnsUsableAccessToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("tamura@example.com", "password1", "tamura_01", "田村")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").isString())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andExpect(jsonPath("$.user.id").isNumber())
                .andExpect(jsonPath("$.user.handle").value("tamura_01"))
                .andExpect(jsonPath("$.user.displayName").value("田村"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.user.password").doesNotExist())
                .andReturn();

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(accessToken(result))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("tamura_01"));
    }

    @Test
    void signupStoresBcryptHashNotPlaintext() throws Exception {
        signup("tamura@example.com", "tamura");

        String hash = jdbc.queryForObject("SELECT password_hash FROM users", String.class);
        assertThat(hash).startsWith("$2").isNotEqualTo("password1");
    }

    @Test
    void signupRejectsDuplicateEmailIgnoringCase() throws Exception {
        signup("tamura@example.com", "tamura");

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("TAMURA@Example.com", "password1", "other_user", "別人")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.message").value("このメールアドレスは登録済みです"));
    }

    @Test
    void signupRejectsDuplicateHandleIgnoringCase() throws Exception {
        signup("tamura@example.com", "Tamura");

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("other@example.com", "password1", "tamura", "別人")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("HANDLE_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.message").value("このハンドルは使われています"));
    }

    @Test
    void concurrentSignupsWithSameEmailYieldOneCreatedAndOneConflict() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> tasks = List.of(
                    () -> signupStatus("race@example.com", "racer_a"),
                    () -> signupStatus("race@example.com", "racer_b"));
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(tasks)) {
                statuses.add(f.get());
            }
            assertThat(statuses).containsExactlyInAnyOrder(201, 409);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM users", Integer.class)).isEqualTo(1);
        } finally {
            pool.shutdown();
        }
    }

    private int signupStatus(String email, String handle) throws Exception {
        return mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson(email, "password1", handle, "競合")))
                .andReturn().getResponse().getStatus();
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource({
            "password 7 chars,         a@example.com, abc1234,                         valid_01, 名前, password",
            "password letters only,    a@example.com, abcdefgh,                        valid_01, 名前, password",
            "password digits only,     a@example.com, 12345678,                        valid_01, 名前, password",
            "password 65 chars,        a@example.com, aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1, valid_01, 名前, password",
            "handle 2 chars,           a@example.com, password1,                       ab,       名前, handle",
            "handle with symbol,       a@example.com, password1,                       bad-name, 名前, handle",
            "handle with leading at,   a@example.com, password1,                       @alice,   名前, handle",
            "email without domain,     not-an-email,  password1,                       valid_01, 名前, email",
            "display name blank,       a@example.com, password1,                       valid_01, '   ', displayName"
    })
    void signupRejectsInvalidInput(String ignoredName, String email, String password, String handle,
                                   String displayName, String invalidField) throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson(email, password, handle, displayName)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors." + invalidField).isString());
    }

    @Test
    void signupAcceptsBoundaryValues() throws Exception {
        String handle30 = "a".repeat(30);
        String password64 = "a".repeat(63) + "1";
        String name50 = "あ".repeat(50);

        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("edge@example.com", password64, handle30, name50)))
                .andExpect(status().isCreated());
    }

    // ---- login / logout / me ----

    @Test
    void loginReturnsUsableTokenIgnoringEmailCase() throws Exception {
        signup("tamura@example.com", "tamura");

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Tamura@Example.com\",\"password\":\"password1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.user.handle").value("tamura"))
                .andReturn();

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(accessToken(result))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("tamura"));
    }

    @Test
    void loginFailureMessageDoesNotRevealWhichFieldWasWrong() throws Exception {
        signup("tamura@example.com", "tamura");

        for (String body : List.of(
                "{\"email\":\"tamura@example.com\",\"password\":\"wrongpass1\"}",
                "{\"email\":\"nobody@example.com\",\"password\":\"password1\"}")) {
            mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("LOGIN_FAILED"))
                    .andExpect(jsonPath("$.message").value(LOGIN_FAILED_MESSAGE))
                    .andExpect(jsonPath("$.accessToken").doesNotExist());
        }
    }

    @Test
    void loginRejectsEmptyFieldsWith400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void logoutReturns204WithOrWithoutAccessToken() throws Exception {
        String token = accessToken(signup("tamura@example.com", "tamura"));

        mockMvc.perform(post("/api/auth/logout").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isNoContent());
        // アクセストークンが期限切れでもログアウトできるよう、認証は不要
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isNoContent());
    }

    // ---- token verification ----

    @Test
    void meRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void meRejectsMalformedTamperedExpiredAndForeignTokens() throws Exception {
        String valid = accessToken(signup("tamura@example.com", "tamura"));
        String tampered = valid.substring(0, valid.length() - 2)
                + (valid.endsWith("AA") ? "BB" : "AA");
        Instant now = Instant.now();
        String expired = jwt(jwtEncoder, "raisetimeline", now.minusSeconds(7200), now.minusSeconds(3600));
        // 期限を数秒過ぎただけでも拒否する(時計ずれの許容を付けていない)
        String justExpired = jwt(jwtEncoder, "raisetimeline", now.minusSeconds(60), now.minusSeconds(5));
        String wrongIssuer = jwt(jwtEncoder, "someone-else", now, now.plusSeconds(600));
        NimbusJwtEncoder otherKeyEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(
                "another-secret-another-secret-0123456789".getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
        String foreignSignature = jwt(otherKeyEncoder, "raisetimeline", now, now.plusSeconds(600));

        for (String token : List.of("not-a-jwt", tampered, expired, justExpired, wrongIssuer, foreignSignature)) {
            mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        }
    }

    @Test
    void meReturns401WhenUserNoLongerExists() throws Exception {
        String token = accessToken(signup("tamura@example.com", "tamura"));
        jdbc.update("DELETE FROM users");

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void doesNotUseSessionsAndOnlySetsTheRefreshTokenCookie() throws Exception {
        MvcResult result = signup("tamura@example.com", "tamura");

        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE))
                .hasSize(1)
                .allSatisfy(header -> assertThat(header).startsWith("refresh_token="));
    }
}
