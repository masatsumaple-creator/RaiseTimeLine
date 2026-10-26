package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class UserSearchApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    String me;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        me = signup("me@example.com", "me_viewer", "Viewer");
    }

    private String signup(String email, String handle, String displayName) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"password1","handle":"%s","displayName":"%s"}
                                """.formatted(email, handle, displayName.replace("\\", "\\\\"))))
                .andExpect(status().isCreated())
                .andReturn();
        return "Bearer " + JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
    }

    /** handle と表示名が同じユーザーを作る。メールは handle から決める。 */
    private void user(String handle) throws Exception {
        signup(handle + "@example.com", handle, handle);
    }

    private ResultActions search(String q) throws Exception {
        return mockMvc.perform(get("/api/search/users").param("q", q).header(HttpHeaders.AUTHORIZATION, me));
    }

    // ---- 部分一致 ----

    @Test
    void matchesPartOfHandleOrDisplayNameIgnoringCase() throws Exception {
        user("taro");
        signup("hanako@example.com", "hanako", "Hanako TARO-fan");
        user("jiro");

        search("TaRo")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].handle").value("taro"))
                .andExpect(jsonPath("$.items[1].handle").value("hanako"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void ignoresLeadingAtSignAndSurroundingSpaces() throws Exception {
        user("taro");

        search("@taro").andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].handle").value("taro"));
        search("  taro  ").andExpect(jsonPath("$.items.length()").value(1));
        search(" @ taro ").andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    void putsPrefixMatchesFirstThenSortsByHandle() throws Exception {
        user("kotaro");
        user("taro");
        signup("yamada@example.com", "yamada", "Taro Yamada");
        user("zero_taro");

        // 先頭が一致: taro(ハンドル)、yamada(表示名 "Taro Yamada")。その後に、途中が一致するもの
        search("taro")
                .andExpect(jsonPath("$.items.length()").value(4))
                .andExpect(jsonPath("$.items[0].handle").value("taro"))
                .andExpect(jsonPath("$.items[1].handle").value("yamada"))
                .andExpect(jsonPath("$.items[2].handle").value("kotaro"))
                .andExpect(jsonPath("$.items[3].handle").value("zero_taro"));
    }

    @Test
    void doesNotMatchEmailOrBio() throws Exception {
        signup("findme@example.com", "someone", "Someone");
        jdbc.update("UPDATE users SET bio = 'hiddenword' WHERE handle = 'someone'");

        search("findme").andExpect(jsonPath("$.items.length()").value(0));
        search("hiddenword").andExpect(jsonPath("$.items.length()").value(0));
        search("someone").andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    void returnsNothingForUnknownTerm() throws Exception {
        user("taro");

        search("zzzz").andExpect(status().isOk()).andExpect(jsonPath("$.items.length()").value(0));
    }

    // ---- LIKE の特殊文字 ----

    @Test
    void treatsPercentAsAPlainCharacter() throws Exception {
        user("taro");
        signup("fan@example.com", "fan", "100% fan");

        search("%")
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].handle").value("fan"));
    }

    @Test
    void treatsUnderscoreAsAPlainCharacter() throws Exception {
        user("a_b");
        user("axb");

        search("a_b")
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].handle").value("a_b"));
    }

    @Test
    void treatsBackslashAsAPlainCharacter() throws Exception {
        user("taro");
        signup("path@example.com", "pathuser", "x\\y");

        search("\\")
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].handle").value("pathuser"));
        search("x\\y").andExpect(jsonPath("$.items.length()").value(1));
    }

    // ---- 結果の行 ----

    @Test
    void includesSelfWithoutAFollowButton() throws Exception {
        search("viewer")
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].handle").value("me_viewer"))
                .andExpect(jsonPath("$.items[0].isMe").value(true));
    }

    @Test
    void marksUsersTheViewerAlreadyFollows() throws Exception {
        user("taro1");
        user("taro2");
        mockMvc.perform(put("/api/users/taro2/follow").header(HttpHeaders.AUTHORIZATION, me)).andExpect(status().isOk());

        search("taro")
                .andExpect(jsonPath("$.items[0].handle").value("taro1"))
                .andExpect(jsonPath("$.items[0].followedByMe").value(false))
                .andExpect(jsonPath("$.items[0].isMe").value(false))
                .andExpect(jsonPath("$.items[1].handle").value("taro2"))
                .andExpect(jsonPath("$.items[1].followedByMe").value(true))
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist());
    }

    // ---- ページング ----

    @Test
    void pagesWithOffsetCursorWithoutDuplicates() throws Exception {
        for (int i = 1; i <= 25; i++) {
            user("pg%02d".formatted(i));
        }

        MvcResult first = search("pg")
                .andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.items[0].handle").value("pg01"))
                .andExpect(jsonPath("$.items[19].handle").value("pg20"))
                .andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.nextCursor");

        mockMvc.perform(get("/api/search/users").param("q", "pg").param("cursor", cursor).header(HttpHeaders.AUTHORIZATION, me))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.items[0].handle").value("pg21"))
                .andExpect(jsonPath("$.items[4].handle").value("pg25"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void respectsLimit() throws Exception {
        for (int i = 1; i <= 3; i++) {
            user("lim%d".formatted(i));
        }

        mockMvc.perform(get("/api/search/users").param("q", "lim").param("limit", "2").header(HttpHeaders.AUTHORIZATION, me))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.nextCursor").exists());
    }

    @Test
    void rejectsMalformedAndNegativeCursors() throws Exception {
        mockMvc.perform(get("/api/search/users").param("q", "a").param("cursor", "not-a-cursor").header(HttpHeaders.AUTHORIZATION, me))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        String negative = Base64.getUrlEncoder().withoutPadding().encodeToString("offset:-1".getBytes(StandardCharsets.UTF_8));
        mockMvc.perform(get("/api/search/users").param("q", "a").param("cursor", negative).header(HttpHeaders.AUTHORIZATION, me))
                .andExpect(status().isBadRequest());
    }

    // ---- 入力の検証 ----

    @Test
    void rejectsEmptyQueries() throws Exception {
        search("").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("検索語を入力してください"));
        search("   ").andExpect(status().isBadRequest());
        search("@").andExpect(status().isBadRequest());
        search(" @  ").andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/search/users").header(HttpHeaders.AUTHORIZATION, me)).andExpect(status().isBadRequest());
    }

    @Test
    void acceptsFiftyCharactersAndRejectsFiftyOne() throws Exception {
        search("a".repeat(50)).andExpect(status().isOk());
        search("a".repeat(51)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("50 文字以内で入力してください"));
        // 先頭の @ は数えない
        search("@" + "a".repeat(50)).andExpect(status().isOk());
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(get("/api/search/users").param("q", "taro")).andExpect(status().isUnauthorized());
    }

    // ---- ルーティングと索引 ----

    @Test
    void aUserWithHandleSearchStillHasAProfile() throws Exception {
        user("search");

        mockMvc.perform(get("/api/users/search").header(HttpHeaders.AUTHORIZATION, me))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("search"));
    }

    @Test
    void trigramIndexesAreUsedForPartialMatches() {
        // 行が少ないと全件読みのほうが速いので、使えることだけを確かめるために全件読みを無効にする
        String plan = jdbc.execute((ConnectionCallback<String>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET enable_seqscan = off");
                try (ResultSet rs = statement.executeQuery(
                        "EXPLAIN SELECT id FROM users u WHERE u.handle ILIKE '%tar%' OR u.display_name ILIKE '%tar%'")) {
                    StringBuilder text = new StringBuilder();
                    while (rs.next()) {
                        text.append(rs.getString(1)).append('\n');
                    }
                    return text.toString();
                }
            } finally {
                try (Statement reset = connection.createStatement()) {
                    reset.execute("RESET enable_seqscan");
                }
            }
        });

        assertThat(plan).contains("idx_users_handle_trgm").contains("idx_users_display_name_trgm");
    }
}
