package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.config.RefreshTokenProperties;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/** リフレッシュトークンを運ぶ Cookie。JS から読めず、認証 API 以外には送られない。 */
@Component
public class RefreshCookies {

    public static final String NAME = "refresh_token";
    private static final String PATH = "/api/auth";

    private final RefreshTokenProperties properties;

    public RefreshCookies(RefreshTokenProperties properties) {
        this.properties = properties;
    }

    public ResponseCookie issue(String value) {
        return base(value).maxAge(properties.expiration()).build();
    }

    public ResponseCookie clear() {
        return base("").maxAge(0).build();
    }

    private ResponseCookie.ResponseCookieBuilder base(String value) {
        return ResponseCookie.from(NAME, value)
                .httpOnly(true)
                .secure(properties.cookieSecure())
                .sameSite("Strict")
                .path(PATH);
    }
}
