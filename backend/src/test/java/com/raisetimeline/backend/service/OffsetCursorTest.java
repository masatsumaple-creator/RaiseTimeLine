package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;

class OffsetCursorTest {

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 20, 12345})
    void encodeしたカーソルはdecodeで元のoffsetに戻る(int offset) {
        assertThat(OffsetCursor.decode(OffsetCursor.encode(offset))).isEqualTo(offset);
    }

    @Test
    void nullや空のカーソルは先頭からを表す0() {
        assertThat(OffsetCursor.decode(null)).isZero();
        assertThat(OffsetCursor.decode("")).isZero();
        assertThat(OffsetCursor.decode("   ")).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"!!!", "bm9wZQ", "b2Zmc2V0OmFiYw", "b2Zmc2V0Oi01"})
    void 形式が不正なカーソルは400(String value) {
        // bm9wZQ = "nope"(接頭辞なし) / b2Zmc2V0OmFiYw = "offset:abc"(数値でない) / b2Zmc2V0Oi01 = "offset:-5"(負の値)
        assertApiError(() -> OffsetCursor.decode(value), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void 時刻方式のカーソルはoffsetとして読めず400() {
        String timeCursor = Base64.getUrlEncoder().withoutPadding()
                .encodeToString("2026-01-01T00:00:00Z,1".getBytes(StandardCharsets.UTF_8));

        assertApiError(() -> OffsetCursor.decode(timeCursor), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }
}
