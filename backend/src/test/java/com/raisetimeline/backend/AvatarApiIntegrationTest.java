package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
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

/** アイコン画像(F-17)の設定・置き換え・削除。S3 の代わりに、メモリ上の偽の置き場を使う。 */
@Import({TestcontainersConfiguration.class, FakeImageStorageConfiguration.class})
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class AvatarApiIntegrationTest {

    private static final String URL_PREFIX = "https://fake-s3.test/get/";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FakeImageStorage storage;

    String alice;
    String bob;
    long aliceId;
    long bobId;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        storage.reset();
        alice = signup("alice@example.com", "alice");
        bob = signup("bob@example.com", "bob");
        aliceId = idOf("alice");
        bobId = idOf("bob");
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

    private long idOf(String handle) {
        return jdbc.queryForObject("SELECT id FROM users WHERE handle = ?", Long.class, handle);
    }

    /** そのユーザーが S3 へアップロード済みの画像(JPEG)を用意して、キーを返す。 */
    private String uploaded(long userId) {
        String key = "avatars/%d/%s.jpg".formatted(userId, UUID.randomUUID());
        storage.put(key, "image/jpeg", FakeImageStorage.JPEG);
        return key;
    }

    private String storedAvatarKey(long userId) {
        return jdbc.queryForObject("SELECT avatar_key FROM users WHERE id = ?", String.class, userId);
    }

    /** body は JSON(例: {"displayName":"alice","avatarKey":"..."})。 */
    private ResultActions update(String token, String body) throws Exception {
        return mockMvc.perform(put("/api/users/me")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private static String withAvatar(String key) {
        return "{\"displayName\":\"alice\",\"avatarKey\":\"" + key + "\"}";
    }

    // ---- 設定 ----

    @Test
    void setsTheAvatarAndReturnsADisplayUrl() throws Exception {
        String key = uploaded(aliceId);

        update(alice, withAvatar(key))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + key)))
                .andExpect(jsonPath("$.avatarKey").doesNotExist());
        assertThat(storedAvatarKey(aliceId)).isEqualTo(key);
    }

    @Test
    void theAvatarShowsEverywhereTheUserAppears() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());
        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"hello\"}")).andExpect(status().isCreated());
        long postId = jdbc.queryForObject("SELECT id FROM posts", Long.class);
        mockMvc.perform(post("/api/posts/{id}/comments", postId).header(HttpHeaders.AUTHORIZATION, alice)
                .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"comment\"}")).andExpect(status().isCreated());
        mockMvc.perform(put("/api/users/alice/follow").header(HttpHeaders.AUTHORIZATION, bob)).andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].author.avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/users/alice/posts").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].author.avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/posts/{id}/comments", postId).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].author.avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/users/alice/followers").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].avatarUrl").doesNotExist()); // フォロワーの bob にはアイコンが無い
        mockMvc.perform(get("/api/users/bob/following").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].handle").value("alice"))
                .andExpect(jsonPath("$.items[0].avatarUrl").value(startsWith(URL_PREFIX + key)));
        mockMvc.perform(get("/api/search/users").param("q", "alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].avatarUrl").value(startsWith(URL_PREFIX + key)));
    }

    @Test
    void usersWithoutAnAvatarHaveNoAvatarUrl() throws Exception {
        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        assertThat(storage.presignGetCalls()).isZero();
    }

    // ---- 省略・削除・置き換え ----

    @Test
    void omittingAvatarKeyLeavesTheAvatarAlone() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        update(alice, "{\"displayName\":\"アリス\",\"bio\":\"自己紹介\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("アリス"))
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + key)));
        assertThat(storedAvatarKey(aliceId)).isEqualTo(key);
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void anExplicitNullAvatarKeyLeavesTheAvatarAlone() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        update(alice, "{\"displayName\":\"alice\",\"avatarKey\":null}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + key)));
        assertThat(storedAvatarKey(aliceId)).isEqualTo(key);
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void removeAvatarRemovesTheAvatarAndDeletesTheImage() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        update(alice, "{\"displayName\":\"alice\",\"removeAvatar\":true}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());

        assertThat(storedAvatarKey(aliceId)).isNull();
        assertThat(storage.deleted()).containsExactly(key);
        assertThat(storage.contains(key)).isFalse();
    }

    @Test
    void removingWhenThereIsNoAvatarIsHarmless() throws Exception {
        update(alice, "{\"displayName\":\"alice\",\"removeAvatar\":true}").andExpect(status().isOk());

        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void removeAvatarFalseLeavesTheAvatarAlone() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        update(alice, "{\"displayName\":\"alice\",\"removeAvatar\":false}").andExpect(status().isOk());

        assertThat(storedAvatarKey(aliceId)).isEqualTo(key);
    }

    @Test
    void settingAndRemovingAtTheSameTimeIsRejected() throws Exception {
        String key = uploaded(aliceId);

        update(alice, "{\"displayName\":\"alice\",\"avatarKey\":\"" + key + "\",\"removeAvatar\":true}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        assertThat(storedAvatarKey(aliceId)).isNull();
        assertThat(storage.contains(key)).isTrue();
    }

    @Test
    void replacingTheAvatarDeletesTheOldImage() throws Exception {
        String first = uploaded(aliceId);
        update(alice, withAvatar(first)).andExpect(status().isOk());
        String second = uploaded(aliceId);

        update(alice, withAvatar(second))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").value(startsWith(URL_PREFIX + second)));

        assertThat(storedAvatarKey(aliceId)).isEqualTo(second);
        assertThat(storage.deleted()).containsExactly(first);
        assertThat(storage.contains(second)).isTrue();
    }

    @Test
    void sendingTheCurrentKeyAgainChangesNothingAndKeepsTheImage() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        update(alice, withAvatar(key)).andExpect(status().isOk());

        assertThat(storage.deleted()).isEmpty();
        assertThat(storage.contains(key)).isTrue();
    }

    @Test
    void aFailedDeleteOfTheOldImageDoesNotFailTheUpdate() throws Exception {
        String first = uploaded(aliceId);
        update(alice, withAvatar(first)).andExpect(status().isOk());
        String second = uploaded(aliceId);
        storage.failDeletes(true);

        update(alice, withAvatar(second)).andExpect(status().isOk());

        assertThat(storedAvatarKey(aliceId)).isEqualTo(second);
    }

    // ---- 拒否 ----

    @Test
    void rejectsAnotherUsersImage() throws Exception {
        String bobsKey = uploaded(bobId);

        update(alice, withAvatar(bobsKey)).andExpect(status().isBadRequest());

        assertThat(storedAvatarKey(aliceId)).isNull();
        // 他人の画像を、消してしまわない
        assertThat(storage.contains(bobsKey)).isTrue();
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void rejectsAPostImageKeyAndGarbageKeys() throws Exception {
        String postKey = "posts/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());
        storage.put(postKey, "image/jpeg", FakeImageStorage.JPEG);

        update(alice, withAvatar(postKey)).andExpect(status().isBadRequest());
        update(alice, withAvatar("avatars/" + aliceId + "/../" + bobId + "/x.jpg")).andExpect(status().isBadRequest());
        update(alice, withAvatar("")).andExpect(status().isBadRequest());
        update(alice, withAvatar("hello")).andExpect(status().isBadRequest());

        assertThat(storedAvatarKey(aliceId)).isNull();
    }

    @Test
    void rejectsAKeyThatWasNeverUploaded() throws Exception {
        String key = "avatars/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());

        update(alice, withAvatar(key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("画像のアップロードを確認できません。もう一度選んでください"));
    }

    @Test
    void rejectsAFileThatIsNotReallyAnImageAndDiscardsIt() throws Exception {
        String key = "avatars/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());
        storage.put(key, "image/jpeg", FakeImageStorage.TEXT);

        update(alice, withAvatar(key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("JPEG、PNG、WebP の画像を選んでください"));

        assertThat(storedAvatarKey(aliceId)).isNull();
        assertThat(storage.contains(key)).isFalse();
    }

    @Test
    void rejectsAnOversizedImage() throws Exception {
        String key = "avatars/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());
        storage.putWithSize(key, "image/jpeg", FakeImageStorage.JPEG, 5L * 1024 * 1024 + 1);

        update(alice, withAvatar(key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("画像は 1 枚 5MB 以下にしてください"));
    }

    @Test
    void aRejectedAvatarChangesNothingElse() throws Exception {
        update(alice, "{\"displayName\":\"アリス\",\"bio\":\"新しい自己紹介\",\"avatarKey\":\"hello\"}")
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(jsonPath("$.displayName").value("alice"))
                .andExpect(jsonPath("$.bio").doesNotExist());
    }

    // ---- 表示の失敗 ----

    @Test
    void ifTheDisplayUrlCannotBeMadeThePageStillWorks() throws Exception {
        String key = uploaded(aliceId);
        storage.failPresignGet(true);

        // 表示用の URL を作れなくても、更新も、そのあとの表示も失敗させない(アイコンが出ないだけ)
        update(alice, withAvatar(key))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        assertThat(storedAvatarKey(aliceId)).isEqualTo(key);

        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("alice"))
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
    }

    @Test
    void theSameUrlIsReusedAcrossRequests() throws Exception {
        String key = uploaded(aliceId);
        update(alice, withAvatar(key)).andExpect(status().isOk());

        String first = JsonPath.read(mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8), "$.avatarUrl");
        String second = JsonPath.read(mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, bob))
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8), "$.avatarUrl");

        // ブラウザのキャッシュが効くよう、同じ URL を返す
        assertThat(second).isEqualTo(first);
    }
}
