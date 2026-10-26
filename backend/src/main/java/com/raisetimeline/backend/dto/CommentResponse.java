package com.raisetimeline.backend.dto;

import com.raisetimeline.backend.entity.Comment;
import java.time.OffsetDateTime;
import java.util.function.Function;

public record CommentResponse(
        Long id,
        Long postId,
        String body,
        OffsetDateTime createdAt,
        PostResponse.Author author,
        /** ログイン中のユーザー自身のコメントか(削除ボタンを出すため)。 */
        boolean mine
) {

    public static CommentResponse from(Comment comment, Long currentUserId, Function<String, String> avatarUrl) {
        return new CommentResponse(
                comment.getId(),
                comment.getPostId(),
                comment.getBody(),
                comment.getCreatedAt(),
                new PostResponse.Author(comment.getUserId(), comment.getAuthorHandle(),
                        comment.getAuthorDisplayName(),
                        avatarUrl.apply(comment.getAuthorAvatarKey())),
                comment.getUserId().equals(currentUserId));
    }
}
