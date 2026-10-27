package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.CommentCountResponse;
import com.raisetimeline.backend.dto.CommentCreatedResponse;
import com.raisetimeline.backend.dto.CommentPageResponse;
import com.raisetimeline.backend.dto.CreateCommentRequest;
import com.raisetimeline.backend.service.CommentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "コメント")
public class CommentController {

    private final CommentService commentService;

    public CommentController(CommentService commentService) {
        this.commentService = commentService;
    }

    @Operation(summary = "コメント一覧を取得")
    @GetMapping("/posts/{postId}/comments")
    public CommentPageResponse list(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long postId,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer limit) {
        return commentService.list(userId(jwt), postId, cursor, limit);
    }

    @Operation(summary = "コメントを投稿")
    @PostMapping("/posts/{postId}/comments")
    public ResponseEntity<CommentCreatedResponse> create(
            @AuthenticationPrincipal Jwt jwt, @PathVariable Long postId, @Valid @RequestBody CreateCommentRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(commentService.create(userId(jwt), postId, body));
    }

    @Operation(summary = "コメントを削除")
    @DeleteMapping("/comments/{id}")
    public CommentCountResponse delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return commentService.delete(userId(jwt), id);
    }

    private static Long userId(Jwt jwt) {
        return Long.valueOf(jwt.getSubject());
    }
}
