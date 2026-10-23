package com.raisetimeline.backend.dto;

import com.raisetimeline.backend.entity.Comment;
import java.time.OffsetDateTime;

public record CommentResponse(
        Long id,
        Long postId,
        String body,
        OffsetDateTime createdAt,
        PostResponse.Author author,
        /** ログイン中のユーザー自身のコメントか(削除ボタンを出すため)。 */
        boolean mine
) {

    public static CommentResponse from(Comment comment, Long currentUserId) {
        return new CommentResponse(
                comment.getId(),
                comment.getPostId(),
                comment.getBody(),
                comment.getCreatedAt(),
                new PostResponse.Author(comment.getUserId(), comment.getAuthorHandle(),
                        comment.getAuthorDisplayName(), comment.getAuthorAvatarKey()),
                comment.getUserId().equals(currentUserId));
    }
}
