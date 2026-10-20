package com.raisetimeline.backend.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param expiration  リフレッシュトークンの有効期間
 * @param cookieSecure Cookie の Secure 属性。HTTPS の本番は true、HTTP の開発環境のみ false
 * @param reuseGrace  使用済みトークンの再提示を「複数タブの同時 refresh」とみなして失効させない猶予
 */
@ConfigurationProperties(prefix = "app.refresh-token")
public record RefreshTokenProperties(Duration expiration, boolean cookieSecure, Duration reuseGrace) {

    public RefreshTokenProperties {
        if (expiration == null || expiration.isNegative() || expiration.isZero()) {
            throw new IllegalStateException("app.refresh-token.expiration は正の期間で設定してください");
        }
        if (reuseGrace == null || reuseGrace.isNegative()) {
            throw new IllegalStateException("app.refresh-token.reuse-grace は 0 以上の期間で設定してください");
        }
    }
}
