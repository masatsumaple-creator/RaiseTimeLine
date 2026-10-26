package com.raisetimeline.backend.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param bucket           画像を置く S3 バケット。空なら画像機能は無効
 * @param region           バケットのリージョン
 * @param uploadExpiration アップロード用の署名付き URL の有効期間
 * @param getExpiration    表示用の署名付き URL の有効期間
 */
@ConfigurationProperties(prefix = "app.s3")
public record S3Properties(String bucket, String region, Duration uploadExpiration, Duration getExpiration) {

    public S3Properties {
        bucket = bucket == null ? "" : bucket.strip();
        if (region == null || region.isBlank()) {
            throw new IllegalStateException("app.s3.region (環境変数 S3_REGION) を設定してください");
        }
        if (uploadExpiration == null || uploadExpiration.isNegative() || uploadExpiration.isZero()) {
            throw new IllegalStateException("app.s3.upload-expiration は正の期間で設定してください");
        }
        if (getExpiration == null || getExpiration.compareTo(Duration.ofMinutes(2)) < 0) {
            throw new IllegalStateException("app.s3.get-expiration は 2 分以上で設定してください");
        }
    }

    public boolean enabled() {
        return !bucket.isEmpty();
    }
}
