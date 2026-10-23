package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.FollowEntry;

/** 一覧の 1 行(フォロー中 / フォロワー)。アイコンは画像機能(F-17)の実装までは avatarKey を返す。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserSummaryResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        String avatarKey,
        boolean followedByMe,
        boolean isMe
) {

    public static UserSummaryResponse of(FollowEntry entry, Long viewerId, boolean followedByMe) {
        return new UserSummaryResponse(
                entry.getId(), entry.getHandle(), entry.getDisplayName(), entry.getBio(), entry.getAvatarKey(),
                followedByMe, entry.getId().equals(viewerId));
    }
}
