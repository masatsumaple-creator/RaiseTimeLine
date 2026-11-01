package com.raisetimeline.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.raisetimeline.backend.config.JwtConfig;
import com.raisetimeline.backend.config.JwtProperties;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

class JwtServiceTest {

    private static final String SECRET = "test-only-jwt-secret-0123456789-abcdefghij";

    private final SecretKey key = new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    private final JwtService service = new JwtService(
            new NimbusJwtEncoder(new ImmutableSecret<>(key)), new JwtProperties(SECRET, Duration.ofMinutes(15)));

    private Jwt decode(String token, SecretKey verifyKey) {
        return NimbusJwtDecoder.withSecretKey(verifyKey).macAlgorithm(MacAlgorithm.HS256).build().decode(token);
    }

    @Test
    void subjectにユーザーIDを入れ_発行者と有効期間を設定したトークンを発行する() {
        Instant before = Instant.now().minusSeconds(1);

        JwtService.IssuedToken issued = service.issue(42L);

        Jwt jwt = decode(issued.value(), key);
        assertThat(jwt.getSubject()).isEqualTo("42");
        assertThat(jwt.getClaimAsString("iss")).isEqualTo(JwtConfig.ISSUER);
        assertThat(jwt.getIssuedAt()).isAfterOrEqualTo(before);
        assertThat(Duration.between(jwt.getIssuedAt(), jwt.getExpiresAt())).isEqualTo(Duration.ofMinutes(15));
        assertThat(jwt.getHeaders()).containsEntry("alg", "HS256");
    }

    @Test
    void expiresInSecondsは設定した有効期間を秒で返す() {
        assertThat(service.issue(1L).expiresInSeconds()).isEqualTo(15 * 60);
    }

    @Test
    void 別の鍵では署名を検証できない() {
        String token = service.issue(1L).value();
        SecretKey other = new SecretKeySpec(
                "another-secret-another-secret-another!".getBytes(StandardCharsets.UTF_8), "HmacSHA256");

        assertThatThrownBy(() -> decode(token, other)).isInstanceOf(JwtException.class);
    }

    @Test
    void 改ざんされたトークンは検証に失敗する() {
        String token = service.issue(1L).value();
        String tampered = token.substring(0, token.length() - 2) + (token.endsWith("AA") ? "BB" : "AA");

        assertThatThrownBy(() -> decode(tampered, key)).isInstanceOf(JwtException.class);
    }

    @Test
    void ユーザーごとに別のsubjectになる() {
        assertThat(decode(service.issue(1L).value(), key).getSubject())
                .isNotEqualTo(decode(service.issue(2L).value(), key).getSubject());
    }
}
