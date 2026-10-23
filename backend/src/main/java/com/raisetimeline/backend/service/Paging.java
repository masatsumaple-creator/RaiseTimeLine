package com.raisetimeline.backend.service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.function.Function;

/**
 * カーソル方式の一覧に共通する処理。件数の決め方と、「1 件多く取得して次ページの有無を判定する」流れをまとめる。
 * 使い方: size(limit) で件数を決め、size + 1 件を取得して slice に渡す。
 */
final class Paging {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    private Paging() {
    }

    /** 1 ページの件数。指定が無ければ既定値、範囲外なら 1〜最大の範囲に収める。 */
    static int size(Integer limit) {
        return limit == null ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
    }

    /**
     * size + 1 件まで取得した rows を、表示する size 件と nextCursor に分ける。
     * 余る 1 件があれば続きがあるので、表示する最後の行の (作成日時, id) から nextCursor を作る。無ければ null。
     */
    static <T> Page<T> slice(
            List<T> rows, int size, Function<T, OffsetDateTime> createdAt, Function<T, Long> id) {
        boolean hasNext = rows.size() > size;
        List<T> items = hasNext ? rows.subList(0, size) : rows;
        String nextCursor = null;
        if (hasNext) {
            T last = items.get(items.size() - 1);
            nextCursor = Cursor.encode(createdAt.apply(last), id.apply(last));
        }
        return new Page<>(items, nextCursor);
    }

    record Page<T>(List<T> items, String nextCursor) {
    }
}
