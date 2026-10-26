package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.User;
import java.util.function.Function;

/** プロフィール(S-05)。avatarUrl はアイコンの表示用の署名付き URL(未設定なら無い)。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserProfileResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        String avatarUrl,
        long followingCount,
        long followerCount,
        boolean followedByMe,
        boolean isMe
) {

    public static UserProfileResponse of(
            User user, Long viewerId, long followingCount, long followerCount, boolean followedByMe,
            Function<String, String> avatarUrl) {
        return new UserProfileResponse(
                user.getId(), user.getHandle(), user.getDisplayName(), user.getBio(),
                avatarUrl.apply(user.getAvatarKey()),
                followingCount, followerCount, followedByMe, user.getId().equals(viewerId));
    }
}
