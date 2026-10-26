package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.ListedUser;
import java.util.function.Function;

/** 一覧の 1 行(フォロー中 / フォロワー / 検索結果)。アイコンは画像機能(F-17)の実装までは avatarKey を返す。 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserSummaryResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        String avatarUrl,
        boolean followedByMe,
        boolean isMe
) {

    public static UserSummaryResponse of(
            ListedUser user, Long viewerId, boolean followedByMe, Function<String, String> avatarUrl) {
        return new UserSummaryResponse(
                user.getId(), user.getHandle(), user.getDisplayName(), user.getBio(),
                avatarUrl.apply(user.getAvatarKey()),
                followedByMe, user.getId().equals(viewerId));
    }
}
