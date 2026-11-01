package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.RefreshToken;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;

@MapperTest
class RefreshTokenMapperTest {

    @Autowired
    RefreshTokenMapper mapper;

    @Autowired
    MapperTestData data;

    long userId;

    @BeforeEach
    void setUp() {
        userId = data.user("alice");
    }

    private RefreshToken token(String hash, String familyId, OffsetDateTime expiresAt) {
        RefreshToken token = new RefreshToken();
        token.setUserId(userId);
        token.setFamilyId(familyId);
        token.setTokenHash(hash);
        token.setExpiresAt(expiresAt);
        mapper.insert(token);
        return token;
    }

    private RefreshToken validToken(String hash, String familyId) {
        return token(hash, familyId, OffsetDateTime.now().plusDays(7));
    }

    @Test
    void insertしたトークンをハッシュで取得でき_使用済みと失効済みは未設定() {
        RefreshToken saved = validToken("hash-1", "family-1");

        RefreshToken found = mapper.findByHash("hash-1");

        assertThat(saved.getId()).isNotNull();
        assertThat(found.getUserId()).isEqualTo(userId);
        assertThat(found.getFamilyId()).isEqualTo("family-1");
        assertThat(found.getUsedAt()).isNull();
        assertThat(found.getRevokedAt()).isNull();
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Test
    void findByHashは無ければnull() {
        assertThat(mapper.findByHash("unknown")).isNull();
    }

    @Test
    void 同じハッシュは一意制約で登録できない() {
        validToken("hash-1", "family-1");

        assertThatThrownBy(() -> validToken("hash-1", "family-2")).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void markUsedIfActiveは有効なトークンを使用済みにして1を返す() {
        validToken("hash-1", "family-1");

        assertThat(mapper.markUsedIfActive("hash-1")).isEqualTo(1);
        assertThat(mapper.findByHash("hash-1").getUsedAt()).isNotNull();
    }

    @Test
    void markUsedIfActiveは2回目は0を返す_同時リクエストの片方だけが成功する() {
        validToken("hash-1", "family-1");

        assertThat(mapper.markUsedIfActive("hash-1")).isEqualTo(1);
        assertThat(mapper.markUsedIfActive("hash-1")).isZero();
    }

    @Test
    void markUsedIfActiveは期限切れなら0を返す() {
        token("hash-1", "family-1", OffsetDateTime.now().minusSeconds(1));

        assertThat(mapper.markUsedIfActive("hash-1")).isZero();
        assertThat(mapper.findByHash("hash-1").getUsedAt()).isNull();
    }

    @Test
    void markUsedIfActiveは失効済みなら0を返す() {
        validToken("hash-1", "family-1");
        mapper.revokeFamily("family-1");

        assertThat(mapper.markUsedIfActive("hash-1")).isZero();
    }

    @Test
    void markUsedIfActiveは存在しないハッシュなら0を返す() {
        assertThat(mapper.markUsedIfActive("unknown")).isZero();
    }

    @Test
    void revokeFamilyは同じ系統のトークンをすべて失効させ_他の系統は変えない() {
        validToken("hash-1", "family-1");
        validToken("hash-2", "family-1");
        validToken("hash-3", "family-2");

        int revoked = mapper.revokeFamily("family-1");

        assertThat(revoked).isEqualTo(2);
        assertThat(mapper.findByHash("hash-1").getRevokedAt()).isNotNull();
        assertThat(mapper.findByHash("hash-2").getRevokedAt()).isNotNull();
        assertThat(mapper.findByHash("hash-3").getRevokedAt()).isNull();
    }

    @Test
    void revokeFamilyは失効済みの行を再度更新しない() {
        validToken("hash-1", "family-1");
        mapper.revokeFamily("family-1");
        OffsetDateTime firstRevokedAt = mapper.findByHash("hash-1").getRevokedAt();

        assertThat(mapper.revokeFamily("family-1")).isZero();
        assertThat(mapper.findByHash("hash-1").getRevokedAt()).isEqualTo(firstRevokedAt);
    }

    @Test
    void ユーザーを削除するとトークンも連動して消える() {
        validToken("hash-1", "family-1");

        data.jdbc.update("DELETE FROM users WHERE id = ?", userId);

        assertThat(data.count("refresh_tokens")).isZero();
    }
}
