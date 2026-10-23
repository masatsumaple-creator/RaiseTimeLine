package com.raisetimeline.backend.dto;

import java.util.List;

/** nextCursor が null なら最後のページ。 */
public record UserListResponse(List<UserSummaryResponse> items, String nextCursor) {
}
