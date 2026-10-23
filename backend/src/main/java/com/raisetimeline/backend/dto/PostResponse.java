package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.Post;
import java.time.OffsetDateTime;

public record PostResponse(
        Long id,
        String body,
        OffsetDateTime createdAt,
        /** 編集されていなければ null。 */
        OffsetDateTime editedAt,
        Author author,
        long likeCount,
        boolean likedByMe
) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Author(Long id, String handle, String displayName, String avatarKey) {
    }

    public static PostResponse from(Post post, long likeCount, boolean likedByMe) {
        return new PostResponse(
                post.getId(),
                post.getBody(),
                post.getCreatedAt(),
                post.getUpdatedAt(),
                new Author(post.getUserId(), post.getAuthorHandle(), post.getAuthorDisplayName(),
                        post.getAuthorAvatarKey()),
                likeCount,
                likedByMe);
    }
}
