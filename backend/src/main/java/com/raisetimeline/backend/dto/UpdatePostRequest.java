package com.raisetimeline.backend.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdatePostRequest(
        @NotBlank(message = "本文を入力してください")
        @MaxCodePoints(value = PostRequests.MAX_BODY_LENGTH, message = "280 文字以内で入力してください")
        String body
) {

    public UpdatePostRequest {
        body = body == null ? null : body.strip();
    }
}
