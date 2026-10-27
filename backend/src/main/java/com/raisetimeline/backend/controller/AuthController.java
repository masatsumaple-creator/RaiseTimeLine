package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.AuthResponse;
import com.raisetimeline.backend.dto.ErrorResponse;
import com.raisetimeline.backend.dto.LoginRequest;
import com.raisetimeline.backend.dto.SignupRequest;
import com.raisetimeline.backend.dto.UserResponse;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.AppUserDetails;
import com.raisetimeline.backend.service.AuthService;
import com.raisetimeline.backend.service.ImageService;
import com.raisetimeline.backend.service.JwtService;
import com.raisetimeline.backend.service.RefreshTokenService;
import com.raisetimeline.backend.service.RefreshTokenService.IssuedRefreshToken;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.Optional;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "認証", description = "サインアップ・ログイン・トークン更新")
public class AuthController {

    private static final String LOGIN_FAILED = "LOGIN_FAILED";
    private static final String LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";
    private static final String INVALID_REFRESH_TOKEN = "INVALID_REFRESH_TOKEN";
    private static final String INVALID_REFRESH_TOKEN_MESSAGE = "ログインの有効期限が切れました。もう一度ログインしてください";

    private final AuthService authService;
    private final JwtService jwtService;
    private final RefreshTokenService refreshTokenService;
    private final RefreshCookies refreshCookies;
    private final AuthenticationManager authenticationManager;
    private final ImageService imageService;

    public AuthController(
            AuthService authService,
            JwtService jwtService,
            RefreshTokenService refreshTokenService,
            RefreshCookies refreshCookies,
            AuthenticationManager authenticationManager,
            ImageService imageService) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.refreshTokenService = refreshTokenService;
        this.refreshCookies = refreshCookies;
        this.authenticationManager = authenticationManager;
        this.imageService = imageService;
    }

    @Operation(summary = "サインアップ", description = "登録と同時にログイン状態にする。リフレッシュトークンは Cookie で返す。")
    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest body) {
        // 登録直後はそのままログイン状態(トークン発行済み)にする
        User user = authService.signup(body);
        return authenticated(HttpStatus.CREATED, user, refreshTokenService.issue(user.getId()));
    }

    @Operation(summary = "ログイン", description = "アクセストークンを返し、リフレッシュトークンを Cookie に設定する。")
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest body) {
        Authentication authentication = authenticate(body.email(), body.password());
        User user = authService.findById(((AppUserDetails) authentication.getPrincipal()).getId());
        return authenticated(HttpStatus.OK, user, refreshTokenService.issue(user.getId()));
    }

    /** Cookie のリフレッシュトークンで、新しいアクセストークンを発行する(リフレッシュトークンもローテーションする)。 */
    @Operation(summary = "アクセストークンの更新", description = "Cookie のリフレッシュトークンで新しいアクセストークンを発行する。リフレッシュトークンもローテーションする。")
    @ApiResponse(responseCode = "200", description = "更新成功",
            content = @Content(schema = @Schema(implementation = AuthResponse.class)))
    @ApiResponse(responseCode = "401", description = "リフレッシュトークンが無効・期限切れ",
            content = @Content(schema = @Schema(implementation = ErrorResponse.class)))
    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken) {
        Optional<IssuedRefreshToken> rotated = (refreshToken == null || refreshToken.isBlank())
                ? Optional.empty()
                : refreshTokenService.rotate(refreshToken);
        User user = rotated.map(token -> authService.findById(token.userId())).orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString())
                    .body(new ErrorResponse(INVALID_REFRESH_TOKEN, INVALID_REFRESH_TOKEN_MESSAGE));
        }
        return authenticated(HttpStatus.OK, user, rotated.get());
    }

    /**
     * リフレッシュトークンの系統を失効させ、Cookie を消す。アクセストークンが期限切れでも実行できるよう認証は不要。
     * 発行済みのアクセストークンは、有効期限が切れるまで使える。
     */
    @Operation(summary = "ログアウト", description = "リフレッシュトークンを失効させ、Cookie を消す。")
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@CookieValue(name = RefreshCookies.NAME, required = false) String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            refreshTokenService.revokeFamilyOf(refreshToken);
        }
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, refreshCookies.clear().toString())
                .build();
    }

    @Operation(summary = "ログイン中のユーザーを取得")
    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        User user = authService.findById(Long.valueOf(jwt.getSubject()));
        if (user == null) {
            // トークンは有効だがユーザーが削除済みの場合
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "ログインが必要です");
        }
        return UserResponse.from(user, imageService::urlFor);
    }

    private ResponseEntity<AuthResponse> authenticated(HttpStatus status, User user, IssuedRefreshToken refreshToken) {
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, refreshCookies.issue(refreshToken.value()).toString())
                .body(AuthResponse.of(jwtService.issue(user.getId()), user, imageService::urlFor));
    }

    private Authentication authenticate(String email, String password) {
        try {
            return authenticationManager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, password));
        } catch (AuthenticationException e) {
            // メールの存在有無を悟らせないため、失敗理由に関わらず同一の応答にする
            throw new ApiException(HttpStatus.UNAUTHORIZED, LOGIN_FAILED, LOGIN_FAILED_MESSAGE);
        }
    }
}
