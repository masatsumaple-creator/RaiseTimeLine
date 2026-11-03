package com.raisetimeline.backend.logging;

import java.time.Duration;

/**
 * 処理時間の閾値。超えたリクエストは WARN で「遅い」と記録する(アラートではなく、ログ上の目印)。
 * 値と根拠は docs/21_ログ設計と閾値.md にまとめてあり、変えるときは両方をそろえる。
 */
public final class LogThresholds {

    /** ログイン・サインアップ。BCrypt のハッシュ計算を含むため、他より長くとる。 */
    public static final Duration AUTH = Duration.ofMillis(1000);

    /** タイムライン・新着・ユーザー投稿一覧・検索など、一覧を DB から引く API。 */
    public static final Duration LIST = Duration.ofMillis(500);

    /** 画像のアップロード用 URL の発行など、S3 を呼ぶ API。 */
    public static final Duration IMAGE = Duration.ofMillis(800);

    /** 上のどれでもない API(投稿・コメント・いいね・フォローなど)。 */
    public static final Duration DEFAULT = Duration.ofMillis(300);

    /** 表示用の署名付き URL の発行(S3 SDK の署名計算。ネットワークは使わない)。 */
    public static final Duration S3_PRESIGN = Duration.ofMillis(100);

    /** S3 の画像削除(ネットワークを使う)。 */
    public static final Duration S3_DELETE = Duration.ofMillis(1000);

    private LogThresholds() {
    }

    /** リクエストの種類ごとの閾値。 */
    public static Duration forRequest(String method, String path) {
        if (path.startsWith("/api/auth/")) {
            return AUTH;
        }
        if (path.startsWith("/api/images/")) {
            return IMAGE;
        }
        if ("GET".equals(method) && (path.startsWith("/api/timeline")
                || path.startsWith("/api/search")
                || path.startsWith("/api/users")
                || path.endsWith("/comments"))) {
            return LIST;
        }
        return DEFAULT;
    }
}
