package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdateProfileRequest;
import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.dto.UserResponse;
import com.raisetimeline.backend.dto.UserSummaryResponse;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.PostService;
import com.raisetimeline.backend.service.UserService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(UserController.class)
@ControllerTest
class UserControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    UserService userService;

    @MockitoBean
    PostService postService;

    private UserSummaryResponse summary(long id, String handle) {
        return new UserSummaryResponse(id, handle, handle, null, null, false, false);
    }

    @Test
    void profileはプロフィールを返す_未設定の項目はJSONに含めない() throws Exception {
        when(userService.profile(5L, "alice"))
                .thenReturn(new UserProfileResponse(1L, "alice", "Alice", null, null, 2, 3, true, false));

        mockMvc.perform(get("/api/users/alice").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.handle").value("alice"))
                .andExpect(jsonPath("$.followingCount").value(2))
                .andExpect(jsonPath("$.followerCount").value(3))
                .andExpect(jsonPath("$.followedByMe").value(true))
                .andExpect(jsonPath("$.isMe").value(false))
                .andExpect(jsonPath("$.bio").doesNotExist())
                .andExpect(jsonPath("$.avatarUrl").doesNotExist());
    }

    @Test
    void profileはユーザーがいなければ404() throws Exception {
        when(userService.profile(5L, "nobody")).thenThrow(new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "なし"));

        mockMvc.perform(get("/api/users/nobody").with(loggedInAs(5)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void profileはログインしていなければ401() throws Exception {
        mockMvc.perform(get("/api/users/alice")).andExpect(status().isUnauthorized());

        verifyNoInteractions(userService);
    }

    @Test
    void postsはユーザーの投稿をPostServiceから取得する() throws Exception {
        when(postService.userPosts(5L, "alice", "c", 10)).thenReturn(new TimelineResponse(List.of(), "n"));

        mockMvc.perform(get("/api/users/alice/posts").param("cursor", "c").param("limit", "10").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nextCursor").value("n"));
    }

    @Test
    void followingとfollowersは一覧を返す() throws Exception {
        when(userService.following(5L, "alice", null, null))
                .thenReturn(new UserListResponse(List.of(summary(2, "bob")), null));
        when(userService.followers(5L, "alice", null, null))
                .thenReturn(new UserListResponse(List.of(summary(3, "carol")), "n"));

        mockMvc.perform(get("/api/users/alice/following").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].handle").value("bob"));
        mockMvc.perform(get("/api/users/alice/followers").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].handle").value("carol"))
                .andExpect(jsonPath("$.nextCursor").value("n"));
    }

    @Test
    void followはフォロー結果を返す() throws Exception {
        when(userService.follow(5L, "bob")).thenReturn(new FollowResponse(true, 7));

        mockMvc.perform(put("/api/users/bob/follow").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followedByMe").value(true))
                .andExpect(jsonPath("$.followerCount").value(7));
    }

    @Test
    void followは自分自身なら400のCANNOT_FOLLOW_SELF() throws Exception {
        when(userService.follow(5L, "me"))
                .thenThrow(new ApiException(HttpStatus.BAD_REQUEST, "CANNOT_FOLLOW_SELF", "自分"));

        mockMvc.perform(put("/api/users/me/follow").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CANNOT_FOLLOW_SELF"));
    }

    @Test
    void unfollowは解除結果を返す() throws Exception {
        when(userService.unfollow(5L, "bob")).thenReturn(new FollowResponse(false, 6));

        mockMvc.perform(delete("/api/users/bob/follow").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.followedByMe").value(false))
                .andExpect(jsonPath("$.followerCount").value(6));
    }

    // ---- プロフィール更新 ----

    @Test
    void updateMeはトークンのユーザー自身のプロフィールを更新する() throws Exception {
        when(userService.updateProfile(eq(5L), any()))
                .thenReturn(new UserResponse(5L, "alice", "新しい名前", "bio", null));

        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"  新しい名前  \",\"bio\":\"bio\",\"avatarKey\":\"avatar/5/a.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayName").value("新しい名前"));

        ArgumentCaptor<UpdateProfileRequest> captor = ArgumentCaptor.forClass(UpdateProfileRequest.class);
        verify(userService).updateProfile(eq(5L), captor.capture());
        assertThat(captor.getValue().displayName()).isEqualTo("新しい名前");
        assertThat(captor.getValue().avatarKey()).isEqualTo("avatar/5/a.png");
        assertThat(captor.getValue().removesAvatar()).isFalse();
    }

    @Test
    void updateMeの空白だけの自己紹介は未設定として扱う() throws Exception {
        when(userService.updateProfile(eq(5L), any())).thenReturn(new UserResponse(5L, "alice", "A", null, null));

        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"A\",\"bio\":\"   \"}"))
                .andExpect(status().isOk());

        ArgumentCaptor<UpdateProfileRequest> captor = ArgumentCaptor.forClass(UpdateProfileRequest.class);
        verify(userService).updateProfile(eq(5L), captor.capture());
        assertThat(captor.getValue().bio()).isNull();
    }

    @Test
    void updateMeは表示名が空白だけなら400() throws Exception {
        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());

        verifyNoInteractions(userService);
    }

    @Test
    void updateMeは表示名が51文字なら400で_50文字なら通る() throws Exception {
        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"" + "a".repeat(51) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.displayName").exists());

        when(userService.updateProfile(eq(5L), any())).thenReturn(new UserResponse(5L, "alice", "A", null, null));
        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"" + "a".repeat(50) + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void updateMeは自己紹介が161文字なら400() throws Exception {
        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"A\",\"bio\":\"" + "a".repeat(161) + "\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.bio").exists());
    }

    @Test
    void updateMeはremoveAvatarを受け取る() throws Exception {
        when(userService.updateProfile(eq(5L), any())).thenReturn(new UserResponse(5L, "alice", "A", null, null));

        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"A\",\"removeAvatar\":true}"))
                .andExpect(status().isOk());

        ArgumentCaptor<UpdateProfileRequest> captor = ArgumentCaptor.forClass(UpdateProfileRequest.class);
        verify(userService).updateProfile(eq(5L), captor.capture());
        assertThat(captor.getValue().removesAvatar()).isTrue();
    }

    @Test
    void updateMeのパスはmeがハンドルとして解釈されない() throws Exception {
        // PUT /api/users/me は updateMe に届き、/{handle}/follow のような別のルートには流れない
        when(userService.updateProfile(eq(5L), any())).thenReturn(new UserResponse(5L, "alice", "A", null, null));

        mockMvc.perform(put("/api/users/me").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"displayName\":\"A\"}"))
                .andExpect(status().isOk());

        verify(userService, org.mockito.Mockito.never()).follow(any(), any());
    }
}
