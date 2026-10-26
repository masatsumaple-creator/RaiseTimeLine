package com.raisetimeline.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.FakeImageStorage;
import com.raisetimeline.backend.config.S3Properties;
import com.raisetimeline.backend.dto.UploadUrlRequest;
import com.raisetimeline.backend.dto.UploadUrlResponse;
import com.raisetimeline.backend.exception.ApiException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class ImageServiceTest {

    private static final long USER = 7L;
    private static final String UUID_PART = "3f9a2b4c-1d2e-4f50-8a6b-7c8d9e0f1a2b";
    private static final String AVATAR_KEY = "avatars/7/" + UUID_PART + ".jpg";

    /** 進められる時計(表示用 URL を使い回す時間のテスト用)。 */
    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-10-26T00:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneOffset getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }

    private FakeImageStorage storage;
    private MutableClock clock;
    private ImageService service;

    @BeforeEach
    void setUp() {
        storage = new FakeImageStorage();
        clock = new MutableClock();
        S3Properties properties = new S3Properties("bucket", "ap-northeast-1", Duration.ofMinutes(5), Duration.ofHours(1));
        service = new ImageService(storage, properties, clock);
    }

    @AfterEach
    void clearSynchronization() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private static UploadUrlRequest request(ImagePurpose purpose, String contentType, long size) {
        return new UploadUrlRequest(purpose, contentType, size);
    }

    private static void assertBadRequest(Runnable action, String message) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getMessage()).isEqualTo(message);
                });
    }

    // ---- アップロード用の署名付き URL ----

    @Test
    void createsAnUploadUrlWithAServerChosenKeyAndSignsTypeAndSize() {
        UploadUrlResponse response = service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", 1234));

        assertThat(response.imageKey()).matches("avatars/7/[0-9a-f-]{36}\\.png");
        assertThat(response.expiresIn()).isEqualTo(300);
        assertThat(storage.uploads()).singleElement().satisfies(upload -> {
            assertThat(upload.key()).isEqualTo(response.imageKey());
            assertThat(upload.contentType()).isEqualTo("image/png");
            assertThat(upload.size()).isEqualTo(1234);
            assertThat(upload.expiration()).isEqualTo(Duration.ofMinutes(5));
        });
        assertThat(response.uploadUrl()).contains(response.imageKey());
    }

    @Test
    void usesTheExtensionForEachAllowedType() {
        assertThat(service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/jpeg", 1)).imageKey()).endsWith(".jpg");
        assertThat(service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", 1)).imageKey()).endsWith(".png");
        assertThat(service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/webp", 1)).imageKey()).endsWith(".webp");
    }

    @Test
    void usesThePostPrefixForPostImages() {
        assertThat(service.createUploadUrl(USER, request(ImagePurpose.POST, "image/jpeg", 1)).imageKey())
                .startsWith("posts/7/");
    }

    @Test
    void generatesADifferentKeyEveryTime() {
        String first = service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", 1)).imageKey();
        String second = service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", 1)).imageKey();

        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void rejectsOtherTypesWithoutIssuingAUrl() {
        for (String type : List.of("image/gif", "image/svg+xml", "text/plain", "application/pdf", "IMAGE/PNG", "")) {
            assertBadRequest(() -> service.createUploadUrl(USER, request(ImagePurpose.AVATAR, type, 100)),
                    ImageService.INVALID_TYPE_MESSAGE);
        }
        assertThat(storage.uploads()).isEmpty();
    }

    @Test
    void acceptsExactlyFiveMegabytesAndRejectsOneByteMore() {
        assertThat(service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", ImageService.MAX_BYTES))).isNotNull();

        assertBadRequest(() -> service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", ImageService.MAX_BYTES + 1)),
                ImageService.TOO_LARGE_MESSAGE);
    }

    @Test
    void rejectsEmptyAndNegativeSizes() {
        assertBadRequest(() -> service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", 0)), ImageService.EMPTY_MESSAGE);
        assertBadRequest(() -> service.createUploadUrl(USER, request(ImagePurpose.AVATAR, "image/png", -1)), ImageService.EMPTY_MESSAGE);
    }

    // ---- アップロードした画像の確認 ----

    @Test
    void acceptsUploadedImagesWhoseContentMatches() {
        storage.put("avatars/7/" + UUID_PART + ".jpg", "image/jpeg", FakeImageStorage.JPEG);
        storage.put("avatars/7/" + UUID_PART.replace('3', '4') + ".png", "image/png", FakeImageStorage.PNG);
        storage.put("avatars/7/" + UUID_PART.replace('3', '5') + ".webp", "image/webp", FakeImageStorage.WEBP);

        assertThatCode(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY)).doesNotThrowAnyException();
        assertThatCode(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, "avatars/7/" + UUID_PART.replace('3', '4') + ".png"))
                .doesNotThrowAnyException();
        assertThatCode(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, "avatars/7/" + UUID_PART.replace('3', '5') + ".webp"))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsKeysThatAreNotTheUsersOwnForThePurpose() {
        storage.put(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG);
        storage.put("avatars/8/" + UUID_PART + ".jpg", "image/jpeg", FakeImageStorage.JPEG);
        storage.put("posts/7/" + UUID_PART + ".jpg", "image/jpeg", FakeImageStorage.JPEG);

        for (String key : List.of(
                "avatars/8/" + UUID_PART + ".jpg", // 他人の画像
                "posts/7/" + UUID_PART + ".jpg", // 用途が違う
                "avatars/7/../8/" + UUID_PART + ".jpg", // 別の場所を指す
                "avatars/7/not-a-uuid.jpg",
                "avatars/7/" + UUID_PART + ".gif",
                "avatars/70/" + UUID_PART + ".jpg",
                "x/avatars/7/" + UUID_PART + ".jpg",
                "",
                "   ")) {
            assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, key), ImageService.INVALID_KEY_MESSAGE);
        }
        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, null), ImageService.INVALID_KEY_MESSAGE);
        // 他人の画像は、確認のときに消さない
        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void rejectsAKeyThatWasNeverUploaded() {
        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY), ImageService.NOT_UPLOADED_MESSAGE);
    }

    @Test
    void rejectsEmptyAndOversizedObjects() {
        storage.putWithSize(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG, 0);
        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY), ImageService.EMPTY_MESSAGE);

        storage.putWithSize(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG, ImageService.MAX_BYTES + 1);
        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY), ImageService.TOO_LARGE_MESSAGE);
        // 大きすぎる画像は、S3 に残さない
        assertThat(storage.contains(AVATAR_KEY)).isFalse();
    }

    @Test
    void acceptsAnObjectOfExactlyFiveMegabytes() {
        storage.putWithSize(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG, ImageService.MAX_BYTES);

        assertThatCode(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY)).doesNotThrowAnyException();
    }

    @Test
    void rejectsAFileWhoseContentIsNotAnImageEvenIfTheNameAndTypeSaySo() {
        storage.put(AVATAR_KEY, "image/jpeg", FakeImageStorage.TEXT);

        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY), ImageService.INVALID_TYPE_MESSAGE);
        // 中身が画像ではないものは、S3 に残さない
        assertThat(storage.contains(AVATAR_KEY)).isFalse();
        assertThat(storage.deleted()).containsExactly(AVATAR_KEY);
    }

    @Test
    void rejectsAFileWhoseStoredTypeDiffersFromTheExtension() {
        storage.put(AVATAR_KEY, "image/png", FakeImageStorage.JPEG);

        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, AVATAR_KEY), ImageService.INVALID_TYPE_MESSAGE);
    }

    @Test
    void rejectsAPngNamedFileWhoseContentIsJpeg() {
        String key = "avatars/7/" + UUID_PART + ".png";
        storage.put(key, "image/png", FakeImageStorage.JPEG);

        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, key), ImageService.INVALID_TYPE_MESSAGE);
    }

    @Test
    void rejectsATruncatedWebpHeader() {
        String key = "avatars/7/" + UUID_PART + ".webp";
        storage.put(key, "image/webp", new byte[] {'R', 'I', 'F', 'F', 0, 0, 0, 0});

        assertBadRequest(() -> service.requireUploaded(USER, ImagePurpose.AVATAR, key), ImageService.INVALID_TYPE_MESSAGE);
    }

    // ---- 表示用の署名付き URL ----

    @Test
    void returnsNullWhenThereIsNoKey() {
        assertThat(service.urlFor(null)).isNull();
        assertThat(service.urlFor("")).isNull();
        assertThat(service.urlFor("   ")).isNull();
        assertThat(storage.presignGetCalls()).isZero();
    }

    @Test
    void reusesTheSameUrlForHalfOfTheExpirationSoTheBrowserCanCacheIt() {
        String first = service.urlFor(AVATAR_KEY);
        clock.advance(Duration.ofMinutes(29));
        String second = service.urlFor(AVATAR_KEY);

        assertThat(second).isEqualTo(first);
        assertThat(storage.presignGetCalls()).isEqualTo(1);
    }

    @Test
    void issuesANewUrlOnceHalfOfTheExpirationHasPassed() {
        String first = service.urlFor(AVATAR_KEY);
        clock.advance(Duration.ofMinutes(30));
        String second = service.urlFor(AVATAR_KEY);

        assertThat(second).isNotEqualTo(first);
        assertThat(storage.presignGetCalls()).isEqualTo(2);
    }

    @Test
    void keepsUrlsPerKey() {
        String other = "avatars/7/" + UUID_PART.replace('3', '6') + ".png";

        assertThat(service.urlFor(AVATAR_KEY)).contains(AVATAR_KEY);
        assertThat(service.urlFor(other)).contains(other);
        assertThat(storage.presignGetCalls()).isEqualTo(2);
    }

    @Test
    void degradesToNullInsteadOfFailingWhenAUrlCannotBeMade() {
        storage.failPresignGet(true);

        assertThat(service.urlFor(AVATAR_KEY)).isNull();
    }

    // ---- 削除 ----

    @Test
    void deletesImmediatelyWhenThereIsNoTransaction() {
        storage.put(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG);

        service.deleteAfterCommit(AVATAR_KEY);

        assertThat(storage.deleted()).containsExactly(AVATAR_KEY);
    }

    @Test
    void deletesOnlyAfterTheTransactionCommits() {
        storage.put(AVATAR_KEY, "image/jpeg", FakeImageStorage.JPEG);
        TransactionSynchronizationManager.initSynchronization();

        service.deleteAfterCommit(AVATAR_KEY);
        assertThat(storage.deleted()).isEmpty();

        // コミットされなければ(ロールバック)、消さない
        TransactionSynchronizationManager.getSynchronizations()
                .forEach(sync -> sync.afterCompletion(TransactionSynchronization.STATUS_ROLLED_BACK));
        assertThat(storage.deleted()).isEmpty();

        TransactionSynchronizationManager.getSynchronizations().forEach(TransactionSynchronization::afterCommit);
        assertThat(storage.deleted()).containsExactly(AVATAR_KEY);
    }

    @Test
    void aFailedDeleteDoesNotThrow() {
        storage.failDeletes(true);

        assertThatCode(() -> service.deleteAfterCommit(AVATAR_KEY)).doesNotThrowAnyException();
    }

    @Test
    void ignoresAMissingKeyWhenDeleting() {
        service.deleteAfterCommit(null);
        service.deleteAfterCommit(" ");

        assertThat(storage.deleted()).isEmpty();
    }

    @Test
    void forgetsTheCachedUrlOfADeletedImage() {
        service.urlFor(AVATAR_KEY);
        service.deleteAfterCommit(AVATAR_KEY);
        service.urlFor(AVATAR_KEY);

        assertThat(storage.presignGetCalls()).isEqualTo(2);
    }
}
