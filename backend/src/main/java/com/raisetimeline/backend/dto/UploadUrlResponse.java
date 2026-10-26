package com.raisetimeline.backend.dto;

/**
 * @param uploadUrl 画像を PUT する署名付き URL。申し込んだ contentType と size の組み合わせだけが通る
 * @param imageKey  アップロードした画像のキー。プロフィールの更新(avatarKey)や投稿の作成で、この値を渡す
 * @param expiresIn uploadUrl が使える残りの秒数
 */
public record UploadUrlResponse(String uploadUrl, String imageKey, long expiresIn) {
}
