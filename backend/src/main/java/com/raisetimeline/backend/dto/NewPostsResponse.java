package com.raisetimeline.backend.dto;

import java.util.List;

/**
 * 基準の投稿より新しい投稿。上限を超える場合は新しい側 {@code MAX} 件だけを返し、hasMore を true にする
 * (このとき items と手元の一覧の間に欠落があるため、クライアントは一覧を取り直す)。
 */
public record NewPostsResponse(int count, boolean hasMore, List<PostResponse> items) {
}
