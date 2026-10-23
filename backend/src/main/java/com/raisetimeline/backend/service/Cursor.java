package com.raisetimeline.backend.service;

import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import org.springframework.http.HttpStatus;

/** 次ページの開始位置(直前ページ末尾の作成日時と id)。クライアントには不透明な文字列として渡す。 */
record Cursor(OffsetDateTime createdAt, Long id) {

    private static final String INVALID_CURSOR_MESSAGE = "カーソルが正しくありません";

    static String encode(OffsetDateTime createdAt, Long id) {
        String raw = createdAt + "," + id;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
    }

    /** 空なら先頭からを表す null を返す。形式が不正なら 400。 */
    static Cursor decodeOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            int comma = raw.lastIndexOf(',');
            return new Cursor(OffsetDateTime.parse(raw.substring(0, comma)), Long.valueOf(raw.substring(comma + 1)));
        } catch (IllegalArgumentException | IndexOutOfBoundsException | DateTimeParseException e) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, INVALID_CURSOR_MESSAGE);
        }
    }
}
