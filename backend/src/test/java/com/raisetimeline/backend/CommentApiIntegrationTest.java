package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.raisetimeline.backend.mapper.CommentMapper;
import com.raisetimeline.backend.mapper.LikeMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
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
class CommentApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @MockitoSpyBean
    CommentMapper commentMapper;

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

    private MvcResult comment(String token, long postId, String text) throws Exception {
        return mockMvc.perform(post("/api/posts/" + postId + "/comments")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + text + "\"}"))
                .andReturn();
    }

    private long commentId(String token, long postId, String text) throws Exception {
        MvcResult result = comment(token, postId, text);
        assertThat(result.getResponse().getStatus()).isEqualTo(201);
        return ((Number) JsonPath.read(body(result), "$.comment.id")).longValue();
    }

    // ---- create ----

    @Test
    void create_returns_comment_and_latest_count() throws Exception {
        long postId = createPost(alice, "hello");

        mockMvc.perform(post("/api/posts/" + postId + "/comments")
                        .header(HttpHeaders.AUTHORIZATION, bob)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"  nice post  \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.comment.body").value("nice post"))
                .andExpect(jsonPath("$.comment.postId").value(postId))
                .andExpect(jsonPath("$.comment.author.handle").value("bob"))
                .andExpect(jsonPath("$.comment.mine").value(true))
                .andExpect(jsonPath("$.commentCount").value(1));

        // 投稿者本人も自分の投稿にコメントできる
        mockMvc.perform(post("/api/posts/" + postId + "/comments")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"thanks\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.commentCount").value(2));
    }

    @Test
    void create_validates_body() throws Exception {
        long postId = createPost(alice, "hello");

        assertThat(comment(bob, postId, "   ").getResponse().getStatus()).isEqualTo(400);
        assertThat(comment(bob, postId, "a".repeat(280)).getResponse().getStatus()).isEqualTo(201);
        assertThat(comment(bob, postId, "a".repeat(281)).getResponse().getStatus()).isEqualTo(400);
        // 絵文字などサロゲートペアは 1 文字(コードポイント)として数える
        assertThat(comment(bob, postId, "😀".repeat(280)).getResponse().getStatus()).isEqualTo(201);
        assertThat(comment(bob, postId, "😀".repeat(281)).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void create_on_unknown_post_is_404() throws Exception {
        assertThat(comment(bob, 999999, "hi").getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void comments_require_authentication() throws Exception {
        long postId = createPost(alice, "hello");
        long commentId = commentId(bob, postId, "hi");

        mockMvc.perform(get("/api/posts/" + postId + "/comments")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/posts/" + postId + "/comments")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"hi\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/comments/" + commentId)).andExpect(status().isUnauthorized());
    }

    // ---- list ----

    @Test
    void list_is_oldest_first_with_mine_flag() throws Exception {
        long postId = createPost(alice, "hello");
        commentId(bob, postId, "first");
        commentId(alice, postId, "second");

        mockMvc.perform(get("/api/posts/" + postId + "/comments").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("first"))
                .andExpect(jsonPath("$.items[0].mine").value(true))
                .andExpect(jsonPath("$.items[0].author.displayName").value("bob"))
                .andExpect(jsonPath("$.items[1].body").value("second"))
                .andExpect(jsonPath("$.items[1].mine").value(false))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void list_on_unknown_post_is_404_and_empty_post_has_no_items() throws Exception {
        mockMvc.perform(get("/api/posts/999999/comments").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isNotFound());

        long postId = createPost(alice, "no comments");
        mockMvc.perform(get("/api/posts/" + postId + "/comments").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void list_pages_by_cursor_without_gaps_or_duplicates() throws Exception {
        long postId = createPost(alice, "hello");
        List<Long> created = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            created.add(commentId(bob, postId, "c" + i));
        }
        // 別の投稿のコメントは混ざらない
        commentId(bob, createPost(alice, "other"), "other");

        List<Long> seen = new ArrayList<>();
        String cursor = null;
        int pages = 0;
        do {
            var request = get("/api/posts/" + postId + "/comments")
                    .param("limit", "2").header(HttpHeaders.AUTHORIZATION, alice);
            if (cursor != null) {
                request.param("cursor", cursor);
            }
            String json = body(mockMvc.perform(request).andExpect(status().isOk()).andReturn());
            List<Number> ids = JsonPath.read(json, "$.items[*].id");
            ids.forEach(id -> seen.add(id.longValue()));
            cursor = JsonPath.read(json, "$.nextCursor");
            pages++;
        } while (cursor != null);

        assertThat(pages).isEqualTo(3);
        assertThat(seen).isEqualTo(created);
    }

    @Test
    void list_rejects_invalid_cursor() throws Exception {
        long postId = createPost(alice, "hello");
        mockMvc.perform(get("/api/posts/" + postId + "/comments")
                        .param("cursor", "not-a-cursor").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest());
    }

    // ---- delete ----

    @Test
    void delete_own_comment_returns_latest_count() throws Exception {
        long postId = createPost(alice, "hello");
        long mine = commentId(bob, postId, "mine");
        commentId(alice, postId, "other");

        mockMvc.perform(delete("/api/comments/" + mine).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentCount").value(1));
        mockMvc.perform(delete("/api/comments/" + mine).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_others_comment_is_403_even_for_post_owner() throws Exception {
        long postId = createPost(alice, "hello");
        long commentId = commentId(bob, postId, "bob's");

        mockMvc.perform(delete("/api/comments/" + commentId).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isForbidden());
        Integer remaining = jdbc.queryForObject("SELECT COUNT(*) FROM comments", Integer.class);
        assertThat(remaining).isEqualTo(1);
    }

    @Test
    void delete_unknown_comment_is_404() throws Exception {
        mockMvc.perform(delete("/api/comments/999999").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleting_post_removes_its_comments() throws Exception {
        long postId = createPost(alice, "bye");
        commentId(bob, postId, "hi");

        mockMvc.perform(delete("/api/posts/" + postId).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM comments", Integer.class)).isZero();
    }

    // ---- comment count in post responses ----

    @Test
    void comment_count_is_included_in_timeline_new_and_detail() throws Exception {
        long first = createPost(alice, "first");
        long second = createPost(alice, "second");
        commentId(bob, second, "a");
        commentId(alice, second, "b");
        commentId(bob, first, "c");

        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].id").value(second))
                .andExpect(jsonPath("$.items[0].commentCount").value(2))
                .andExpect(jsonPath("$.items[1].commentCount").value(1));

        long third = createPost(alice, "third");
        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].id").value(third))
                .andExpect(jsonPath("$.items[0].commentCount").value(0));

        mockMvc.perform(get("/api/timeline/new")
                        .param("tab", "all").param("sinceId", String.valueOf(first))
                        .header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[?(@.id==" + second + ")].commentCount").value(2));

        mockMvc.perform(get("/api/posts/" + first).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.commentCount").value(1));
    }

    /** コメント数は投稿ごとではなく、ページ全体で一括取得する(N+1 の回帰防止)。 */
    @Test
    void timeline_fetches_comment_counts_in_batch_regardless_of_post_count() throws Exception {
        for (int i = 0; i < 20; i++) {
            long id = createPost(alice, "post " + i);
            commentId(bob, id, "c1");
            commentId(alice, id, "c2");
        }

        clearInvocations(commentMapper, likeMapper, postMapper);
        mockMvc.perform(get("/api/timeline").param("tab", "all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(20))
                .andExpect(jsonPath("$.items[0].commentCount").value(2));

        verify(postMapper, times(1)).findPage(any(), any(), any(), anyInt());
        verify(commentMapper, times(1)).countByPostIds(any());
        verify(commentMapper, times(0)).countByPostId(any());
        verify(likeMapper, times(1)).countByPostIds(any());
        verify(likeMapper, times(1)).findLikedPostIds(any(), any());
    }

    /** コメント一覧は、コメント数に依らずコメントの取得 1 回で著者まで取れる(N+1 の回帰防止)。 */
    @Test
    void comment_list_fetches_authors_in_a_single_query() throws Exception {
        long postId = createPost(alice, "hello");
        for (int i = 0; i < 10; i++) {
            commentId(i % 2 == 0 ? alice : bob, postId, "c" + i);
        }

        clearInvocations(commentMapper, postMapper);
        mockMvc.perform(get("/api/posts/" + postId + "/comments").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items.length()").value(10));

        verify(commentMapper, times(1)).findPage(any(), any(), any(), anyInt());
        verify(commentMapper, times(0)).findById(any());
    }
}
