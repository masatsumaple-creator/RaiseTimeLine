package com.raisetimeline.backend.dto;

/** 投稿の編集は、本文だけ(画像は変えられない)。画像のある投稿は、本文を空にしてもよい(サービスで確かめる)。 */
public record UpdatePostRequest(
        @MaxCodePoints(value = PostRequests.MAX_BODY_LENGTH, message = "280 文字以内で入力してください")
        String body
) {

    public UpdatePostRequest {
        body = body == null ? "" : body.strip();
    }
}
