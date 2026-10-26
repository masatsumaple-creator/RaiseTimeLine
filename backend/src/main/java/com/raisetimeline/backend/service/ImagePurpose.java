package com.raisetimeline.backend.service;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Locale;

/** 画像の用途。S3 のキーの先頭(avatars/ か posts/)が、用途ごとに分かれる。 */
public enum ImagePurpose {

    AVATAR("avatars"),
    POST("posts");

    private final String prefix;

    ImagePurpose(String prefix) {
        this.prefix = prefix;
    }

    /** キーの先頭の部分(スラッシュなし)。 */
    public String prefix() {
        return prefix;
    }

    /** API では小文字(avatar / post)で受け渡す。知らない値は 400 になる。 */
    @JsonValue
    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }

    @JsonCreator
    public static ImagePurpose fromWire(String value) {
        for (ImagePurpose purpose : values()) {
            if (purpose.wireName().equals(value)) {
                return purpose;
            }
        }
        throw new IllegalArgumentException("unknown purpose: " + value);
    }
}
