package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class AuthApiIntegrationTest {

    private static final String LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

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
        return mockMvc.perform(post("/api/auth/signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson(email, "password1", handle, "テスト太郎")))
                .andExpect(status().isCreated())
                .andReturn();
    }

    // ---- signup ----

    @Test
    void signupCreatesUserAndLogsInImmediately() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("tamura@example.com", "password1", "tamura_01", "田村")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.handle").value("tamura_01"))
                .andExpect(jsonPath("$.displayName").value("田村"))
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.password").doesNotExist())
                .andReturn();

        MockHttpSession session = (MockHttpSession) result.getRequest().getSession(false);
        assertThat(session).isNotNull();
        mockMvc.perform(get("/api/auth/me").session(session))
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

        mockMvc.perform(post("/api/auth/signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("TAMURA@Example.com", "password1", "other_user", "別人")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.message").value("このメールアドレスは登録済みです"));
    }

    @Test
    void signupRejectsDuplicateHandleIgnoringCase() throws Exception {
        signup("tamura@example.com", "Tamura");

        mockMvc.perform(post("/api/auth/signup").with(csrf())
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
            List<Integer> statuses = new java.util.ArrayList<>();
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
        return mockMvc.perform(post("/api/auth/signup").with(csrf())
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
        mockMvc.perform(post("/api/auth/signup").with(csrf())
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

        mockMvc.perform(post("/api/auth/signup").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("edge@example.com", password64, handle30, name50)))
                .andExpect(status().isCreated());
    }

    // ---- login / logout / me ----

    @Test
    void loginSucceedsWithCorrectCredentialsIgnoringEmailCase() throws Exception {
        signup("tamura@example.com", "tamura");

        mockMvc.perform(post("/api/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"Tamura@Example.com\",\"password\":\"password1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("tamura"));
    }

    @Test
    void loginFailureMessageDoesNotRevealWhichFieldWasWrong() throws Exception {
        signup("tamura@example.com", "tamura");

        for (String body : List.of(
                "{\"email\":\"tamura@example.com\",\"password\":\"wrongpass1\"}",
                "{\"email\":\"nobody@example.com\",\"password\":\"password1\"}")) {
            mockMvc.perform(post("/api/auth/login").with(csrf())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("LOGIN_FAILED"))
                    .andExpect(jsonPath("$.message").value(LOGIN_FAILED_MESSAGE));
        }
    }

    @Test
    void loginRejectsEmptyFieldsWith400() throws Exception {
        mockMvc.perform(post("/api/auth/login").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"\",\"password\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void loginRegeneratesSessionIdToPreventFixation() throws Exception {
        signup("tamura@example.com", "tamura");
        MockHttpSession preLoginSession = new MockHttpSession();
        String idBefore = preLoginSession.getId();

        mockMvc.perform(post("/api/auth/login").with(csrf()).session(preLoginSession)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"tamura@example.com\",\"password\":\"password1\"}"))
                .andExpect(status().isOk());

        assertThat(preLoginSession.getId()).isNotEqualTo(idBefore);
    }

    @Test
    void logoutInvalidatesSession() throws Exception {
        MvcResult signedUp = signup("tamura@example.com", "tamura");
        MockHttpSession session = (MockHttpSession) signedUp.getRequest().getSession(false);

        mockMvc.perform(post("/api/auth/logout").with(csrf()).session(session))
                .andExpect(status().isNoContent());

        assertThat(session.isInvalid()).isTrue();
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    // ---- authorization / CSRF ----

    @Test
    void meAndLogoutRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
        mockMvc.perform(post("/api/auth/logout").with(csrf()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void stateChangingRequestWithoutCsrfTokenIsForbidden() throws Exception {
        mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(signupJson("tamura@example.com", "password1", "tamura", "田村")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }
}
