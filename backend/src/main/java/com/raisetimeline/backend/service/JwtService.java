package com.raisetimeline.backend.service;

import com.raisetimeline.backend.config.JwtConfig;
import com.raisetimeline.backend.config.JwtProperties;
import java.time.Instant;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    public record IssuedToken(String value, long expiresInSeconds) {
    }

    private final JwtEncoder jwtEncoder;
    private final JwtProperties properties;

    public JwtService(JwtEncoder jwtEncoder, JwtProperties properties) {
        this.jwtEncoder = jwtEncoder;
        this.properties = properties;
    }

    /** subject にユーザーIDを入れたアクセストークンを発行する。失効はできないため有効期間は短くする。 */
    public IssuedToken issue(Long userId) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(JwtConfig.ISSUER)
                .subject(String.valueOf(userId))
                .issuedAt(now)
                .expiresAt(now.plus(properties.expiration()))
                .build();
        String value = jwtEncoder
                .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new IssuedToken(value, properties.expiration().toSeconds());
    }
}
