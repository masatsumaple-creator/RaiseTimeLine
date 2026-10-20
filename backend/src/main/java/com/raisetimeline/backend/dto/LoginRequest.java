package com.raisetimeline.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
        @NotBlank(message = "メールアドレスを入力してください")
        @Size(max = 255, message = "メールアドレスの形式が正しくありません")
        String email,

        @NotBlank(message = "パスワードを入力してください")
        @Size(max = 64, message = "パスワードは 8〜64 文字で、英字と数字を含めてください")
        String password
) {
}
