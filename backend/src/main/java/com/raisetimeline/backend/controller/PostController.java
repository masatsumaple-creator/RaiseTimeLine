package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.CreatePostRequest;
import com.raisetimeline.backend.dto.LikeResponse;
import com.raisetimeline.backend.dto.NewPostsResponse;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdatePostRequest;
import com.raisetimeline.backend.service.PostService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @GetMapping("/timeline")
    public TimelineResponse timeline(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = PostService.TAB_FOLLOWING) String tab,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return postService.timeline(userId(jwt), tab, cursor, limit);
    }

    /** 一覧の先頭(sinceId)より新しい投稿。クライアントが定期的に呼び、新着バーの表示に使う。 */
    @GetMapping("/timeline/new")
    public NewPostsResponse newPosts(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = PostService.TAB_FOLLOWING) String tab,
            @RequestParam Long sinceId) {
        return postService.newerThan(userId(jwt), tab, sinceId);
    }

    @PostMapping("/posts")
    public ResponseEntity<PostResponse> create(
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreatePostRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(postService.create(userId(jwt), body));
    }

    @GetMapping("/posts/{id}")
    public PostResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return postService.get(userId(jwt), id);
    }

    @PutMapping("/posts/{id}")
    public PostResponse update(
            @AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody UpdatePostRequest body) {
        return postService.update(userId(jwt), id, body);
    }

    @DeleteMapping("/posts/{id}")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        postService.delete(userId(jwt), id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/posts/{id}/like")
    public LikeResponse like(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return postService.like(userId(jwt), id);
    }

    @DeleteMapping("/posts/{id}/like")
    public LikeResponse unlike(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return postService.unlike(userId(jwt), id);
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
