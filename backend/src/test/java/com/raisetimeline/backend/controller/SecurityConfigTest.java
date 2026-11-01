package com.raisetimeline.backend.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.raisetimeline.backend.config.JwtConfig;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.service.AuthService;
import com.raisetimeline.backend.service.ImageService;
import com.raisetimeline.backend.service.JwtService;
import com.raisetimeline.backend.service.PostService;
import com.raisetimeline.backend.service.RefreshTokenService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/** 本物の SecurityConfig / JwtConfig を使って、認証・認可の振る舞いを確かめる(トークンはモックにしない)。 */
@WebMvcTest({PostController.class, AuthController.class})
@ControllerTest
class SecurityConfigTest {

    @Autowired
    MockMvc mockMvc;

    @Autowired
    JwtEncoder jwtEncoder;

    @MockitoBean
    PostService postService;

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

    private String token(JwtEncoder encoder, String issuer, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject("5")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }

    private String validToken() {
        Instant now = Instant.now();
        return token(jwtEncoder, JwtConfig.ISSUER, now, now.plusSeconds(60));
    }

    @Test
    void 有効なトークンならAPIを呼べて_トークンのsubjectがユーザーIDになる() throws Exception {
        when(postService.timeline(5L, "following", null, null)).thenReturn(new TimelineResponse(List.of(), null));

        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Bearer " + validToken()))
                .andExpect(status().isOk());
    }

    @Test
    void トークンが無ければ401で_JSONのエラーを返す() throws Exception {
        mockMvc.perform(get("/api/timeline"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string(HttpHeaders.CONTENT_TYPE, org.hamcrest.Matchers.containsString(MediaType.APPLICATION_JSON_VALUE)))
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"))
                .andExpect(jsonPath("$.message").isNotEmpty());

        verifyNoInteractions(postService);
    }

    @Test
    void でたらめなトークンは401() throws Exception {
        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        verifyNoInteractions(postService);
    }

    @Test
    void Bearer以外の認証方式は401() throws Exception {
        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Basic YWxpY2U6cGFzcw=="))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 期限切れのトークンは401で_期限ちょうどの猶予も付けない() throws Exception {
        Instant now = Instant.now();
        String expired = token(jwtEncoder, JwtConfig.ISSUER, now.minusSeconds(120), now.minusSeconds(1));

        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Bearer " + expired))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        verifyNoInteractions(postService);
    }

    @Test
    void 発行者が違うトークンは401() throws Exception {
        Instant now = Instant.now();
        String foreign = token(jwtEncoder, "someone-else", now, now.plusSeconds(60));

        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Bearer " + foreign))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 別の鍵で署名されたトークンは401() throws Exception {
        JwtEncoder otherKeyEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(
                "another-secret-another-secret-another!".getBytes(StandardCharsets.UTF_8), "HmacSHA256")));
        Instant now = Instant.now();
        String forged = token(otherKeyEncoder, JwtConfig.ISSUER, now, now.plusSeconds(60));

        mockMvc.perform(get("/api/timeline").header(HttpHeaders.AUTHORIZATION, "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void 定義されていないパスも認証が先に効き_ログインしていなければ404ではなく401() throws Exception {
        mockMvc.perform(get("/api/unknown-endpoint")).andExpect(status().isUnauthorized());
    }

    @Test
    void サインアップとログインはトークン無しで到達できる() throws Exception {
        // 認証で弾かれず Controller まで届く(空の本文は入力検証で 400)
        mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void リフレッシュとログアウトはアクセストークン無しで到達できる() throws Exception {
        mockMvc.perform(post("/api/auth/refresh")).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
        mockMvc.perform(post("/api/auth/logout")).andExpect(status().isNoContent());
    }

    @Test
    void APIドキュメントのパスは認証が不要で_springdoc無しのこのテストでは404になる() throws Exception {
        mockMvc.perform(get("/api/v3/api-docs")).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/swagger-ui.html")).andExpect(status().isNotFound());
    }

    @Test
    void セッションを作らず_CSRFトークン無しのPOSTも認証だけで通る() throws Exception {
        when(postService.create(any(), any())).thenReturn(null);

        mockMvc.perform(post("/api/posts")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + validToken())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"x\"}"))
                .andExpect(status().isCreated())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }
}
