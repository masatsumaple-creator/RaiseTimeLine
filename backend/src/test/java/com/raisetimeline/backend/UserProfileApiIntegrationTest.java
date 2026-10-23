package com.raisetimeline.backend;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
class UserProfileApiIntegrationTest {

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

    private void createPost(String token, String text) throws Exception {
        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + text + "\"}"))
                .andExpect(status().isCreated());
    }

    // ---- profile ----

    @Test
    void returnsAnotherUsersProfileWithoutPrivateFields() throws Exception {
        mockMvc.perform(get("/api/users/bob").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("bob"))
                .andExpect(jsonPath("$.displayName").value("bob"))
                .andExpect(jsonPath("$.isMe").value(false))
                .andExpect(jsonPath("$.followedByMe").value(false))
                .andExpect(jsonPath("$.followingCount").value(0))
                .andExpect(jsonPath("$.followerCount").value(0))
                .andExpect(jsonPath("$.email").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void marksOwnProfileAsMe() throws Exception {
        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.isMe").value(true));
    }

    @Test
    void matchesHandleCaseInsensitively() throws Exception {
        mockMvc.perform(get("/api/users/BOB").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("bob"));
    }

    @Test
    void returns404ForUnknownHandle() throws Exception {
        mockMvc.perform(get("/api/users/nobody").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(get("/api/users/bob")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/users/bob/posts")).andExpect(status().isUnauthorized());
    }

    // ---- posts ----

    @Test
    void listsOnlyThatUsersPostsNewestFirst() throws Exception {
        createPost(bob, "bob-1");
        createPost(alice, "alice-1");
        createPost(bob, "bob-2");

        mockMvc.perform(get("/api/users/bob/posts").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("bob-2"))
                .andExpect(jsonPath("$.items[1].body").value("bob-1"))
                .andExpect(jsonPath("$.items[0].author.handle").value("bob"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void pagesPostsWithCursorWithoutDuplicates() throws Exception {
        for (int i = 1; i <= 3; i++) {
            createPost(bob, "bob-" + i);
        }

        MvcResult first = mockMvc.perform(get("/api/users/bob/posts?limit=2").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].body").value("bob-3"))
                .andExpect(jsonPath("$.items[1].body").value("bob-2"))
                .andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.nextCursor");

        mockMvc.perform(get("/api/users/bob/posts?limit=2&cursor={c}", cursor).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].body").value("bob-1"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void returnsEmptyListForUserWithoutPosts() throws Exception {
        mockMvc.perform(get("/api/users/bob/posts").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void returns404ForPostsOfUnknownHandle() throws Exception {
        mockMvc.perform(get("/api/users/nobody/posts").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }
}
