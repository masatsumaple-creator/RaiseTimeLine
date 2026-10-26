package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
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
import org.springframework.test.web.servlet.ResultActions;

@Import({TestcontainersConfiguration.class, FakeImageStorageConfiguration.class})
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class ImageApiIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    FakeImageStorage storage;

    String alice;
    long aliceId;

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM users");
        storage.reset();
        alice = signup("alice@example.com", "alice");
        aliceId = jdbc.queryForObject("SELECT id FROM users WHERE handle = 'alice'", Long.class);
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

    private ResultActions requestUploadUrl(String token, String json) throws Exception {
        var request = post("/api/images/upload-url").contentType(MediaType.APPLICATION_JSON).content(json);
        if (token != null) {
            request.header(HttpHeaders.AUTHORIZATION, token);
        }
        return mockMvc.perform(request);
    }

    private static String body(String purpose, String contentType, Object size) {
        return "{\"purpose\":\"%s\",\"contentType\":\"%s\",\"size\":%s}".formatted(purpose, contentType, size);
    }

    @Test
    void issuesAnUploadUrlForAnAvatar() throws Exception {
        MvcResult result = requestUploadUrl(alice, body("avatar", "image/png", 1000))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageKey").value(org.hamcrest.Matchers.matchesPattern("avatars/" + aliceId + "/[0-9a-f-]{36}\\.png")))
                .andExpect(jsonPath("$.expiresIn").value(300))
                .andReturn();

        String key = JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.imageKey");
        String url = JsonPath.read(result.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.uploadUrl");
        assertThat(url).contains(key);
        // 形式と大きさを、署名に含める(S3 が、違うリクエストを拒否する)
        assertThat(storage.uploads()).singleElement().satisfies(upload -> {
            assertThat(upload.key()).isEqualTo(key);
            assertThat(upload.contentType()).isEqualTo("image/png");
            assertThat(upload.size()).isEqualTo(1000);
        });
    }

    @Test
    void usesThePostPrefixForPostImages() throws Exception {
        requestUploadUrl(alice, body("post", "image/webp", 2048))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageKey").value(org.hamcrest.Matchers.matchesPattern("posts/" + aliceId + "/[0-9a-f-]{36}\\.webp")));
    }

    @Test
    void issuesADifferentKeyEachTime() throws Exception {
        String first = JsonPath.read(requestUploadUrl(alice, body("avatar", "image/jpeg", 10)).andReturn()
                .getResponse().getContentAsString(StandardCharsets.UTF_8), "$.imageKey");
        String second = JsonPath.read(requestUploadUrl(alice, body("avatar", "image/jpeg", 10)).andReturn()
                .getResponse().getContentAsString(StandardCharsets.UTF_8), "$.imageKey");

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void acceptsExactlyFiveMegabytesAndRejectsOneByteMore() throws Exception {
        requestUploadUrl(alice, body("avatar", "image/jpeg", 5 * 1024 * 1024)).andExpect(status().isOk());
        requestUploadUrl(alice, body("avatar", "image/jpeg", 5 * 1024 * 1024 + 1))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("画像は 1 枚 5MB 以下にしてください"));
    }

    @Test
    void rejectsTypesOtherThanJpegPngWebp() throws Exception {
        for (String type : new String[] {"image/gif", "image/svg+xml", "text/html", "application/octet-stream"}) {
            requestUploadUrl(alice, body("avatar", type, 100))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("JPEG、PNG、WebP の画像を選んでください"));
        }
        assertThat(storage.uploads()).isEmpty();
    }

    @Test
    void rejectsEmptyAndNegativeSizes() throws Exception {
        requestUploadUrl(alice, body("avatar", "image/png", 0)).andExpect(status().isBadRequest());
        requestUploadUrl(alice, body("avatar", "image/png", -5)).andExpect(status().isBadRequest());
    }

    @Test
    void rejectsMissingOrUnknownFields() throws Exception {
        requestUploadUrl(alice, "{\"contentType\":\"image/png\",\"size\":100}").andExpect(status().isBadRequest());
        requestUploadUrl(alice, "{\"purpose\":\"avatar\",\"size\":100}").andExpect(status().isBadRequest());
        requestUploadUrl(alice, "{\"purpose\":\"avatar\",\"contentType\":\"image/png\"}").andExpect(status().isBadRequest());
        requestUploadUrl(alice, body("banner", "image/png", 100))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        requestUploadUrl(alice, "not json").andExpect(status().isBadRequest());
        assertThat(storage.uploads()).isEmpty();
    }

    @Test
    void requiresLogin() throws Exception {
        requestUploadUrl(null, body("avatar", "image/png", 100)).andExpect(status().isUnauthorized());
        assertThat(storage.uploads()).isEmpty();
    }
}
