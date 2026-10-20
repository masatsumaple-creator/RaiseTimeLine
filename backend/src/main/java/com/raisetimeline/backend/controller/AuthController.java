package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.dto.AuthResponse;
import com.raisetimeline.backend.dto.LoginRequest;
import com.raisetimeline.backend.dto.SignupRequest;
import com.raisetimeline.backend.dto.UserResponse;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.AppUserDetails;
import com.raisetimeline.backend.service.AuthService;
import com.raisetimeline.backend.service.JwtService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String LOGIN_FAILED = "LOGIN_FAILED";
    private static final String LOGIN_FAILED_MESSAGE = "メールアドレスまたはパスワードが正しくありません";

    private final AuthService authService;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthController(
            AuthService authService, JwtService jwtService, AuthenticationManager authenticationManager) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest body) {
        // 登録直後はそのままログイン状態(トークン発行済み)にする
        User user = authService.signup(body);
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.of(jwtService.issue(user.getId()), user));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest body) {
        Authentication authentication = authenticate(body.email(), body.password());
        User user = authService.findById(((AppUserDetails) authentication.getPrincipal()).getId());
        return AuthResponse.of(jwtService.issue(user.getId()), user);
    }

    /** トークンはサーバー側で失効できないため、ログアウトはクライアントがトークンを破棄する。 */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        User user = authService.findById(Long.valueOf(jwt.getSubject()));
        if (user == null) {
            // トークンは有効だがユーザーが削除済みの場合
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "ログインが必要です");
        }
        return UserResponse.from(user);
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
