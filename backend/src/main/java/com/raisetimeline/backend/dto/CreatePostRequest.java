package com.raisetimeline.backend.dto;

import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 投稿の作成。本文か画像のどちらかは必要(どちらも空は 400)。
 *
 * @param body      本文(280 文字まで。画像があれば空でもよい)
 * @param imageKeys S3 へアップロード済みの画像のキー(0〜4 件、並びが表示順)
 */
public record CreatePostRequest(
        @MaxCodePoints(value = PostRequests.MAX_BODY_LENGTH, message = "280 文字以内で入力してください")
        String body,

        @Size(max = PostRequests.MAX_IMAGES, message = "画像は 4 枚までです")
        List<String> imageKeys
) {

    public CreatePostRequest {
        body = body == null ? "" : body.strip();
        imageKeys = imageKeys == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(imageKeys));
    }
}
