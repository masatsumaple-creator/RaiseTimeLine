package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.UserMapper;
import com.raisetimeline.backend.service.PostService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserMapper userMapper;
    private final PostService postService;

    public UserController(UserMapper userMapper, PostService postService) {
        this.userMapper = userMapper;
        this.postService = postService;
    }

    @GetMapping("/{handle}")
    public UserProfileResponse profile(@AuthenticationPrincipal Jwt jwt, @PathVariable String handle) {
        User user = userMapper.findByHandle(handle);
        if (user == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "ユーザーが見つかりません");
        }
        return UserProfileResponse.of(user, Long.valueOf(jwt.getSubject()));
    }

    @GetMapping("/{handle}/posts")
    public TimelineResponse posts(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String handle,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return postService.userPosts(Long.valueOf(jwt.getSubject()), handle, cursor, limit);
    }
}
