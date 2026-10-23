package com.raisetimeline.backend;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.raisetimeline.backend.mapper.LikeMapper;
import com.raisetimeline.backend.mapper.PostMapper;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class LikeApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @MockitoSpyBean
    LikeMapper likeMapper;

    @MockitoSpyBean
    PostMapper postMapper;

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

    private long createPost(String token, String text) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + text + "\"}"))
                .andExpect(status().isCreated())
                .andReturn();
        return ((Number) JsonPath.read(body(result), "$.id")).longValue();
    }

    private void like(String token, long postId) throws Exception {
        mockMvc.perform(put("/api/posts/" + postId + "/like").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk());
    }

    @Test
    void like_is_idempotent_and_returns_count() throws Exception {
        long id = createPost(alice, "hello");

        mockMvc.perform(put("/api/posts/" + id + "/like").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(1))
                .andExpect(jsonPath("$.likedByMe").value(true));
        // 二重に押しても 1 件のまま
        mockMvc.perform(put("/api/posts/" + id + "/like").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(1));
        // 別ユーザーのいいねは加算される
        mockMvc.perform(put("/api/posts/" + id + "/like").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.likeCount").value(2));
    }

    @Test
    void unlike_is_idempotent() throws Exception {
        long id = createPost(alice, "hello");
        like(bob, id);

        mockMvc.perform(delete("/api/posts/" + id + "/like").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(0))
                .andExpect(jsonPath("$.likedByMe").value(false));
        mockMvc.perform(delete("/api/posts/" + id + "/like").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(0));
    }

    @Test
    void like_unknown_post_is_404() throws Exception {
        mockMvc.perform(put("/api/posts/999999/like").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/posts/999999/like").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }

    @Test
    void like_requires_authentication() throws Exception {
        long id = createPost(alice, "hello");
        mockMvc.perform(put("/api/posts/" + id + "/like")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/posts/" + id + "/like")).andExpect(status().isUnauthorized());
    }

    @Test
    void counts_and_liked_by_me_are_included_in_timeline_new_and_detail() throws Exception {
        long first = createPost(alice, "first");
        long second = createPost(alice, "second");
        like(bob, second);
        like(alice, second);
        like(bob, first);

        // タイムライン: 新しい順(second, first)。bob 視点
        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(second))
                .andExpect(jsonPath("$.items[0].likeCount").value(2))
                .andExpect(jsonPath("$.items[0].likedByMe").value(true))
                .andExpect(jsonPath("$.items[1].likeCount").value(1))
                .andExpect(jsonPath("$.items[1].likedByMe").value(true));

        // 誰にもいいねされていない投稿は 0 / false
        long third = createPost(alice, "third");
        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].id").value(third))
                .andExpect(jsonPath("$.items[0].likeCount").value(0))
                .andExpect(jsonPath("$.items[0].likedByMe").value(false));

        // 新着
        mockMvc.perform(get("/api/timeline/new")
                        .param("tab", "all").param("sinceId", String.valueOf(first))
                        .header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[?(@.id==" + second + ")].likeCount").value(2));

        // 詳細: alice 視点
        mockMvc.perform(get("/api/posts/" + first).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.likeCount").value(1))
                .andExpect(jsonPath("$.likedByMe").value(false));
    }

    @Test
    void deleting_post_removes_its_likes() throws Exception {
        long id = createPost(alice, "bye");
        like(bob, id);

        mockMvc.perform(delete("/api/posts/" + id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());

        Integer remaining = jdbc.queryForObject("SELECT COUNT(*) FROM likes", Integer.class);
        org.assertj.core.api.Assertions.assertThat(remaining).isZero();
    }

    /** 件数・いいね済みは投稿ごとではなく、ページ全体で一括取得する(N+1 の回帰防止)。 */
    @Test
    void timeline_fetches_counts_in_batch_regardless_of_post_count() throws Exception {
        for (int i = 0; i < 20; i++) {
            long id = createPost(alice, "post " + i);
            like(bob, id);
            like(alice, id);
        }

        clearInvocations(likeMapper, postMapper);
        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(20));

        verify(postMapper, times(1)).findPage(any(), any(), any(), org.mockito.ArgumentMatchers.anyInt());
        verify(likeMapper, times(1)).countByPostIds(any());
        verify(likeMapper, times(1)).findLikedPostIds(any(), any());
        verify(likeMapper, times(0)).countByPostId(any());
    }
}
