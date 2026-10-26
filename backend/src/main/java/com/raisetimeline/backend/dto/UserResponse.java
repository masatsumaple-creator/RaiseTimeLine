package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.User;
import java.util.function.Function;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        /** アイコンの表示用の署名付き URL。未設定なら無い。 */
        String avatarUrl
) {

    /** avatarUrl には、アイコンのキーを表示用の URL に変える関数を渡す。 */
    public static UserResponse from(User user, Function<String, String> avatarUrl) {
        return new UserResponse(
                user.getId(), user.getHandle(), user.getDisplayName(), user.getBio(),
                avatarUrl.apply(user.getAvatarKey()));
    }
}
