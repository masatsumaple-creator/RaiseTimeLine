package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class PostApiIntegrationTest {

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
        return "Bearer " + JsonPath.read(body(result), "$.accessToken");
    }

    private static String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private static String json(String text) {
        return "{\"body\":\"" + text.replace("\n", "\\n") + "\"}";
    }

    private MvcResult createPost(String token, String text) throws Exception {
        return mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(text)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private long createPostId(String token, String text) throws Exception {
        return ((Number) JsonPath.read(body(createPost(token, text)), "$.id")).longValue();
    }

    // ---- create ----

    @Test
    void createReturnsPostWithAuthorAndNoEditedAt() throws Exception {
        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("  こんにちは\n世界  ")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("こんにちは\n世界"))
                .andExpect(jsonPath("$.author.handle").value("alice"))
                .andExpect(jsonPath("$.createdAt").isString())
                .andExpect(jsonPath("$.editedAt").doesNotExist());
    }

    @Test
    void createAccepts280CodePointsAndRejects281() throws Exception {
        // 絵文字は UTF-16 では 2 文字だが、1 文字として数える
        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("😀".repeat(280))))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("😀".repeat(281))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.body").value("280 文字以内で入力してください"));
    }

    @Test
    void createRejectsBlankBody() throws Exception {
        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("  \\n  ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.body").value("本文を入力してください"));
    }

    @Test
    void postEndpointsRequireAuthentication() throws Exception {
        mockMvc.perform(get("/api/timeline")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/timeline/new").param("sinceId", "0")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/posts").contentType(MediaType.APPLICATION_JSON).content(json("x")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/posts/1").contentType(MediaType.APPLICATION_JSON).content(json("x")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/posts/1")).andExpect(status().isUnauthorized());
    }

    // ---- timeline ----

    @Test
    void timelineListsNewestFirstAndFiltersByTab() throws Exception {
        createPost(alice, "alice-1");
        createPost(bob, "bob-1");
        createPost(alice, "alice-2");

        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].body").value("alice-2"))
                .andExpect(jsonPath("$.items[1].body").value("bob-1"))
                .andExpect(jsonPath("$.items[2].body").value("alice-1"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());

        // フォロー中は暫定で自分の投稿のみ(tab 省略時もフォロー中)
        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("alice-2"))
                .andExpect(jsonPath("$.items[1].body").value("alice-1"));
    }

    @Test
    void timelinePagesWithCursorWithoutGapsOrDuplicates() throws Exception {
        for (int i = 1; i <= 5; i++) {
            createPost(alice, "post-" + i);
        }

        MvcResult first = mockMvc.perform(get("/api/timeline")
                        .param("tab", "all").param("limit", "2").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("post-5"))
                .andExpect(jsonPath("$.items[1].body").value("post-4"))
                .andExpect(jsonPath("$.nextCursor").isString())
                .andReturn();
        String cursor = JsonPath.read(body(first), "$.nextCursor");

        MvcResult second = mockMvc.perform(get("/api/timeline")
                        .param("tab", "all").param("limit", "2").param("cursor", cursor)
                        .header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items[0].body").value("post-3"))
                .andExpect(jsonPath("$.items[1].body").value("post-2"))
                .andExpect(jsonPath("$.nextCursor").isString())
                .andReturn();
        String cursor2 = JsonPath.read(body(second), "$.nextCursor");

        // 最後のページは nextCursor が無い
        mockMvc.perform(get("/api/timeline")
                        .param("tab", "all").param("limit", "2").param("cursor", cursor2)
                        .header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].body").value("post-1"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void timelineRejectsInvalidCursorAndTab() throws Exception {
        mockMvc.perform(get("/api/timeline").param("cursor", "%%%").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(get("/api/timeline").param("tab", "nope").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    // ---- new posts ----

    @Test
    void newPostsReturnsOnlyPostsAfterSinceIdFilteredByTab() throws Exception {
        long base = createPostId(alice, "base");
        createPost(bob, "bob-new");
        createPost(alice, "alice-new");

        mockMvc.perform(get("/api/timeline/new")
                        .param("tab", "all").param("sinceId", String.valueOf(base))
                        .header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(2))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.items[0].body").value("alice-new"))
                .andExpect(jsonPath("$.items[1].body").value("bob-new"));

        mockMvc.perform(get("/api/timeline/new")
                        .param("tab", "following").param("sinceId", String.valueOf(base))
                        .header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.items[0].body").value("alice-new"));
    }

    @Test
    void newPostsCapsAtFiftyAndFlagsHasMore() throws Exception {
        long base = createPostId(alice, "base");
        for (int i = 1; i <= 51; i++) {
            createPost(bob, "new-" + i);
        }

        MvcResult result = mockMvc.perform(get("/api/timeline/new")
                        .param("tab", "all").param("sinceId", String.valueOf(base))
                        .header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.count").value(50))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.items[0].body").value("new-51"))
                .andReturn();
        assertThat((Iterable<?>) JsonPath.read(body(result), "$.items")).hasSize(50);
    }

    // ---- update ----

    @Test
    void updateChangesBodyAndMarksEdited() throws Exception {
        long id = createPostId(alice, "before");

        mockMvc.perform(put("/api/posts/" + id)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("after")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("after"))
                .andExpect(jsonPath("$.editedAt").isString());

        // 再取得しても編集済みのまま
        mockMvc.perform(get("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.body").value("after"))
                .andExpect(jsonPath("$.editedAt").isString());
    }

    @Test
    void updateWithSameBodyDoesNotMarkEdited() throws Exception {
        long id = createPostId(alice, "same");

        mockMvc.perform(put("/api/posts/" + id)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("same")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editedAt").doesNotExist());
    }

    @Test
    void updateRejectsInvalidBody() throws Exception {
        long id = createPostId(alice, "before");

        mockMvc.perform(put("/api/posts/" + id)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(" ")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(put("/api/posts/" + id)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("a".repeat(281))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateOfOthersPostIsForbiddenAndMissingIsNotFound() throws Exception {
        long id = createPostId(alice, "alice's");

        mockMvc.perform(put("/api/posts/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("hijack")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(get("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.body").value("alice's"));

        mockMvc.perform(put("/api/posts/999999")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("x")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    // ---- delete ----

    @Test
    void deleteRemovesPost() throws Exception {
        long id = createPostId(alice, "bye");

        mockMvc.perform(delete("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteOfOthersPostIsForbidden() throws Exception {
        long id = createPostId(alice, "mine");

        mockMvc.perform(delete("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk());
    }
}
