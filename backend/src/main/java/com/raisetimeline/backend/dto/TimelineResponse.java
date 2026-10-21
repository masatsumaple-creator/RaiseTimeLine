package com.raisetimeline.backend.dto;

import java.util.List;

/** nextCursor が null なら最後のページ。 */
public record TimelineResponse(List<PostResponse> items, String nextCursor) {
}
