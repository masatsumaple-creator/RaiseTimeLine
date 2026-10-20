package com.raisetimeline.backend.service;

import com.raisetimeline.backend.config.RefreshTokenProperties;
import com.raisetimeline.backend.entity.RefreshToken;
import com.raisetimeline.backend.mapper.RefreshTokenMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RefreshTokenService {

    private static final int TOKEN_BYTES = 32;

    /** 発行したトークンの生の値(Cookie に載せる)と、その持ち主。 */
    public record IssuedRefreshToken(String value, Long userId) {
    }

    private final RefreshTokenMapper mapper;
    private final RefreshTokenProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    public RefreshTokenService(RefreshTokenMapper mapper, RefreshTokenProperties properties) {
        this.mapper = mapper;
        this.properties = properties;
    }

    /** ログイン・登録のたびに新しい系統でトークンを発行する。 */
    @Transactional
    public IssuedRefreshToken issue(Long userId) {
        return insertToken(userId, UUID.randomUUID().toString());
    }

    /**
     * 提示されたトークンを使用済みにして、同じ系統の新しいトークンを発行する(ローテーション)。
     * 無効・期限切れ・失効済み・使用済みのときは空を返す。使用済みを猶予時間を過ぎて再提示された場合は盗用を疑い、系統ごと失効させる。
     */
    @Transactional
    public Optional<IssuedRefreshToken> rotate(String rawToken) {
        String hash = hash(rawToken);
        RefreshToken token = mapper.findByHash(hash);
        if (token == null) {
            return Optional.empty();
        }
        // 同時リクエストのうち 1 つだけが更新に成功する
        if (mapper.markUsedIfActive(hash) == 1) {
            return Optional.of(insertToken(token.getUserId(), token.getFamilyId()));
        }

        RefreshToken current = mapper.findByHash(hash);
        boolean reused = current != null && current.getUsedAt() != null && current.getRevokedAt() == null;
        if (reused && current.getUsedAt().isBefore(OffsetDateTime.now().minus(properties.reuseGrace()))) {
            mapper.revokeFamily(current.getFamilyId());
        }
        return Optional.empty();
    }

    /** ログアウト: 提示されたトークンの系統を失効させる。不明なトークンは何もしない。 */
    @Transactional
    public void revokeFamilyOf(String rawToken) {
        RefreshToken token = mapper.findByHash(hash(rawToken));
        if (token != null) {
            mapper.revokeFamily(token.getFamilyId());
        }
    }

    private IssuedRefreshToken insertToken(Long userId, String familyId) {
        byte[] bytes = new byte[TOKEN_BYTES];
        secureRandom.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);

        RefreshToken token = new RefreshToken();
        token.setUserId(userId);
        token.setFamilyId(familyId);
        token.setTokenHash(hash(raw));
        token.setExpiresAt(OffsetDateTime.now().plus(properties.expiration()));
        mapper.insert(token);
        return new IssuedRefreshToken(raw, userId);
    }

    static String hash(String rawToken) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(rawToken.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
