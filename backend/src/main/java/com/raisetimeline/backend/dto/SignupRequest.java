package com.raisetimeline.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SignupRequest(
        @NotBlank(message = "メールアドレスの形式が正しくありません")
        @Size(max = 255, message = "メールアドレスの形式が正しくありません")
        @Pattern(regexp = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", message = "メールアドレスの形式が正しくありません")
        String email,

        @NotBlank(message = "パスワードは 8〜64 文字で、英字と数字を含めてください")
        @Size(min = 8, max = 64, message = "パスワードは 8〜64 文字で、英字と数字を含めてください")
        @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*[0-9]).*$", message = "パスワードは 8〜64 文字で、英字と数字を含めてください")
        String password,

        @NotBlank(message = "ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください")
        @Pattern(regexp = "^[A-Za-z0-9_]{3,30}$", message = "ユーザーハンドルは半角英数字と _ の 3〜30 文字で入力してください")
        String handle,

        @NotBlank(message = "表示名は 1〜50 文字で入力してください")
        @Size(max = 50, message = "表示名は 1〜50 文字で入力してください")
        String displayName
) {

    public SignupRequest {
        displayName = displayName == null ? null : displayName.strip();
    }
}
