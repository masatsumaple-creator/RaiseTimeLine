package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 検索。/api/users/{handle} と衝突しないよう(ハンドルが search のユーザーがいてもよい)、/api/search 配下に置く。 */
@RestController
@RequestMapping("/api/search")
@Tag(name = "検索")
public class SearchController {

    private final UserService userService;

    public SearchController(UserService userService) {
        this.userService = userService;
    }

    @Operation(summary = "ユーザーを検索")
    @GetMapping("/users")
    public UserListResponse users(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return userService.search(Long.valueOf(jwt.getSubject()), q, cursor, limit);
    }
}
