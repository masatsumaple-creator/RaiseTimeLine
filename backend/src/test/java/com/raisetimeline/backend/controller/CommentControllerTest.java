package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.dto.CommentCountResponse;
import com.raisetimeline.backend.dto.CommentCreatedResponse;
import com.raisetimeline.backend.dto.CommentPageResponse;
import com.raisetimeline.backend.dto.CommentResponse;
import com.raisetimeline.backend.dto.CreateCommentRequest;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.CommentService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(CommentController.class)
@ControllerTest
class CommentControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    CommentService commentService;

    private CommentResponse commentResponse(long id) {
        return new CommentResponse(id, 1L, "コメント", OffsetDateTime.parse("2026-01-01T00:00:00Z"),
                new PostResponse.Author(5L, "alice", "Alice", null), true);
    }

    @Test
    void listはコメント一覧とカーソルを返す() throws Exception {
        when(commentService.list(5L, 1L, "c", 10))
                .thenReturn(new CommentPageResponse(List.of(commentResponse(2)), "next"));

        mockMvc.perform(get("/api/posts/1/comments").param("cursor", "c").param("limit", "10").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(2))
                .andExpect(jsonPath("$.items[0].mine").value(true))
                .andExpect(jsonPath("$.nextCursor").value("next"));
    }

    @Test
    void listは投稿が無ければ404() throws Exception {
        when(commentService.list(5L, 1L, null, null))
                .thenThrow(new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "なし"));

        mockMvc.perform(get("/api/posts/1/comments").with(loggedInAs(5)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void listはログインしていなければ401() throws Exception {
        mockMvc.perform(get("/api/posts/1/comments")).andExpect(status().isUnauthorized());

        verifyNoInteractions(commentService);
    }

    @Test
    void createは201で作成したコメントとコメント数を返す() throws Exception {
        when(commentService.create(any(), any(), any()))
                .thenReturn(new CommentCreatedResponse(commentResponse(9), 3));

        mockMvc.perform(post("/api/posts/1/comments").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"  こんにちは  \"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.comment.id").value(9))
                .andExpect(jsonPath("$.commentCount").value(3));

        ArgumentCaptor<CreateCommentRequest> captor = ArgumentCaptor.forClass(CreateCommentRequest.class);
        verify(commentService).create(org.mockito.ArgumentMatchers.eq(5L), org.mockito.ArgumentMatchers.eq(1L), captor.capture());
        org.assertj.core.api.Assertions.assertThat(captor.getValue().body()).isEqualTo("こんにちは");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"body\":\"\"}", "{\"body\":\"   \"}", "{}", "{\"body\":null}"})
    void createは本文が空なら400で_bodyの項目エラーを返す(String json) throws Exception {
        mockMvc.perform(post("/api/posts/1/comments").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.body").exists());

        verifyNoInteractions(commentService);
    }

    @Test
    void createは280文字を超えたら400() throws Exception {
        mockMvc.perform(post("/api/posts/1/comments").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + "a".repeat(281) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.body").exists());
    }

    @Test
    void createは投稿IDが数値でなければ400() throws Exception {
        mockMvc.perform(post("/api/posts/abc/comments").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"x\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void deleteは削除後のコメント数を返す() throws Exception {
        when(commentService.delete(5L, 9L)).thenReturn(new CommentCountResponse(2));

        mockMvc.perform(delete("/api/comments/9").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commentCount").value(2));
    }

    @Test
    void deleteは他人のコメントなら403() throws Exception {
        when(commentService.delete(5L, 9L)).thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "他人"));

        mockMvc.perform(delete("/api/comments/9").with(loggedInAs(5)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void deleteはログインしていなければ401() throws Exception {
        mockMvc.perform(delete("/api/comments/9")).andExpect(status().isUnauthorized());

        verifyNoInteractions(commentService);
    }
}
