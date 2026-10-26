package com.raisetimeline.backend.dto;

import com.raisetimeline.backend.service.ImagePurpose;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 画像のアップロード用の署名付き URL の申し込み。
 *
 * @param purpose     用途(avatar または post)
 * @param contentType 画像の形式(image/jpeg, image/png, image/webp)
 * @param size        ファイルの大きさ(バイト)
 */
public record UploadUrlRequest(
        @NotNull(message = "画像の用途を指定してください")
        ImagePurpose purpose,

        @NotBlank(message = "JPEG、PNG、WebP の画像を選んでください")
        String contentType,

        @NotNull(message = "画像の大きさを指定してください")
        Long size
) {
}
