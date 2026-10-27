package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdateProfileRequest;
import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.dto.UserResponse;
import com.raisetimeline.backend.service.PostService;
import com.raisetimeline.backend.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@Tag(name = "ユーザー", description = "プロフィール・フォロー")
public class UserController {

    private final UserService userService;
    private final PostService postService;

    public UserController(UserService userService, PostService postService) {
        this.userService = userService;
        this.postService = postService;
    }

    /** ログイン中のユーザー自身のプロフィールを更新する(対象はトークンのユーザー。リクエストでは指定させない)。 */
    @Operation(summary = "自分のプロフィールを更新")
    @PutMapping("/me")
    public UserResponse updateMe(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UpdateProfileRequest body) {
        return userService.updateProfile(userId(jwt), body);
    }

    @Operation(summary = "プロフィールを取得")
    @GetMapping("/{handle}")
    public UserProfileResponse profile(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.profile(userId(jwt), handle);
    }

    @Operation(summary = "ユーザーの投稿一覧を取得")
    @GetMapping("/{handle}/posts")
    public TimelineResponse posts(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String handle,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return postService.userPosts(userId(jwt), handle, cursor, limit);
    }

    @Operation(summary = "フォロー中の一覧を取得")
    @GetMapping("/{handle}/following")
    public UserListResponse following(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String handle,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return userService.following(userId(jwt), handle, cursor, limit);
    }

    @Operation(summary = "フォロワーの一覧を取得")
    @GetMapping("/{handle}/followers")
    public UserListResponse followers(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String handle,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return userService.followers(userId(jwt), handle, cursor, limit);
    }

    @Operation(summary = "フォローする")
    @PutMapping("/{handle}/follow")
    public FollowResponse follow(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.follow(userId(jwt), handle);
    }

    @Operation(summary = "フォローを解除")
    @DeleteMapping("/{handle}/follow")
    public FollowResponse unfollow(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.unfollow(userId(jwt), handle);
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
