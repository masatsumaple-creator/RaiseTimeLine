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
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class FollowListApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    String alice;
    String bob;
    String carol;
    String dave;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        alice = signup("alice@example.com", "alice");
        bob = signup("bob@example.com", "bob");
        carol = signup("carol@example.com", "carol");
        dave = signup("dave@example.com", "dave");
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

    private void follow(String token, String handle) throws Exception {
        mockMvc.perform(put("/api/users/{h}/follow", handle).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk());
    }

    // ---- following ----

    @Test
    void followingListsMostRecentFollowFirst() throws Exception {
        follow(alice, "bob");
        follow(alice, "carol");
        follow(alice, "dave");

        mockMvc.perform(get("/api/users/alice/following").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.items[0].handle").value("dave"))
                .andExpect(jsonPath("$.items[1].handle").value("carol"))
                .andExpect(jsonPath("$.items[2].handle").value("bob"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist())
                .andExpect(jsonPath("$.items[0].email").doesNotExist())
                .andExpect(jsonPath("$.items[0].passwordHash").doesNotExist());
    }

    @Test
    void followersListsMostRecentFollowFirst() throws Exception {
        follow(bob, "alice");
        follow(carol, "alice");
        follow(dave, "bob");

        mockMvc.perform(get("/api/users/alice/followers").header(HttpHeaders.AUTHORIZATION, dave))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].handle").value("carol"))
                .andExpect(jsonPath("$.items[1].handle").value("bob"));
    }

    @Test
    void marksFollowedByMeAndIsMeForTheViewer() throws Exception {
        follow(bob, "alice");
        follow(carol, "alice");
        follow(alice, "carol");

        // alice が見る alice のフォロワー: carol はフォロー済み、bob は未フォロー
        mockMvc.perform(get("/api/users/alice/followers").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items[0].handle").value("carol"))
                .andExpect(jsonPath("$.items[0].followedByMe").value(true))
                .andExpect(jsonPath("$.items[0].isMe").value(false))
                .andExpect(jsonPath("$.items[1].handle").value("bob"))
                .andExpect(jsonPath("$.items[1].followedByMe").value(false));

        // carol が見る alice のフォロワー: 自分の行は isMe(ボタンを出さない)
        mockMvc.perform(get("/api/users/alice/followers").header(HttpHeaders.AUTHORIZATION, carol))
                .andExpect(jsonPath("$.items[0].handle").value("carol"))
                .andExpect(jsonPath("$.items[0].isMe").value(true));
    }

    @Test
    void pagesWithCursorWithoutDuplicates() throws Exception {
        follow(alice, "bob");
        follow(alice, "carol");
        follow(alice, "dave");

        MvcResult first = mockMvc.perform(get("/api/users/alice/following?limit=2").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.items[0].handle").value("dave"))
                .andExpect(jsonPath("$.items[1].handle").value("carol"))
                .andReturn();
        String cursor = JsonPath.read(first.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.nextCursor");

        // 1 ページ目と 2 ページ目の間に、新しいフォローが増えても、続きがずれたり重複したりしない
        signup("erin@example.com", "erin");
        follow(alice, "erin");

        mockMvc.perform(get("/api/users/alice/following?limit=2&cursor={c}", cursor).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].handle").value("bob"))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void returnsEmptyListWhenNobodyIsFollowed() throws Exception {
        mockMvc.perform(get("/api/users/alice/following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
        mockMvc.perform(get("/api/users/alice/followers").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void matchesHandleCaseInsensitively() throws Exception {
        follow(alice, "bob");

        mockMvc.perform(get("/api/users/ALICE/following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].handle").value("bob"));
    }

    @Test
    void returns404ForUnknownHandle() throws Exception {
        mockMvc.perform(get("/api/users/nobody/following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/users/nobody/followers").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsMalformedCursor() throws Exception {
        mockMvc.perform(get("/api/users/alice/following?cursor=not-a-cursor").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void requiresLogin() throws Exception {
        mockMvc.perform(get("/api/users/alice/following")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/users/alice/followers")).andExpect(status().isUnauthorized());
    }

    @Test
    void unfollowedUserDisappearsFromBothLists() throws Exception {
        follow(alice, "bob");
        mockMvc.perform(delete("/api/users/bob/follow").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/users/alice/following").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(0));
        mockMvc.perform(get("/api/users/bob/followers").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(0));
    }
}
