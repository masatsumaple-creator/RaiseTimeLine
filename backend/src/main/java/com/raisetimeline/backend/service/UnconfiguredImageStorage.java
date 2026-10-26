package com.raisetimeline.backend.service;

import com.raisetimeline.backend.exception.ApiException;
import java.time.Duration;
import java.util.Optional;
import org.springframework.http.HttpStatus;

/** バケットが未設定(S3_BUCKET が空)のときの置き場。画像の操作はすべて 503 にする。 */
public class UnconfiguredImageStorage implements ImageStorage {

    static final String CODE = "IMAGES_NOT_CONFIGURED";
    static final String MESSAGE = "画像のアップロードは現在利用できません";

    @Override
    public String presignUpload(String key, String contentType, long size, Duration expiration) {
        throw unavailable();
    }

    @Override
    public String presignGet(String key, Duration expiration) {
        throw unavailable();
    }

    @Override
    public Optional<StoredObject> head(String key) {
        throw unavailable();
    }

    @Override
    public byte[] readHead(String key, int length) {
        throw unavailable();
    }

    @Override
    public void delete(String key) {
        throw unavailable();
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, CODE, MESSAGE);
    }
}
