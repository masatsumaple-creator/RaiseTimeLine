package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.AppUserDetails;
import com.raisetimeline.backend.service.AuthService;
import com.raisetimeline.backend.service.ImageService;
import com.raisetimeline.backend.service.JwtService;
import com.raisetimeline.backend.service.RefreshTokenService;
import com.raisetimeline.backend.service.RefreshTokenService.IssuedRefreshToken;
import jakarta.servlet.http.Cookie;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@ControllerTest
class AuthControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    AuthService authService;

    @MockitoBean
    JwtService jwtService;

    @MockitoBean
    RefreshTokenService refreshTokenService;

    @MockitoBean
    ImageService imageService;

    @MockitoBean
    AuthenticationManager authenticationManager;

    private static final String SIGNUP_JSON = """
            {"email":"a@example.com","password":"password1","handle":"alice","displayName":"Alice"}
            """;

    private User alice;

    @BeforeEach
    void setUp() {
        alice = new User();
        alice.setId(5L);
        alice.setEmail("a@example.com");
        alice.setHandle("alice");
        alice.setDisplayName("Alice");
        when(jwtService.issue(5L)).thenReturn(new JwtService.IssuedToken("jwt-token", 900));
    }

    // ---- signup ----

    @Test
    void signupは201でアクセストークンを返し_リフレッシュトークンをCookieに入れる() throws Exception {
        when(authService.signup(any())).thenReturn(alice);
        when(refreshTokenService.issue(5L)).thenReturn(new IssuedRefreshToken("refresh-1", 5L));

        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(SIGNUP_JSON))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").value("jwt-token"))
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andExpect(jsonPath("$.user.handle").value("alice"))
                .andExpect(jsonPath("$.user.id").value(5))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, allOf(
                        containsString("refresh_token=refresh-1"),
                        containsString("HttpOnly"),
                        containsString("Path=/api/auth"),
                        containsString("SameSite=Strict"))));
    }

    @Test
    void signupはレスポンスにパスワードやメールを含めない() throws Exception {
        when(authService.signup(any())).thenReturn(alice);
        when(refreshTokenService.issue(5L)).thenReturn(new IssuedRefreshToken("refresh-1", 5L));

        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(SIGNUP_JSON))
                .andExpect(jsonPath("$.user.email").doesNotExist())
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist());
    }

    @Test
    void signupはログインしていなくても呼べる() throws Exception {
        when(authService.signup(any())).thenReturn(alice);
        when(refreshTokenService.issue(5L)).thenReturn(new IssuedRefreshToken("refresh-1", 5L));

        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(SIGNUP_JSON))
                .andExpect(status().isCreated());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            // メールの形式
            "{\"email\":\"not-an-email\",\"password\":\"password1\",\"handle\":\"alice\",\"displayName\":\"A\"}",
            "{\"email\":\"\",\"password\":\"password1\",\"handle\":\"alice\",\"displayName\":\"A\"}",
            // パスワード: 短い・数字なし・英字なし
            "{\"email\":\"a@example.com\",\"password\":\"abc123\",\"handle\":\"alice\",\"displayName\":\"A\"}",
            "{\"email\":\"a@example.com\",\"password\":\"abcdefghij\",\"handle\":\"alice\",\"displayName\":\"A\"}",
            "{\"email\":\"a@example.com\",\"password\":\"1234567890\",\"handle\":\"alice\",\"displayName\":\"A\"}",
            // ハンドル: 短い・記号・長すぎる
            "{\"email\":\"a@example.com\",\"password\":\"password1\",\"handle\":\"ab\",\"displayName\":\"A\"}",
            "{\"email\":\"a@example.com\",\"password\":\"password1\",\"handle\":\"al-ice\",\"displayName\":\"A\"}",
            "{\"email\":\"a@example.com\",\"password\":\"password1\",\"handle\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"displayName\":\"A\"}",
            // 表示名: 空白だけ
            "{\"email\":\"a@example.com\",\"password\":\"password1\",\"handle\":\"alice\",\"displayName\":\"   \"}",
            // 項目の欠落
            "{}",
    })
    void signupは入力が不正なら400で_Serviceを呼ばない(String json) throws Exception {
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors").isNotEmpty());

        verifyNoInteractions(authService, refreshTokenService);
    }

    @Test
    void signupはメールの項目エラーをemailに入れて返す() throws Exception {
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"bad\",\"password\":\"password1\",\"handle\":\"alice\",\"displayName\":\"A\"}"))
                .andExpect(jsonPath("$.fieldErrors.email").exists())
                .andExpect(jsonPath("$.fieldErrors.password").doesNotExist());
    }

    @Test
    void signupは登録済みなら409を返し_Cookieは発行しない() throws Exception {
        when(authService.signup(any()))
                .thenThrow(new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS", "登録済み"));

        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(SIGNUP_JSON))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        verify(refreshTokenService, never()).issue(any());
    }

    // ---- login ----

    @Test
    void loginは認証に成功したらトークンとCookieを返す() throws Exception {
        when(authenticationManager.authenticate(any()))
                .thenReturn(UsernamePasswordAuthenticationToken.authenticated(new AppUserDetails(alice), null, java.util.List.of()));
        when(authService.findById(5L)).thenReturn(alice);
        when(refreshTokenService.issue(5L)).thenReturn(new IssuedRefreshToken("refresh-2", 5L));

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a@example.com\",\"password\":\"password1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("jwt-token"))
                .andExpect(jsonPath("$.user.handle").value("alice"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("refresh_token=refresh-2")));
    }

    @Test
    void loginは認証に失敗したら_理由を伏せて401のLOGIN_FAILED() throws Exception {
        when(authenticationManager.authenticate(any())).thenThrow(new BadCredentialsException("bad"));

        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a@example.com\",\"password\":\"wrong-pass1\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("LOGIN_FAILED"))
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));

        verify(refreshTokenService, never()).issue(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"email\":\"\",\"password\":\"password1\"}",
            "{\"email\":\"a@example.com\",\"password\":\"\"}",
            "{}",
    })
    void loginは入力が空なら400で_認証を試みない(String json) throws Exception {
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(authenticationManager);
    }

    // ---- refresh ----

    @Test
    void refreshはCookieのトークンをローテーションして_新しいトークンとCookieを返す() throws Exception {
        when(refreshTokenService.rotate("old-refresh")).thenReturn(Optional.of(new IssuedRefreshToken("new-refresh", 5L)));
        when(authService.findById(5L)).thenReturn(alice);

        mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie(RefreshCookies.NAME, "old-refresh")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("jwt-token"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("refresh_token=new-refresh")));
    }

    @Test
    void refreshはCookieが無ければ401で_Cookieを消す() throws Exception {
        mockMvc.perform(post("/api/auth/refresh"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));

        verifyNoInteractions(refreshTokenService);
    }

    @Test
    void refreshはCookieが空文字でも401() throws Exception {
        mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie(RefreshCookies.NAME, "")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }

    @Test
    void refreshは無効なトークンなら401で_Cookieを消す() throws Exception {
        when(refreshTokenService.rotate("bad")).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie(RefreshCookies.NAME, "bad")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"))
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));
    }

    @Test
    void refreshはトークンが有効でもユーザーが削除済みなら401() throws Exception {
        when(refreshTokenService.rotate("old")).thenReturn(Optional.of(new IssuedRefreshToken("new", 5L)));
        when(authService.findById(5L)).thenReturn(null);

        mockMvc.perform(post("/api/auth/refresh").cookie(new Cookie(RefreshCookies.NAME, "old")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }

    // ---- logout ----

    @Test
    void logoutはCookieのトークンの系統を失効させ_204でCookieを消す() throws Exception {
        mockMvc.perform(post("/api/auth/logout").cookie(new Cookie(RefreshCookies.NAME, "refresh-1")))
                .andExpect(status().isNoContent())
                .andExpect(header().string(HttpHeaders.SET_COOKIE, containsString("Max-Age=0")));

        verify(refreshTokenService).revokeFamilyOf("refresh-1");
    }

    @Test
    void logoutはCookieが無くても204で_失効の処理は呼ばない() throws Exception {
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isNoContent());

        verifyNoInteractions(refreshTokenService);
    }

    // ---- me ----

    @Test
    void meはログイン中のユーザーを返す() throws Exception {
        when(authService.findById(5L)).thenReturn(alice);

        mockMvc.perform(get("/api/auth/me").with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(5))
                .andExpect(jsonPath("$.handle").value("alice"))
                .andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void meはユーザーが削除済みなら401() throws Exception {
        when(authService.findById(5L)).thenReturn(null);

        mockMvc.perform(get("/api/auth/me").with(loggedInAs(5)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }

    @Test
    void meはログインしていなければ401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }
}
