package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.Post;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Function;

public record PostResponse(
        Long id,
        String body,
        OffsetDateTime createdAt,
        /** 編集されていなければ null。 */
        OffsetDateTime editedAt,
        Author author,
        long likeCount,
        boolean likedByMe,
        long commentCount,
        /** 付いている画像(表示順)。無ければ空。 */
        List<Image> images
) {

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Author(Long id, String handle, String displayName, String avatarUrl) {
    }

    /** url は表示用の署名付き URL。 */
    public record Image(String url, int sortOrder) {
    }

    public static PostResponse from(
            Post post,
            long likeCount,
            boolean likedByMe,
            long commentCount,
            List<Image> images,
            Function<String, String> avatarUrl) {
        return new PostResponse(
                post.getId(),
                post.getBody(),
                post.getCreatedAt(),
                post.getUpdatedAt(),
                new Author(post.getUserId(), post.getAuthorHandle(), post.getAuthorDisplayName(),
                        avatarUrl.apply(post.getAuthorAvatarKey())),
                likeCount,
                likedByMe,
                commentCount,
                images);
    }
}
