package com.raisetimeline.backend.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * プロフィールの更新(表示名と自己紹介)。ハンドルとメールアドレスは変更できない。
 * アイコン画像は、avatarKey に新しい画像のキーを渡すと設定、removeAvatar を true にすると削除。どちらも無ければ変更なし。
 */
public record UpdateProfileRequest(
        @NotBlank(message = "表示名は 1〜50 文字で入力してください")
        @MaxCodePoints(value = 50, message = "表示名は 1〜50 文字で入力してください")
        String displayName,

        @MaxCodePoints(value = 160, message = "自己紹介は 160 文字以内で入力してください")
        String bio,

        /** 新しいアイコンのキー(S3 へアップロードした画像)。無ければ(null)アイコンは変えない。 */
        String avatarKey,

        /** true ならアイコンを削除する(未設定に戻す)。avatarKey とは同時に指定できない。無ければ(null)削除しない。 */
        Boolean removeAvatar
) {

    /** 前後の空白を取り除く。自己紹介は、空なら「未設定」(null)として扱う。途中の改行は保持する。 */
    public UpdateProfileRequest {
        displayName = displayName == null ? null : displayName.strip();
        bio = bio == null || bio.isBlank() ? null : bio.strip();
    }

    /** アイコンを削除するか(removeAvatar が true のときだけ)。 */
    public boolean removesAvatar() {
        return Boolean.TRUE.equals(removeAvatar);
    }
}
