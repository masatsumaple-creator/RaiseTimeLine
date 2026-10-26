package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
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
import com.raisetimeline.backend.mapper.PostImageMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
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
import org.springframework.test.web.servlet.ResultActions;

/** 投稿の画像(F-15、F-16)。S3 の代わりに、メモリ上の偽の置き場を使う。 */
@Import({TestcontainersConfiguration.class, FakeImageStorageConfiguration.class})
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class PostImagesApiIntegrationTest {

    private static final String URL_PREFIX = "https://fake-s3.test/get/";

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FakeImageStorage storage;

    @MockitoSpyBean
    PostImageMapper postImageMapper;

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
        aliceId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'alice'", Long.class);
        bobId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'bob'", Long.class);
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

    /** そのユーザーが S3 へアップロード済みの、投稿用の画像(JPEG)を用意して、キーを返す。 */
    private String uploaded(long userId) {
        String key = "posts/%d/%s.jpg".formatted(userId, UUID.randomUUID());
        storage.put(key, "image/jpeg", FakeImageStorage.JPEG);
        return key;
    }

    private List<String> uploaded(long userId, int count) {
        List<String> keys = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            keys.add(uploaded(userId));
        }
        return keys;
    }

    private static String jsonKeys(List<String> keys) {
        return keys.stream().map(k -> k == null ? "null" : "\"" + k + "\"").collect(Collectors.joining(",", "[", "]"));
    }

    private ResultActions create(String token, String body, List<String> keys) throws Exception {
        return mockMvc.perform(post("/api/posts")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"body\":\"" + body + "\",\"imageKeys\":" + jsonKeys(keys) + "}"));
    }

    private long createdId(ResultActions result) throws Exception {
        return ((Number) JsonPath.read(result.andExpect(status().isCreated()).andReturn().getResponse()
                .getContentAsString(StandardCharsets.UTF_8), "$.id")).longValue();
    }

    private long countPosts() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM posts", Long.class);
    }

    // ---- 作成 ----

    @Test
    void createsAPostWithImagesInTheGivenOrder() throws Exception {
        List<String> keys = uploaded(aliceId, 3);

        create(alice, "写真つき", keys)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value("写真つき"))
                .andExpect(jsonPath("$.images.length()").value(3))
                .andExpect(jsonPath("$.images[0].sortOrder").value(0))
                .andExpect(jsonPath("$.images[0].url").value(startsWith(URL_PREFIX + keys.get(0))))
                .andExpect(jsonPath("$.images[1].url").value(startsWith(URL_PREFIX + keys.get(1))))
                .andExpect(jsonPath("$.images[2].url").value(startsWith(URL_PREFIX + keys.get(2))))
                .andExpect(jsonPath("$.images[2].sortOrder").value(2));

        List<String> stored = jdbc.queryForList("SELECT image_key FROM post_images ORDER BY sort_order", String.class);
        assertThat(stored).containsExactlyElementsOf(keys);
    }

    @Test
    void acceptsExactlyFourImagesAndRejectsFive() throws Exception {
        create(alice, "4枚", uploaded(aliceId, 4)).andExpect(status().isCreated()).andExpect(jsonPath("$.images.length()").value(4));

        long before = countPosts();
        create(alice, "5枚", uploaded(aliceId, 5))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.imageKeys").value("画像は 4 枚までです"));
        assertThat(countPosts()).isEqualTo(before);
    }

    @Test
    void allowsAnImageOnlyPostWithEmptyOrMissingBody() throws Exception {
        create(alice, "", uploaded(aliceId, 1))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.body").value(""))
                .andExpect(jsonPath("$.images.length()").value(1));
        create(alice, "   ", uploaded(aliceId, 1)).andExpect(status().isCreated());

        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"imageKeys\":" + jsonKeys(uploaded(aliceId, 1)) + "}"))
                .andExpect(status().isCreated());
    }

    @Test
    void aTextOnlyPostHasAnEmptyImageList() throws Exception {
        create(alice, "文章だけ", List.of())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.images.length()").value(0));

        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"imageKeys なし\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.images.length()").value(0));
    }

    @Test
    void rejectsAPostWithNeitherBodyNorImages() throws Exception {
        create(alice, "", List.of())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.body").value("本文または画像を入れてください"));
        assertThat(countPosts()).isZero();
    }

    @Test
    void stillLimitsTheBodyTo280Characters() throws Exception {
        create(alice, "あ".repeat(281), uploaded(aliceId, 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.body").value("280 文字以内で入力してください"));
    }

    // ---- 画像の確認 ----

    @Test
    void rejectsAnotherUsersImage() throws Exception {
        String bobsKey = uploaded(bobId);

        create(alice, "盗用", List.of(bobsKey)).andExpect(status().isBadRequest());

        assertThat(countPosts()).isZero();
        assertThat(storage.contains(bobsKey)).isTrue();
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void rejectsAnAvatarKeyAndGarbageKeys() throws Exception {
        String avatarKey = "avatars/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());
        storage.put(avatarKey, "image/jpeg", FakeImageStorage.JPEG);

        create(alice, "x", List.of(avatarKey)).andExpect(status().isBadRequest());
        create(alice, "x", List.of("hello")).andExpect(status().isBadRequest());
        create(alice, "x", List.of("posts/" + aliceId + "/../" + bobId + "/x.jpg")).andExpect(status().isBadRequest());
        create(alice, "x", java.util.Arrays.asList("null-element", null)).andExpect(status().isBadRequest());

        assertThat(countPosts()).isZero();
    }

    @Test
    void rejectsAKeyThatWasNeverUploaded() throws Exception {
        String key = "posts/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());

        create(alice, "x", List.of(key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("画像のアップロードを確認できません。もう一度選んでください"));
        assertThat(countPosts()).isZero();
    }

    @Test
    void rejectsAFileThatIsNotReallyAnImageAndDiscardsIt() throws Exception {
        String fake = "posts/%d/%s.jpg".formatted(aliceId, UUID.randomUUID());
        storage.put(fake, "image/jpeg", FakeImageStorage.TEXT);

        create(alice, "x", List.of(fake))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("JPEG、PNG、WebP の画像を選んでください"));

        assertThat(storage.contains(fake)).isFalse();
        assertThat(countPosts()).isZero();
    }

    @Test
    void rejectsTheSameImageTwiceInOneRequest() throws Exception {
        String key = uploaded(aliceId);

        create(alice, "x", List.of(key, key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.imageKeys").value("同じ画像は 1 枚だけ選べます"));
        assertThat(countPosts()).isZero();
    }

    @Test
    void anImageCannotBeUsedByTwoPosts() throws Exception {
        String key = uploaded(aliceId);
        create(alice, "一つ目", List.of(key)).andExpect(status().isCreated());
        long before = countPosts();

        create(alice, "二つ目", List.of(key))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.imageKeys").value("この画像はすでに使われています"));

        // 二つ目の投稿は作られず、一つ目の画像は残る
        assertThat(countPosts()).isEqualTo(before);
        assertThat(storage.contains(key)).isTrue();
    }

    // ---- 表示 ----

    @Test
    void imagesAppearInEveryPostList() throws Exception {
        List<String> keys = uploaded(aliceId, 2);
        long id = createdId(create(alice, "写真", keys));
        mockMvc.perform(put("/api/users/alice/follow").header(HttpHeaders.AUTHORIZATION, bob)).andExpect(status().isOk());

        String first = URL_PREFIX + keys.get(0);
        mockMvc.perform(get("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.images[0].url").value(startsWith(first)))
                .andExpect(jsonPath("$.images[1].sortOrder").value(1));
        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].images.length()").value(2));
        mockMvc.perform(get("/api/timeline?tab=following").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].images[0].url").value(startsWith(first)));
        mockMvc.perform(get("/api/users/alice/posts").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].images.length()").value(2));
        mockMvc.perform(get("/api/timeline/new?tab=all&sinceId=0").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(jsonPath("$.items[0].images.length()").value(2));
    }

    @Test
    void loadsImagesForAWholePageWithASingleQuery() throws Exception {
        for (int i = 0; i < 5; i++) {
            create(alice, "post " + i, uploaded(aliceId, 2)).andExpect(status().isCreated());
        }
        clearInvocations(postImageMapper);

        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5));

        verify(postImageMapper, times(1)).findByPostIds(any());
    }

    @Test
    void anImageWhoseUrlCannotBeMadeIsLeftOutInsteadOfBreakingThePage() throws Exception {
        // 表示用の URL は作ったあとしばらく使い回すので、作れない状態を先に作ってから投稿する
        storage.failPresignGet(true);
        create(alice, "写真", uploaded(aliceId, 1)).andExpect(status().isCreated());

        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].body").value("写真"))
                .andExpect(jsonPath("$.items[0].images.length()").value(0));
    }

    // ---- 編集 ----

    @Test
    void editingTheBodyKeepsTheImagesAndTheirOrder() throws Exception {
        List<String> keys = uploaded(aliceId, 3);
        long id = createdId(create(alice, "元の本文", keys));

        mockMvc.perform(put("/api/posts/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"新しい本文\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("新しい本文"))
                .andExpect(jsonPath("$.images.length()").value(3))
                .andExpect(jsonPath("$.images[0].url").value(startsWith(URL_PREFIX + keys.get(0))))
                .andExpect(jsonPath("$.images[2].url").value(startsWith(URL_PREFIX + keys.get(2))));
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void aPostWithImagesCanHaveItsBodyEmptiedButATextOnlyPostCannot() throws Exception {
        long withImage = createdId(create(alice, "写真つき", uploaded(aliceId, 1)));
        long textOnly = createdId(create(alice, "文章だけ", List.of()));

        mockMvc.perform(put("/api/posts/{id}", withImage)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value(""))
                .andExpect(jsonPath("$.images.length()").value(1));

        mockMvc.perform(put("/api/posts/{id}", textOnly)
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"  \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.body").value("本文を入力してください"));
    }

    // ---- 削除 ----

    @Test
    void deletingAPostDeletesItsImagesFromS3() throws Exception {
        List<String> keys = uploaded(aliceId, 3);
        long id = createdId(create(alice, "写真", keys));

        mockMvc.perform(delete("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM post_images", Long.class)).isZero();
        assertThat(storage.deleted()).containsExactlyInAnyOrderElementsOf(keys);
        keys.forEach(key -> assertThat(storage.contains(key)).isFalse());
    }

    @Test
    void deletingSomeoneElsesPostChangesNothing() throws Exception {
        List<String> keys = uploaded(aliceId, 2);
        long id = createdId(create(alice, "写真", keys));

        mockMvc.perform(delete("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isForbidden());

        assertThat(storage.deleted()).isEmpty();
        keys.forEach(key -> assertThat(storage.contains(key)).isTrue());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM post_images", Long.class)).isEqualTo(2);
    }

    @Test
    void aFailedS3DeleteDoesNotFailTheDelete() throws Exception {
        long id = createdId(create(alice, "写真", uploaded(aliceId, 2)));
        storage.failDeletes(true);

        mockMvc.perform(delete("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());

        assertThat(countPosts()).isZero();
    }

    @Test
    void deletingATextOnlyPostDoesNotTouchS3() throws Exception {
        long id = createdId(create(alice, "文章だけ", List.of()));

        mockMvc.perform(delete("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNoContent());

        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void deletingAMissingPostLeavesOtherImagesAlone() throws Exception {
        // 存在しない投稿を消そうとしても(404)、他の投稿の画像は消えない
        List<String> keys = uploaded(aliceId, 1);
        createdId(create(alice, "写真", keys));

        mockMvc.perform(delete("/api/posts/{id}", 999999).header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isNotFound());

        assertThat(storage.deleted()).isEmpty();
    }

    // ---- 認証 ----

    @Test
    void creatingRequiresLogin() throws Exception {
        mockMvc.perform(post("/api/posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"x\",\"imageKeys\":[]}"))
                .andExpect(status().isUnauthorized());
    }
}
