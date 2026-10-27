package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.UploadUrlRequest;
import com.raisetimeline.backend.dto.UploadUrlResponse;
import com.raisetimeline.backend.service.ImageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/images")
@Tag(name = "画像")
public class ImageController {

    private final ImageService imageService;

    public ImageController(ImageService imageService) {
        this.imageService = imageService;
    }

    /** 画像のアップロード用の署名付き URL を発行する。画像のバイト列はバックエンドを通さず、ブラウザが S3 へ直接送る。 */
    @Operation(summary = "画像のアップロード用 URL を発行", description = "S3 未設定の環境では 503 を返す。")
    @PostMapping("/upload-url")
    public UploadUrlResponse uploadUrl(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UploadUrlRequest body) {
        return imageService.createUploadUrl(Long.valueOf(jwt.getSubject()), body);
    }
}
