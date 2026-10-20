package com.raisetimeline.backend.dto;

import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.service.JwtService.IssuedToken;

public record AuthResponse(String accessToken, String tokenType, long expiresIn, UserResponse user) {

    private static final String BEARER = "Bearer";

    public static AuthResponse of(IssuedToken token, User user) {
        return new AuthResponse(token.value(), BEARER, token.expiresInSeconds(), UserResponse.from(user));
    }
}
