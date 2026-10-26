package com.raisetimeline.backend;

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

/** S3 のバケットが未設定(S3_BUCKET が空)の環境。画像の操作は 503 になり、それ以外の画面は変わらず動く。 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = {"app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij", "app.s3.bucket="})
@AutoConfigureMockMvc
class ImagesNotConfiguredIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    String alice;
    long aliceId;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        MvcResult result = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"alice@example.com","password":"password1","handle":"alice","displayName":"alice"}
                                """))
                .andExpect(status().isCreated())
                .andReturn();
        alice = "Bearer " + JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
        aliceId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'alice'", Long.class);
    }

    @Test
    void uploadUrlIsUnavailable() throws Exception {
        mockMvc.perform(post("/api/images/upload-url")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"avatar\",\"contentType\":\"image/png\",\"size\":100}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("IMAGES_NOT_CONFIGURED"));
    }

    @Test
    void settingAnAvatarIsUnavailableButOtherProfileEditsStillWork() throws Exception {
        String key = "avatars/" + aliceId + "/3f9a2b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b.png";

        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"アリス\",\"avatarKey\":\"" + key + "\"}"))
                .andExpect(status().isServiceUnavailable());

        mockMvc.perform(put("/api/users/me")
                        .header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"アリス\",\"bio\":\"自己紹介\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("アリス"));
    }

    @Test
    void postsWithImagesAreUnavailableButTextPostsStillWork() throws Exception {
        String key = "posts/" + aliceId + "/3f9a2b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b.png";

        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"写真つき\",\"imageKeys\":[\"" + key + "\"]}"))
                .andExpect(status().isServiceUnavailable());
        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"文章だけ\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.images.length()").value(0));
        // 投稿は作られていない(画像の確認に失敗したので、文章だけの投稿の 1 件だけ)
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM posts", Long.class)).isEqualTo(1);
    }

    @Test
    void storedImagesAreLeftOutOfPagesInsteadOfBreakingThem() throws Exception {
        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"hello\"}"))
                .andExpect(status().isCreated());
        Long postId = jdbc.queryForObject("SELECT id FROM posts", Long.class);
        jdbc.update("INSERT INTO post_images (post_id, image_key, sort_order) VALUES (?, ?, 0)", postId,
                "posts/" + aliceId + "/3f9a2b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b.png");

        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].body").value("hello"))
                .andExpect(jsonPath("$.items[0].images.length()").value(0));
    }

    @Test
    void pagesStillWorkAndShowNoAvatarUrlEvenIfAnAvatarIsStored() throws Exception {
        jdbc.update("UPDATE users SET avatar_key = ? WHERE id = ?", "avatars/" + aliceId + "/3f9a2b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b.png", aliceId);
        mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"hello\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.author.avatarUrl").doesNotExist());

        mockMvc.perform(get("/api/auth/me").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        mockMvc.perform(get("/api/users/alice").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
        mockMvc.perform(get("/api/timeline?tab=all").header(HttpHeaders.AUTHORIZATION, alice))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].author.avatarUrl").doesNotExist());
    }
}
