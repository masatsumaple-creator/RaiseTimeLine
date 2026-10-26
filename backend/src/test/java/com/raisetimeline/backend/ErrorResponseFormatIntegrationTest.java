package com.raisetimeline.backend;

import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.raisetimeline.backend.mapper.UserMapper;
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
import org.springframework.test.web.servlet.ResultActions;

/** どんなエラーも { code, message, fieldErrors? } の形で返すこと(Spring 標準の形式 timestamp / status / error / path を返さない)。 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
@AutoConfigureMockMvc
class ErrorResponseFormatIntegrationTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JdbcTemplate jdbc;

    @MockitoSpyBean
    UserMapper userMapper;

    String alice;

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
    }

    private ResultActions authed(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request) throws Exception {
        return mockMvc.perform(request.header(HttpHeaders.AUTHORIZATION, alice));
    }

    /** Spring 標準の形式のフィールドが、混ざっていないこと。 */
    private static ResultActions notSpringDefault(ResultActions result) throws Exception {
        return result
                .andExpect(jsonPath("$.timestamp").doesNotExist())
                .andExpect(jsonPath("$.status").doesNotExist())
                .andExpect(jsonPath("$.error").doesNotExist())
                .andExpect(jsonPath("$.path").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    // ---- 型の不一致・必須パラメータの欠落(400) ----

    @Test
    void pathValueOfTheWrongTypeIs400WithTheFieldName() throws Exception {
        notSpringDefault(authed(get("/api/posts/abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("入力内容が正しくありません"))
                .andExpect(jsonPath("$.fieldErrors.id").value("値の形式が正しくありません")));
    }

    @Test
    void aNumberTooLargeToFitIs400() throws Exception {
        notSpringDefault(authed(delete("/api/comments/99999999999999999999"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.id").exists()));
    }

    @Test
    void queryValueOfTheWrongTypeIs400WithTheFieldName() throws Exception {
        notSpringDefault(authed(get("/api/timeline").param("limit", "abc"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.limit").value("値の形式が正しくありません")));
    }

    @Test
    void aMissingRequiredQueryParameterIs400WithTheFieldName() throws Exception {
        notSpringDefault(authed(get("/api/timeline/new"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.sinceId").value("必須です")));
    }

    @Test
    void brokenJsonAndBeanValidationKeepTheirFormat() throws Exception {
        notSpringDefault(mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.message").value("入力内容が正しくありません")));

        notSpringDefault(mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors").exists()));
    }

    // ---- 405・406・415・404 ----

    @Test
    void anUnsupportedMethodIs405AndKeepsTheAllowHeader() throws Exception {
        notSpringDefault(authed(delete("/api/timeline"))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().string(HttpHeaders.ALLOW, containsString("GET")))
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED")));
    }

    @Test
    void anUnsupportedContentTypeIs415() throws Exception {
        notSpringDefault(authed(post("/api/posts").contentType(MediaType.TEXT_PLAIN).content("x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE")));
    }

    @Test
    void anUnacceptableResponseTypeIs406() throws Exception {
        // XML を要求されても、エラーの本文を XML にする仕組みがないので、本文は空になる(ステータスだけが、正しく返る)
        authed(get("/api/timeline").accept(MediaType.APPLICATION_XML)).andExpect(status().isNotAcceptable());
    }

    @Test
    void anUnknownPathIs404WhenLoggedIn() throws Exception {
        notSpringDefault(authed(get("/api/nope"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND")));
    }

    // ---- これまでどおりのエラー ----

    @Test
    void appErrorsAreUnchanged() throws Exception {
        notSpringDefault(authed(get("/api/users/nobody"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("ユーザーが見つかりません")));
    }

    @Test
    void authenticationErrorsAreStill401And403InTheSameFormat() throws Exception {
        notSpringDefault(mockMvc.perform(get("/api/nope"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED")));

        // 他人の投稿の削除は 403(アプリのエラー)
        MvcResult other = mockMvc.perform(post("/api/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"b@example.com\",\"password\":\"password1\",\"handle\":\"bob\",\"displayName\":\"bob\"}"))
                .andReturn();
        String bob = "Bearer " + JsonPath.read(other.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
        MvcResult created = mockMvc.perform(post("/api/posts").header(HttpHeaders.AUTHORIZATION, alice)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andReturn();
        Integer id = JsonPath.read(created.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.id");
        notSpringDefault(mockMvc.perform(delete("/api/posts/{id}", id).header(HttpHeaders.AUTHORIZATION, bob))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN")));
    }

    // ---- 想定外の例外(500) ----

    @Test
    void anUnexpectedExceptionIs500WithoutLeakingInternals() throws Exception {
        doThrow(new IllegalStateException("secret-internal-detail: jdbc:postgresql://db/password"))
                .when(userMapper).findByHandle(any());

        MvcResult result = notSpringDefault(authed(get("/api/users/alice"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.message").value("サーバーでエラーが発生しました。しばらくしてからやり直してください")))
                .andReturn();

        // 例外のメッセージ・クラス名・スタックトレースは、利用者に返さない
        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        org.assertj.core.api.Assertions.assertThat(body)
                .doesNotContain("secret-internal-detail")
                .doesNotContain("IllegalStateException")
                .doesNotContain("at com.raisetimeline")
                .doesNotContain("password");
    }

    @Test
    void theServerKeepsWorkingAfterAnUnexpectedException() throws Exception {
        doThrow(new IllegalStateException("boom")).when(userMapper).findByHandle(any());
        authed(get("/api/users/alice")).andExpect(status().isInternalServerError());

        org.mockito.Mockito.reset(userMapper);

        authed(get("/api/users/alice")).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON));
    }
}
