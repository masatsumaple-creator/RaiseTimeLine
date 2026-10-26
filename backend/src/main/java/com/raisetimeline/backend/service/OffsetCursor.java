package com.raisetimeline.backend.service;

import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.springframework.http.HttpStatus;

/**
 * 「何件目から」を表すカーソル(ユーザー検索用)。並び順が時刻ではないので、(作成日時, id) のカーソルは使えない。
 * クライアントには不透明な文字列として渡す。
 */
final class OffsetCursor {

    private static final String PREFIX = "offset:";
    private static final String INVALID_CURSOR_MESSAGE = "カーソルが正しくありません";

    private OffsetCursor() {
    }

    static String encode(int offset) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((PREFIX + offset).getBytes(StandardCharsets.UTF_8));
    }

    /** 空なら先頭からを表す 0 を返す。形式が不正、または負の値なら 400。 */
    static int decode(String value) {
        if (value == null || value.isBlank()) {
            return 0;
        }
        try {
            String raw = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
            if (!raw.startsWith(PREFIX)) {
                throw new IllegalArgumentException(raw);
            }
            int offset = Integer.parseInt(raw.substring(PREFIX.length()));
            if (offset < 0) {
                throw new IllegalArgumentException(raw);
            }
            return offset;
        } catch (IllegalArgumentException e) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, INVALID_CURSOR_MESSAGE);
        }
    }
}
