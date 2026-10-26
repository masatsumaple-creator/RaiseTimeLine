package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
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
import org.springframework.test.web.servlet.ResultActions;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class ProfileUpdateApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    String alice;
    String bob;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        alice = signup("alice@example.com", "alice");
        bob = signup("bob@example.com", "bob");
    }

    private String signup(String email, String handle) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"password1","handle":"%s","displayName":"%s"}
                                """.formatted(email, handle, handle)))
                .andExpect(status().isCreated())
                .andReturn();
        return "Bearer " + JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
    }

    /** JSON の文字列に使えるよう、改行と引用符をエスケープする。 */
    private static String json(String text) {
        return text.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
    }

    private ResultActions update(String token, String displayName, String bio) throws Exception {
        String body = "{\"displayName\":\"" + json(displayName) + "\""
                + (bio == null ? "" : ",\"bio\":\"" + json(bio) + "\"") + "}";
        return mockMvc.perform(put("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    // ---- 更新 ----

    @Test
    void updatesDisplayNameAndBioAndReturnsTheUser() throws Exception {
        update(alice, "アリス", "よろしく")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("alice"))
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.bio").value("よろしく"))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void theChangeShowsUpInMeProfileAndPosts() throws Exception {
        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"hello\"}"))
                .andExpect(status().isCreated());

        update(alice, "アリス", "自己紹介").andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.bio").value("自己紹介"));
        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.bio").value("自己紹介"));
        mockMvc.perform(get("/api/users/alice/posts").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].author.displayName").value("アリス"));
    }

    @Test
    void trimsSurroundingWhitespaceButKeepsNewlinesInTheMiddle() throws Exception {
        update(alice, "  アリス  ", "  一行目\n二行目  ")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.bio").value("一行目\n二行目"));
    }

    @Test
    void emptyOrMissingBioClearsIt() throws Exception {
        update(alice, "alice", "最初").andExpect(jsonPath("$.bio").value("最初"));

        update(alice, "alice", "").andExpect(status().isOk()).andExpect(jsonPath("$.bio").doesNotExist());
        update(alice, "alice", "戻す").andExpect(jsonPath("$.bio").value("戻す"));
        update(alice, "alice", "   \n ").andExpect(status().isOk()).andExpect(jsonPath("$.bio").doesNotExist());
        update(alice, "alice", "戻す").andExpect(jsonPath("$.bio").value("戻す"));
        update(alice, "alice", null).andExpect(status().isOk()).andExpect(jsonPath("$.bio").doesNotExist());
    }

    @Test
    void doesNotChangeHandleEmailOrOtherUsers() throws Exception {
        update(alice, "アリス", "自己紹介").andExpect(status().isOk());

        mockMvc.perform(get("/api/users/bob").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.displayName").value("bob"))
                .andExpect(jsonPath("$.bio").doesNotExist());
        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.handle").value("alice"));
    }

    @Test
    void ignoresFieldsThatAreNotEditable() throws Exception {
        // ハンドルとメールは、このリクエストでは変えられない(送られても無視する)。アイコンは avatarKey で変える(AvatarApiIntegrationTest)
        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"displayName":"アリス","handle":"hacked","email":"x@example.com","id":999}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("alice"))
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());

        Long hacked = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE handle = 'hacked' OR email = 'x@example.com'", Long.class);
        assertThat(hacked).isZero();
    }

    // ---- 検証 ----

    @Test
    void acceptsFiftyCharacterDisplayNamesAndRejectsFiftyOne() throws Exception {
        update(alice, "あ".repeat(50), null).andExpect(status().isOk());
        update(alice, "あ".repeat(51), null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.displayName").value("表示名は 1〜50 文字で入力してください"));
    }

    @Test
    void countsEmojiAsOneCharacter() throws Exception {
        update(alice, "😀".repeat(50), "😀".repeat(160)).andExpect(status().isOk());
        update(alice, "😀".repeat(51), null).andExpect(status().isBadRequest());
        update(alice, "alice", "😀".repeat(161)).andExpect(status().isBadRequest());
    }

    @Test
    void rejectsEmptyOrBlankDisplayNames() throws Exception {
        update(alice, "", null).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").value("表示名は 1〜50 文字で入力してください"));
        update(alice, "   ", null).andExpect(status().isBadRequest());
        mockMvc.perform(put("/api/users/me").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"bio\":\"x\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acceptsOneHundredSixtyCharacterBiosAndRejectsOneHundredSixtyOne() throws Exception {
        update(alice, "alice", "あ".repeat(160)).andExpect(status().isOk());
        update(alice, "alice", "あ".repeat(161))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.bio").value("自己紹介は 160 文字以内で入力してください"));
    }

    @Test
    void aRejectedUpdateChangesNothing() throws Exception {
        update(alice, "アリス", "元の自己紹介").andExpect(status().isOk());

        update(alice, "あ".repeat(51), "新しい自己紹介").andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.bio").value("元の自己紹介"));
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(put("/api/users/me").contentType(MediaType.APPLICATION_JSON).content("{\"displayName\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }
}
