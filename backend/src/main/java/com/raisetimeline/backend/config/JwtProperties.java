package com.raisetimeline.backend.config;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param secret     HS256 の署名鍵。32 バイト以上。環境変数 JWT_SECRET で渡す
 * @param expiration アクセストークンの有効期間
 */
@ConfigurationProperties(prefix = "app.jwt")
public record JwtProperties(String secret, Duration expiration) {

    static final int MIN_SECRET_BYTES = 32;

    public JwtProperties {
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "app.jwt.secret (環境変数 JWT_SECRET) は " + MIN_SECRET_BYTES + " バイト以上で設定してください");
        }
        if (expiration == null || expiration.isNegative() || expiration.isZero()) {
            throw new IllegalStateException("app.jwt.expiration は正の期間で設定してください");
        }
    }
}
