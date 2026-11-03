package com.raisetimeline.backend.service;

import static net.logstash.logback.argument.StructuredArguments.kv;

import com.raisetimeline.backend.config.S3Properties;
import com.raisetimeline.backend.dto.UploadUrlRequest;
import com.raisetimeline.backend.dto.UploadUrlResponse;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
import com.raisetimeline.backend.logging.LogThresholds;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 画像のアップロードと表示まわり。形式・大きさの検証、署名付き URL の発行、アップロードした画像の確認、削除をまとめる。
 * 画像のバイト列はここを通らない(ブラウザと S3 が署名付き URL で直接やり取りする)。
 */
@Service
public class ImageService {

    /** 画像 1 枚の上限(バイト)。 */
    public static final long MAX_BYTES = 5L * 1024 * 1024;

    static final String INVALID_TYPE_MESSAGE = "JPEG、PNG、WebP の画像を選んでください";
    static final String TOO_LARGE_MESSAGE = "画像は 1 枚 5MB 以下にしてください";
    static final String EMPTY_MESSAGE = "空の画像は使えません";
    static final String NOT_UPLOADED_MESSAGE = "画像のアップロードを確認できません。もう一度選んでください";
    static final String INVALID_KEY_MESSAGE = "画像が正しくありません。もう一度選んでください";

    private static final Logger log = LoggerFactory.getLogger(ImageService.class);

    private static final Map<String, String> EXTENSIONS =
            Map.of("image/jpeg", "jpg", "image/png", "png", "image/webp", "webp");
    private static final Map<String, String> CONTENT_TYPES =
            Map.of("jpg", "image/jpeg", "png", "image/png", "webp", "image/webp");

    /** avatars/{userId}/{uuid}.{ext} または posts/{userId}/{uuid}.{ext}。 */
    private static final Pattern KEY = Pattern.compile(
            "^(avatars|posts)/(\\d+)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|png|webp)$");

    /** ファイルの種類の確認に読む、先頭のバイト数(WebP は 12 バイト目まで見る)。 */
    private static final int SIGNATURE_BYTES = 12;

    /** 表示用 URL をためておく上限。これを超えたら捨てて作り直す(メモリを使い続けないため)。 */
    private static final int MAX_CACHED_URLS = 10_000;

    private final ImageStorage storage;
    private final S3Properties properties;
    private final Clock clock;
    private final Map<String, CachedUrl> urls = new ConcurrentHashMap<>();

    @Autowired
    public ImageService(ImageStorage storage, S3Properties properties) {
        this(storage, properties, Clock.systemUTC());
    }

    ImageService(ImageStorage storage, S3Properties properties, Clock clock) {
        this.storage = storage;
        this.properties = properties;
        this.clock = clock;
    }

    /** アップロード用の署名付き URL を発行する。形式と大きさは、ここで検証し、署名にも含めて S3 側でも強制する。 */
    public UploadUrlResponse createUploadUrl(Long userId, UploadUrlRequest request) {
        String extension = EXTENSIONS.get(request.contentType());
        if (extension == null) {
            throw badRequest(INVALID_TYPE_MESSAGE);
        }
        long size = request.size();
        if (size <= 0) {
            throw badRequest(EMPTY_MESSAGE);
        }
        if (size > MAX_BYTES) {
            throw badRequest(TOO_LARGE_MESSAGE);
        }
        // キーはサーバーが決める。ファイル名はクライアントから受け取らない
        String key = "%s/%d/%s.%s".formatted(request.purpose().prefix(), userId, UUID.randomUUID(), extension);
        Duration expiration = properties.uploadExpiration();
        String url = storage.presignUpload(key, request.contentType(), size, expiration);
        return new UploadUrlResponse(url, key, expiration.toSeconds());
    }

