package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.service.PostService;
import com.raisetimeline.backend.service.UserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final PostService postService;

    public UserController(UserService userService, PostService postService) {
        this.userService = userService;
        this.postService = postService;
    }

    @GetMapping("/{handle}")
    public UserProfileResponse profile(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.profile(userId(jwt), handle);
    }

    @GetMapping("/{handle}/posts")
    public TimelineResponse posts(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String handle,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return postService.userPosts(userId(jwt), handle, cursor, limit);
    }

    @PutMapping("/{handle}/follow")
    public FollowResponse follow(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.follow(userId(jwt), handle);
    }

    @DeleteMapping("/{handle}/follow")
    public FollowResponse unfollow(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        return userService.unfollow(userId(jwt), handle);
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
