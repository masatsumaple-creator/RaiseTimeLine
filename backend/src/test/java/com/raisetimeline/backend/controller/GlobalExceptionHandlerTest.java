package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.service.PostService;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/** どんなエラーでも { code, message, fieldErrors? } の形で返し、内部の情報を漏らさないことを確かめる。 */
@WebMvcTest(PostController.class)
@ControllerTest
class GlobalExceptionHandlerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    PostService postService;

    @Test
    void 想定外の例外は500のINTERNAL_ERRORにして_例外の内容を返さない() throws Exception {
        when(postService.get(5L, 1L)).thenThrow(new IllegalStateException("db password is hunter2"));

        MvcResult result = mockMvc.perform(get("/api/posts/1").with(loggedInAs(5)))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL_ERROR"))
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).doesNotContain("hunter2").doesNotContain("IllegalStateException").doesNotContain("at com.");
    }

    @Test
    void 許可されていないメソッドは405で_Allowヘッダーを保ったまま共通の形で返す() throws Exception {
        mockMvc.perform(patch("/api/posts/1").with(loggedInAs(5)))
                .andExpect(status().isMethodNotAllowed())
                .andExpect(header().exists(HttpHeaders.ALLOW))
                .andExpect(jsonPath("$.code").value("METHOD_NOT_ALLOWED"));
    }

    @Test
    void 対応していない本文の形式は415() throws Exception {
        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.TEXT_PLAIN).content("x"))
                .andExpect(status().isUnsupportedMediaType())
                .andExpect(jsonPath("$.code").value("UNSUPPORTED_MEDIA_TYPE"));
    }

    @Test
    void 存在しないパスは404のNOT_FOUND() throws Exception {
        mockMvc.perform(get("/api/nothing-here").with(loggedInAs(5)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void 本文が無いPOSTは400() throws Exception {
        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void 大きすぎる数値のIDは400で_どの項目かを返す() throws Exception {
        mockMvc.perform(get("/api/posts/99999999999999999999999").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.id").exists());
    }
}
