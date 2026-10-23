package com.raisetimeline.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class PagingTest {

    private record Row(Long id, OffsetDateTime createdAt) {
    }

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-10-23T10:00:00Z");

    private static List<Row> rows(int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(i -> new Row((long) i, T0.plusSeconds(i)))
                .toList();
    }

    // ---- size ----

    @Test
    void sizeDefaultsWhenNotSpecified() {
        assertThat(Paging.size(null)).isEqualTo(Paging.DEFAULT_LIMIT).isEqualTo(20);
    }

    @Test
    void sizeKeepsValuesInRange() {
        assertThat(Paging.size(1)).isEqualTo(1);
        assertThat(Paging.size(30)).isEqualTo(30);
        assertThat(Paging.size(50)).isEqualTo(50);
    }

    @Test
    void sizeClampsOutOfRangeValues() {
        assertThat(Paging.size(0)).isEqualTo(1);
        assertThat(Paging.size(-5)).isEqualTo(1);
        assertThat(Paging.size(51)).isEqualTo(Paging.MAX_LIMIT);
        assertThat(Paging.size(Integer.MAX_VALUE)).isEqualTo(50);
    }

    // ---- slice ----

    @Test
    void sliceReturnsEverythingWithoutCursorWhenRowsFitInOnePage() {
        Paging.Page<Row> page = Paging.slice(rows(3), 5, Row::createdAt, Row::id);

        assertThat(page.items()).hasSize(3);
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void sliceReturnsNoCursorWhenRowsExactlyFillThePage() {
        // size 件ちょうどなら、余りの 1 件が無いので続きは無い
        Paging.Page<Row> page = Paging.slice(rows(5), 5, Row::createdAt, Row::id);

        assertThat(page.items()).hasSize(5);
        assertThat(page.nextCursor()).isNull();
    }

    @Test
    void sliceDropsTheExtraRowAndPointsTheCursorAtTheLastShownRow() {
        // size + 1 件取れたら、続きがある。表示は size 件で、カーソルは表示する最後の行から作る
        Paging.Page<Row> page = Paging.slice(rows(6), 5, Row::createdAt, Row::id);

        assertThat(page.items()).hasSize(5);
        assertThat(page.items().get(4).id()).isEqualTo(5L);
        Cursor cursor = Cursor.decodeOrNull(page.nextCursor());
        assertThat(cursor).isNotNull();
        assertThat(cursor.id()).isEqualTo(5L);
        assertThat(cursor.createdAt()).isEqualTo(T0.plusSeconds(5));
    }

    @Test
    void sliceHandlesEmptyRows() {
        Paging.Page<Row> page = Paging.slice(List.of(), 20, Row::createdAt, Row::id);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextCursor()).isNull();
    }
}
