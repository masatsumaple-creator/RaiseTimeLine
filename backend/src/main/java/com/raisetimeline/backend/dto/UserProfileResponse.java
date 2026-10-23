package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.User;

/** プロフィール(S-05)。アイコンは画像機能(F-17)の実装までは avatarKey を返す。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserProfileResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        String avatarKey,
        long followingCount,
        long followerCount,
        boolean followedByMe,
        boolean isMe
) {

    public static UserProfileResponse of(
            User user, Long viewerId, long followingCount, long followerCount, boolean followedByMe) {
        return new UserProfileResponse(
                user.getId(), user.getHandle(), user.getDisplayName(), user.getBio(), user.getAvatarKey(),
                followingCount, followerCount, followedByMe, user.getId().equals(viewerId));
    }
}
