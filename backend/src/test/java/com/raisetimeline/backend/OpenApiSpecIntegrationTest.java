package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/**
 * API 仕様(OpenAPI)が、ログインなしで取得でき、主要な内容を含むこと。
 * システムプロパティ openapi.output にパスを渡すと、取得した仕様をそのファイルへ書き出す(gradle generateOpenApi が使う)。
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class OpenApiSpecIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Test
    void theSpecIsPublicAndDescribesTheApi() throws Exception {
        String body = mockMvc.perform(get("/api/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);

        ObjectMapper mapper = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);
        JsonNode spec = mapper.readTree(body);

        // 主要なエンドポイントが含まれる
        JsonNode paths = spec.get("paths");
        assertThat(paths.has("/api/auth/login")).isTrue();
        assertThat(paths.has("/api/timeline")).isTrue();
        assertThat(paths.has("/api/posts/{id}")).isTrue();
        assertThat(paths.has("/api/users/{handle}/follow")).isTrue();
        assertThat(paths.has("/api/images/upload-url")).isTrue();

        // Bearer 認証が定義され、既定で認証必須。認証不要の API だけ外れている
        assertThat(spec.at("/components/securitySchemes/bearerAuth/scheme").asText()).isEqualTo("bearer");
        assertThat(spec.at("/security/0/bearerAuth").isArray()).isTrue();
        assertThat(spec.at("/paths/~1api~1timeline/get/security").isMissingNode()).isTrue();
        for (String path : new String[] {"signup", "login", "refresh", "logout"}) {
            JsonNode security = spec.at("/paths/~1api~1auth~1" + path + "/post/security");
            assertThat(security.isArray()).isTrue();
            assertThat(security.size()).isZero();
        }

        // 共通のエラー応答が付いている
        assertThat(spec.at("/paths/~1api~1posts~1{id}/get/responses/404/content/application~1json/schema/$ref").asText())
                .endsWith("/ErrorResponse");

        // Jwt(認証情報)は、リクエストのパラメータとして出ない
        assertThat(spec.at("/paths/~1api~1timeline/get/parameters").toString()).doesNotContain("\"jwt\"");

        String output = System.getProperty("openapi.output");
        if (output != null && !output.isBlank()) {
            Path file = Path.of(output);
            Files.createDirectories(file.toAbsolutePath().getParent());
            Files.writeString(file, mapper.writeValueAsString(spec) + System.lineSeparator(), StandardCharsets.UTF_8);
        }
    }
}