    /**
     * アップロードした画像を、使う前に確認する。次のどれかなら 400 にする。
     * 自分のキー(用途ごとの先頭 + 自分のユーザー ID)ではない、S3 に無い、大きすぎる・空、形式が違う、
     * 中身が JPEG / PNG / WebP ではない(拡張子や申告だけでなく、ファイルの先頭のバイトでも確かめる)。
     */
    public void requireUploaded(Long userId, ImagePurpose purpose, String key) {
        Matcher matcher = KEY.matcher(key == null ? "" : key);
        if (!matcher.matches()
                || !matcher.group(1).equals(purpose.prefix())
                || !matcher.group(2).equals(String.valueOf(userId))) {
            throw badRequest(INVALID_KEY_MESSAGE);
        }
        String extension = matcher.group(3);

        ImageStorage.StoredObject stored = storage.head(key).orElseThrow(() -> badRequest(NOT_UPLOADED_MESSAGE));
        if (stored.size() <= 0) {
            throw badRequest(EMPTY_MESSAGE);
        }
        if (stored.size() > MAX_BYTES) {
            rejectAndDiscard(key, TOO_LARGE_MESSAGE);
        }
        if (!CONTENT_TYPES.get(extension).equals(stored.contentType())
                || !hasSignature(extension, storage.readHead(key, SIGNATURE_BYTES))) {
            rejectAndDiscard(key, INVALID_TYPE_MESSAGE);
        }
    }

    /** 表示用の署名付き URL。キーが無い(アイコン未設定)、または画像を使えないときは null。 */
    public String urlFor(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        Instant now = clock.instant();
        CachedUrl cached = urls.get(key);
        if (cached != null && now.isBefore(cached.reusableUntil())) {
            return cached.url();
        }
        try {
            long start = System.nanoTime();
            String url = storage.presignGet(key, properties.getExpiration());
            warnIfSlow("s3.presignGet", key, start, LogThresholds.S3_PRESIGN);
            if (urls.size() >= MAX_CACHED_URLS) {
                urls.clear();
            }
            // 有効期間の半分だけ、同じ URL を返す。URL が変わらないのでブラウザのキャッシュが効き、署名の計算も減る
            urls.put(key, new CachedUrl(url, now.plus(properties.getExpiration().dividedBy(2))));
            return url;
        } catch (RuntimeException e) {
            // 画像が使えなくても、画面は表示名の頭文字で表示できる。一覧や詳細まで失敗させない
            log.warn("表示用の署名付き URL を作れませんでした", kv("operation", "s3.presignGet"), kv("imageKey", key), e);
            return null;
        }
    }

    /** DB の更新がコミットされたあとに、画像を S3 から消す。失敗してもユーザーには成功を返し、キーをログに残す。 */
    public void deleteAfterCommit(String key) {
        if (key == null || key.isBlank()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    deleteQuietly(key);
                }
            });
        } else {
            deleteQuietly(key);
        }
    }

    private void deleteQuietly(String key) {
        try {
            long start = System.nanoTime();
            storage.delete(key);
            warnIfSlow("s3.delete", key, start, LogThresholds.S3_DELETE);
            urls.remove(key);
        } catch (RuntimeException e) {
            log.warn("S3 の画像を消せませんでした(キーを記録します)", kv("operation", "s3.delete"), kv("imageKey", key), e);
        }
    }

    /** S3 の呼び出しが閾値より遅ければ、WARN で記録する。 */
    private static void warnIfSlow(String operation, String key, long startNanos, Duration threshold) {
        Duration elapsed = Duration.ofNanos(System.nanoTime() - startNanos);
        if (elapsed.compareTo(threshold) > 0) {
            log.warn("S3 の呼び出しが遅い", kv("operation", operation), kv("imageKey", key),
                    kv("durationMs", elapsed.toMillis()), kv("thresholdMs", threshold.toMillis()));
        }
    }

    private void rejectAndDiscard(String key, String message) {
        deleteQuietly(key);
        throw badRequest(message);
    }

    private static boolean hasSignature(String extension, byte[] head) {
        return switch (extension) {
            case "jpg" -> startsWith(head, 0xFF, 0xD8, 0xFF);
            case "png" -> startsWith(head, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A);
            // RIFF + (4 バイトの長さ) + WEBP
            case "webp" -> head.length >= SIGNATURE_BYTES
                    && startsWith(head, 'R', 'I', 'F', 'F')
                    && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
            default -> false;
        };
    }

    private static boolean startsWith(byte[] head, int... expected) {
        if (head.length < expected.length) {
            return false;
        }
        for (int i = 0; i < expected.length; i++) {
            if ((head[i] & 0xFF) != expected[i]) {
                return false;
            }
        }
        return true;
    }

    private static ApiException badRequest(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, message);
    }

    private record CachedUrl(String url, Instant reusableUntil) {
    }
}
