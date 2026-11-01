package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.dto.CreatePostRequest;
import com.raisetimeline.backend.dto.LikeResponse;
import com.raisetimeline.backend.dto.NewPostsResponse;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdatePostRequest;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.PostService;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PostController.class)
@ControllerTest
class PostControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    PostService postService;

    private PostResponse postResponse(long id) {
        return new PostResponse(id, "本文", OffsetDateTime.parse("2026-01-01T00:00:00Z"), null,
                new PostResponse.Author(5L, "alice", "Alice", null), 2, true, 1, List.of());
    }

    // ---- 認証 ----

    @Test
    void ログインしていなければ401で_Serviceは呼ばれない() throws Exception {
        mockMvc.perform(get("/api/timeline"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        verifyNoInteractions(postService);
    }

    // ---- タイムライン ----

    @Test
    void timelineは既定でフォロー中タブになり_トークンのユーザーIDで呼ばれる() throws Exception {
        when(postService.timeline(5L, "following", null, null))
                .thenReturn(new TimelineResponse(List.of(postResponse(1)), "next-cursor"));

        mockMvc.perform(get("/api/timeline").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(1))
                .andExpect(jsonPath("$.items[0].author.handle").value("alice"))
                .andExpect(jsonPath("$.items[0].likedByMe").value(true))
                .andExpect(jsonPath("$.nextCursor").value("next-cursor"));
    }

    @Test
    void timelineはtab_cursor_limitをServiceに渡す() throws Exception {
        when(postService.timeline(5L, "all", "abc", 10)).thenReturn(new TimelineResponse(List.of(), null));

        mockMvc.perform(get("/api/timeline").param("tab", "all").param("cursor", "abc").param("limit", "10")
                        .with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());

        verify(postService).timeline(5L, "all", "abc", 10);
    }

    @Test
    void timelineのlimitが数値でなければ400で_その項目のエラーを返す() throws Exception {
        mockMvc.perform(get("/api/timeline").param("limit", "abc").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.limit").exists());

        verifyNoInteractions(postService);
    }

    @Test
    void timelineはServiceが投げたApiExceptionのステータスとコードをそのまま返す() throws Exception {
        when(postService.timeline(5L, "x", null, null))
                .thenThrow(new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "tab が不正"));

        mockMvc.perform(get("/api/timeline").param("tab", "x").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void newPostsはsinceIdが必須で_無ければ400() throws Exception {
        mockMvc.perform(get("/api/timeline/new").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.sinceId").exists());
    }

    @Test
    void newPostsは新着を返す() throws Exception {
        when(postService.newerThan(5L, "following", 10L))
                .thenReturn(new NewPostsResponse(1, false, List.of(postResponse(11))));

        mockMvc.perform(get("/api/timeline/new").param("sinceId", "10").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.items[0].id").value(11));
    }

    // ---- 作成 ----

    @Test
    void createは201で作成した投稿を返し_本文と画像をServiceに渡す() throws Exception {
        when(postService.create(any(), any())).thenReturn(postResponse(7));

        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"  こんにちは  \",\"imageKeys\":[\"post/5/a.png\"]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(7));

        ArgumentCaptor<CreatePostRequest> captor = ArgumentCaptor.forClass(CreatePostRequest.class);
        verify(postService).create(eq(5L), captor.capture());
        // 本文は前後の空白が取り除かれる
        assertThat(captor.getValue().body()).isEqualTo("こんにちは");
        assertThat(captor.getValue().imageKeys()).containsExactly("post/5/a.png");
    }

    @Test
    void createは本文を省略しても受け付ける_画像だけの投稿のため() throws Exception {
        when(postService.create(any(), any())).thenReturn(postResponse(7));

        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"imageKeys\":[\"post/5/a.png\"]}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createは本文が280文字を超えたら400で_bodyの項目エラーを返す() throws Exception {
        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + "あ".repeat(281) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors.body").exists());

        verifyNoInteractions(postService);
    }

    @Test
    void createは本文が280文字ちょうどなら受け付ける_サロゲートペアも1文字と数える() throws Exception {
        when(postService.create(any(), any())).thenReturn(postResponse(7));

        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + "😀".repeat(280) + "\"}"))
                .andExpect(status().isCreated());
    }

    @Test
    void createは画像が5枚以上なら400で_imageKeysの項目エラーを返す() throws Exception {
        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"x\",\"imageKeys\":[\"1\",\"2\",\"3\",\"4\",\"5\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.imageKeys").exists());
    }

    @Test
    void createはJSONが壊れていたら400() throws Exception {
        mockMvc.perform(post("/api/posts").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{not json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(postService);
    }

    // ---- 取得・更新・削除 ----

    @Test
    void getは投稿を返す() throws Exception {
        when(postService.get(5L, 3L)).thenReturn(postResponse(3));

        mockMvc.perform(get("/api/posts/3").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(3))
                .andExpect(jsonPath("$.commentCount").value(1));
    }

    @Test
    void getはIDが数値でなければ400() throws Exception {
        mockMvc.perform(get("/api/posts/abc").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void getは投稿が無ければ404() throws Exception {
        when(postService.get(5L, 3L)).thenThrow(new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "なし"));

        mockMvc.perform(get("/api/posts/3").with(loggedInAs(5)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void updateは本文を更新して投稿を返す() throws Exception {
        when(postService.update(any(), any(), any())).thenReturn(postResponse(3));

        mockMvc.perform(put("/api/posts/3").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"新\"}"))
                .andExpect(status().isOk());

        ArgumentCaptor<UpdatePostRequest> captor = ArgumentCaptor.forClass(UpdatePostRequest.class);
        verify(postService).update(eq(5L), eq(3L), captor.capture());
        assertThat(captor.getValue().body()).isEqualTo("新");
    }

    @Test
    void updateは本文が280文字を超えたら400() throws Exception {
        mockMvc.perform(put("/api/posts/3").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"" + "a".repeat(281) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.body").exists());
    }

    @Test
    void updateは他人の投稿なら403を返す() throws Exception {
        when(postService.update(any(), any(), any()))
                .thenThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "他人"));

        mockMvc.perform(put("/api/posts/3").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"新\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("FORBIDDEN"));
    }

    @Test
    void deleteは204で本文なし() throws Exception {
        mockMvc.perform(delete("/api/posts/3").with(loggedInAs(5)))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        verify(postService).delete(5L, 3L);
    }

    @Test
    void deleteは他人の投稿なら403() throws Exception {
        doThrow(new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "他人"))
                .when(postService).delete(5L, 3L);

        mockMvc.perform(delete("/api/posts/3").with(loggedInAs(5)))
                .andExpect(status().isForbidden());
    }

    // ---- いいね ----

    @Test
    void likeはいいね数と済みを返す() throws Exception {
        when(postService.like(5L, 3L)).thenReturn(new LikeResponse(4, true));

        mockMvc.perform(put("/api/posts/3/like").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(4))
                .andExpect(jsonPath("$.likedByMe").value(true));
    }

    @Test
    void unlikeはいいね数と未済みを返す() throws Exception {
        when(postService.unlike(5L, 3L)).thenReturn(new LikeResponse(3, false));

        mockMvc.perform(delete("/api/posts/3/like").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.likeCount").value(3))
                .andExpect(jsonPath("$.likedByMe").value(false));
    }

    @Test
    void ログインしていなければ_書き込み系も401でServiceは呼ばれない() throws Exception {
        mockMvc.perform(post("/api/posts").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/posts/3").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/posts/3")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/posts/3/like")).andExpect(status().isUnauthorized());

        verify(postService, never()).create(any(), any());
        verifyNoInteractions(postService);
    }
}
