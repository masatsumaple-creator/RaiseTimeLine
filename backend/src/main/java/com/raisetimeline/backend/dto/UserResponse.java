package com.raisetimeline.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.raisetimeline.backend.entity.User;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record UserResponse(
        Long id,
        String handle,
        String displayName,
        String bio,
        String avatarKey
) {

    public static UserResponse from(User user) {
        return new UserResponse(
                user.getId(), user.getHandle(), user.getDisplayName(), user.getBio(), user.getAvatarKey());
    }
}
