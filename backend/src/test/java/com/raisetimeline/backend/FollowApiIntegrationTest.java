package com.raisetimeline.backend;

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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class FollowApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    String alice;
    String bob;
    String carol;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        alice = signup("alice@example.com", "alice");
        bob = signup("bob@example.com", "bob");
        carol = signup("carol@example.com", "carol");
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

    private void createPost(String token, String text) throws Exception {
        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + text + "\"}"))
                .andExpect(status().isCreated());
    }

    private void follow(String token, String handle) throws Exception {
        mockMvc.perform(put("/api/users/{h}/follow", handle).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk());
    }

    // ---- follow / unfollow ----

    @Test
    void followReturnsStateAndFollowerCount() throws Exception {
        mockMvc.perform(put("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followedByMe").value(true))
                .andExpect(jsonPath("$.followerCount").value(1));

        mockMvc.perform(put("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, carol))
                .andExpect(jsonPath("$.followerCount").value(2));
    }

    @Test
    void followIsIdempotent() throws Exception {
        follow(alice, "bob");

        mockMvc.perform(put("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followedByMe").value(true))
                .andExpect(jsonPath("$.followerCount").value(1));
    }

    @Test
    void unfollowRemovesFollowAndIsIdempotent() throws Exception {
        follow(alice, "bob");

        mockMvc.perform(delete("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followedByMe").value(false))
                .andExpect(jsonPath("$.followerCount").value(0));

        mockMvc.perform(delete("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followerCount").value(0));
    }

    @Test
    void cannotFollowYourself() throws Exception {
        mockMvc.perform(put("/api/users/alice/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CANNOT_FOLLOW_SELF"));
        mockMvc.perform(put("/api/users/ALICE/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest());
    }

    @Test
    void returns404ForUnknownHandle() throws Exception {
        mockMvc.perform(put("/api/users/nobody/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/users/nobody/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(put("/api/users/bob/follow")).andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/users/bob/follow")).andExpect(status().isUnauthorized());
    }

    @Test
    void databaseRejectsSelfFollowAndDuplicates() {
        Long aliceId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'alice'", Long.class);
        Long bobId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'bob'", Long.class);

        assertThatThrownBy(() -> jdbc.update("INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", aliceId, aliceId))
                .isInstanceOf(DataIntegrityViolationException.class);

        jdbc.update("INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", aliceId, bobId);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO follows (follower_id, followee_id) VALUES (?, ?)", aliceId, bobId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deletingUserRemovesTheirFollows() throws Exception {
        follow(alice, "bob");
        follow(bob, "alice");

        jdbc.update("DELETE FROM users WHERE handle = 'bob'");

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM follows", Long.class)).isZero();
    }

    // ---- profile counts ----

    @Test
    void profileShowsCountsAndFollowedByMe() throws Exception {
        follow(alice, "bob");
        follow(carol, "bob");
        follow(bob, "carol");

        mockMvc.perform(get("/api/users/bob").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.followerCount").value(2))
                .andExpect(jsonPath("$.followingCount").value(1))
                .andExpect(jsonPath("$.followedByMe").value(true));

        mockMvc.perform(get("/api/users/bob").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.isMe").value(true))
                .andExpect(jsonPath("$.followedByMe").value(false));

        mockMvc.perform(get("/api/users/carol").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.followedByMe").value(false));
    }

    // ---- following tab ----

    @Test
    void followingTabShowsOwnAndFollowedUsersPostsOnly() throws Exception {
        createPost(alice, "alice-1");
        createPost(bob, "bob-1");
        createPost(carol, "carol-1");
        follow(alice, "bob");

        mockMvc.perform(get("/api/timeline?tab=following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("bob-1"))
                .andExpect(jsonPath("$.items[1].body").value("alice-1"));

        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(3));
    }

    @Test
    void followingTabIncludesPastPostsAndDropsThemOnUnfollow() throws Exception {
        createPost(bob, "bob-old");
        follow(alice, "bob");

        mockMvc.perform(get("/api/timeline?tab=following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].body").value("bob-old"));

        mockMvc.perform(delete("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/timeline?tab=following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(0));
        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(1));
    }

    @Test
    void followingTabIsNotAffectedByOthersFollows() throws Exception {
        createPost(bob, "bob-1");
        follow(carol, "bob");

        mockMvc.perform(get("/api/timeline?tab=following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void newPostsCheckFollowsTheFollowingTab() throws Exception {
        createPost(bob, "bob-1");
        createPost(carol, "carol-1");
        follow(alice, "bob");

        mockMvc.perform(get("/api/timeline/new?tab=following&sinceId=0").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.items[0].body").value("bob-1"));

        mockMvc.perform(get("/api/timeline/new?tab=all&sinceId=0").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.count").value(2));
    }
}
