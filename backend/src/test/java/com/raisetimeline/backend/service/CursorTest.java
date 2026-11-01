package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

class CursorTest {

    private static final OffsetDateTime AT = OffsetDateTime.parse("2026-01-02T03:04:05.123456+09:00");

    @Test
    void encodeしたカーソルはdecodeで元の作成日時とidに戻る() {
        String encoded = Cursor.encode(AT, 42L);

        Cursor decoded = Cursor.decodeOrNull(encoded);

        assertThat(decoded.createdAt()).isEqualTo(AT);
        assertThat(decoded.id()).isEqualTo(42L);
    }

    @Test
    void カーソルはURLに載せられる文字だけでできている() {
        assertThat(Cursor.encode(AT, 1L)).matches("[A-Za-z0-9_-]+");
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "  "})
    void 空のカーソルは先頭からを表すnull(String value) {
        assertThat(Cursor.decodeOrNull(value)).isNull();
    }

    @Test
    void nullのカーソルは先頭からを表すnull() {
        assertThat(Cursor.decodeOrNull(null)).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "!!!not-base64!!!",
            // Base64 としては読めるが、中身が「日時,id」の形になっていない
            "bm9jb21tYQ",
    })
    void 形式が不正なカーソルは400(String value) {
        assertApiError(() -> Cursor.decodeOrNull(value), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void 日時が読めないカーソルは400() {
        assertApiError(() -> Cursor.decodeOrNull(raw("not-a-date,1")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void idが数値でないカーソルは400() {
        assertApiError(() -> Cursor.decodeOrNull(raw(AT + ",abc")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    private static String raw(String value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
}
