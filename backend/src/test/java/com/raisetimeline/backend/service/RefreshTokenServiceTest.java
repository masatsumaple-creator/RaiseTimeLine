package com.raisetimeline.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.config.RefreshTokenProperties;
import com.raisetimeline.backend.entity.RefreshToken;
import com.raisetimeline.backend.mapper.RefreshTokenMapper;
import com.raisetimeline.backend.service.RefreshTokenService.IssuedRefreshToken;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class RefreshTokenServiceTest {

    private static final Duration EXPIRATION = Duration.ofDays(7);
    private static final Duration GRACE = Duration.ofSeconds(10);

    @Mock
    RefreshTokenMapper mapper;

    RefreshTokenService service;

    @BeforeEach
    void setUp() {
        service = new RefreshTokenService(mapper, new RefreshTokenProperties(EXPIRATION, false, GRACE));
    }

    private RefreshToken stored(String familyId, OffsetDateTime usedAt, OffsetDateTime revokedAt) {
        RefreshToken token = new RefreshToken();
        token.setUserId(7L);
        token.setFamilyId(familyId);
        token.setUsedAt(usedAt);
        token.setRevokedAt(revokedAt);
        return token;
    }

    private RefreshToken inserted() {
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(mapper).insert(captor.capture());
        return captor.getValue();
    }

    @Test
    void issueは新しい系統で保存し_生のトークンではなくハッシュだけを保存する() {
        IssuedRefreshToken issued = service.issue(7L);

        RefreshToken saved = inserted();
        assertThat(issued.userId()).isEqualTo(7L);
        assertThat(saved.getUserId()).isEqualTo(7L);
        assertThat(saved.getTokenHash()).isEqualTo(RefreshTokenService.hash(issued.value()));
        assertThat(saved.getTokenHash()).matches("[0-9a-f]{64}").isNotEqualTo(issued.value());
        assertThat(saved.getFamilyId()).isNotBlank();
    }

    @Test
    void issueの有効期限は設定した期間後() {
        OffsetDateTime before = OffsetDateTime.now();

        service.issue(7L);

        assertThat(inserted().getExpiresAt())
                .isBetween(before.plus(EXPIRATION), OffsetDateTime.now().plus(EXPIRATION));
    }

    @Test
    void issueは呼ぶたびに別のトークンと別の系統になる() {
        IssuedRefreshToken first = service.issue(7L);
        IssuedRefreshToken second = service.issue(7L);

        assertThat(first.value()).isNotEqualTo(second.value());
        ArgumentCaptor<RefreshToken> captor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(mapper, org.mockito.Mockito.times(2)).insert(captor.capture());
        assertThat(captor.getAllValues().get(0).getFamilyId()).isNotEqualTo(captor.getAllValues().get(1).getFamilyId());
    }

    @Test
    void hashは同じ入力なら同じ値で_SHA256の16進64桁() {
        assertThat(RefreshTokenService.hash("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    @Test
    void rotateは未知のトークンなら空を返し_何も書き込まない() {
        when(mapper.findByHash(RefreshTokenService.hash("unknown"))).thenReturn(null);

        assertThat(service.rotate("unknown")).isEmpty();

        verify(mapper, never()).insert(any());
        verify(mapper, never()).revokeFamily(any());
    }

    @Test
    void rotateは有効なトークンを使用済みにして_同じ系統の新しいトークンを発行する() {
        String hash = RefreshTokenService.hash("raw");
        when(mapper.findByHash(hash)).thenReturn(stored("family-1", null, null));
        when(mapper.markUsedIfActive(hash)).thenReturn(1);

        Optional<IssuedRefreshToken> rotated = service.rotate("raw");

        assertThat(rotated).isPresent();
        assertThat(rotated.get().userId()).isEqualTo(7L);
        assertThat(rotated.get().value()).isNotEqualTo("raw");
        RefreshToken saved = inserted();
        assertThat(saved.getFamilyId()).isEqualTo("family-1");
        assertThat(saved.getUserId()).isEqualTo(7L);
        assertThat(saved.getTokenHash()).isEqualTo(RefreshTokenService.hash(rotated.get().value()));
        verify(mapper, never()).revokeFamily(any());
    }

    @Test
    void rotateは使用済みを猶予時間を過ぎて再提示されたら_盗用とみなして系統ごと失効させる() {
        String hash = RefreshTokenService.hash("raw");
        RefreshToken used = stored("family-1", OffsetDateTime.now().minus(GRACE).minusSeconds(5), null);
        when(mapper.findByHash(hash)).thenReturn(used);
        when(mapper.markUsedIfActive(hash)).thenReturn(0);

        assertThat(service.rotate("raw")).isEmpty();

        verify(mapper).revokeFamily("family-1");
        verify(mapper, never()).insert(any());
    }

    @Test
    void rotateは使用済みでも猶予時間内の再提示なら_失効させず空を返す() {
        String hash = RefreshTokenService.hash("raw");
        RefreshToken used = stored("family-1", OffsetDateTime.now().minusSeconds(1), null);
        when(mapper.findByHash(hash)).thenReturn(used);
        when(mapper.markUsedIfActive(hash)).thenReturn(0);

        assertThat(service.rotate("raw")).isEmpty();

        verify(mapper, never()).revokeFamily(any());
        verify(mapper, never()).insert(any());
    }

    @Test
    void rotateは失効済みのトークンなら_空を返し再度の失効もしない() {
        String hash = RefreshTokenService.hash("raw");
        RefreshToken revoked = stored("family-1", OffsetDateTime.now().minusDays(1), OffsetDateTime.now().minusHours(1));
        when(mapper.findByHash(hash)).thenReturn(revoked);
        when(mapper.markUsedIfActive(hash)).thenReturn(0);

        assertThat(service.rotate("raw")).isEmpty();

        verify(mapper, never()).revokeFamily(any());
    }

    @Test
    void rotateは期限切れで未使用のトークンなら_空を返し失効もしない() {
        String hash = RefreshTokenService.hash("raw");
        when(mapper.findByHash(hash)).thenReturn(stored("family-1", null, null));
        when(mapper.markUsedIfActive(hash)).thenReturn(0);

        assertThat(service.rotate("raw")).isEmpty();

        verify(mapper, never()).revokeFamily(any());
        verify(mapper, never()).insert(any());
    }

    @Test
    void revokeFamilyOfは提示されたトークンの系統を失効させる() {
        when(mapper.findByHash(RefreshTokenService.hash("raw"))).thenReturn(stored("family-1", null, null));

        service.revokeFamilyOf("raw");

        verify(mapper).revokeFamily("family-1");
    }

    @Test
    void revokeFamilyOfは未知のトークンなら何もしない() {
        when(mapper.findByHash(RefreshTokenService.hash("unknown"))).thenReturn(null);

        service.revokeFamilyOf("unknown");

        verify(mapper, never()).revokeFamily(any());
    }
}
