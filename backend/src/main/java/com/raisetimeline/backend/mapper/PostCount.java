package com.raisetimeline.backend.mapper;

/** 投稿 ID ごとの件数(いいね数・コメント数の一括集計の結果)。件数が 0 の投稿は集計結果に含まれない。 */
public record PostCount(Long postId, long count) {
}
