package com.raisetimeline.backend.dto;

import java.util.List;

public record CommentPageResponse(
        List<CommentResponse> items,
        /** null なら最後のページ。 */
        String nextCursor
) {
}
