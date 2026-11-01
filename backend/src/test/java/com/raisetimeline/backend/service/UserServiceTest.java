package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.UpdateProfileRequest;
import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.dto.UserResponse;
import com.raisetimeline.backend.entity.FollowEntry;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.mapper.FollowMapper;
import com.raisetimeline.backend.mapper.UserMapper;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Mock
    UserMapper userMapper;

    @Mock
    FollowMapper followMapper;

    @Mock
    ImageService imageService;

    @InjectMocks
    UserService service;

    private User user(long id, String handle) {
        User user = new User();
        user.setId(id);
        user.setHandle(handle);
        user.setDisplayName(handle.toUpperCase());
        return user;
    }

    private FollowEntry entry(long id, String handle, OffsetDateTime followedAt) {
        FollowEntry entry = new FollowEntry();
        entry.setId(id);
        entry.setHandle(handle);
        entry.setDisplayName(handle);
        entry.setFollowedAt(followedAt);
        return entry;
    }

    private UpdateProfileRequest profile(String avatarKey, Boolean removeAvatar) {
        return new UpdateProfileRequest("新しい名前", "新bio", avatarKey, removeAvatar);
    }

    // ---- requireByHandle / profile ----

    @Test
    void requireByHandleはユーザーを返し_無ければ404() {
        User alice = user(1, "alice");
        when(userMapper.findByHandle("alice")).thenReturn(alice);
        when(userMapper.findByHandle("nobody")).thenReturn(null);

        assertThat(service.requireByHandle("alice")).isSameAs(alice);
        assertApiError(() -> service.requireByHandle("nobody"), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void profileはフォロー数_フォロワー数_フォロー済み_本人かを組み立てる() {
        User alice = user(1, "alice");
        when(userMapper.findByHandle("alice")).thenReturn(alice);
        when(followMapper.countFollowing(1L)).thenReturn(2L);
        when(followMapper.countFollowers(1L)).thenReturn(3L);
        when(followMapper.exists(9L, 1L)).thenReturn(true);

        UserProfileResponse response = service.profile(9L, "alice");

        assertThat(response.followingCount()).isEqualTo(2);
        assertThat(response.followerCount()).isEqualTo(3);
        assertThat(response.followedByMe()).isTrue();
        assertThat(response.isMe()).isFalse();
    }

    @Test
    void profileは自分自身なら_isMeがtrue() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));

        assertThat(service.profile(1L, "alice").isMe()).isTrue();
    }

    // ---- updateProfile ----

    @Test
    void updateProfileはユーザーが削除済みなら401() {
        when(userMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.updateProfile(1L, profile(null, null)), HttpStatus.UNAUTHORIZED, "UNAUTHORIZED");
    }

    @Test
    void updateProfileはアイコンの設定と削除を同時に指定したら400() {
        when(userMapper.findById(1L)).thenReturn(user(1, "alice"));

        assertApiError(() -> service.updateProfile(1L, profile("k/new.png", true)),
                HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        verify(userMapper, never()).updateProfile(any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void updateProfileはアイコンの指定が無ければ_アイコンを変更しない() {
        User current = user(1, "alice");
        current.setAvatarKey("k/old.png");
        when(userMapper.findById(1L)).thenReturn(current);

        service.updateProfile(1L, profile(null, null));

        verify(userMapper).updateProfile(1L, "新しい名前", "新bio", false, "k/old.png");
        verify(imageService, never()).deleteAfterCommit(any());
        verify(imageService, never()).requireUploaded(any(), any(), any());
    }

    @Test
    void updateProfileは新しいアイコンを確認して保存し_古い画像をコミット後に削除する() {
        User current = user(1, "alice");
        current.setAvatarKey("k/old.png");
        when(userMapper.findById(1L)).thenReturn(current);

        service.updateProfile(1L, profile("k/new.png", null));

        verify(imageService).requireUploaded(1L, ImagePurpose.AVATAR, "k/new.png");
        verify(userMapper).updateProfile(1L, "新しい名前", "新bio", true, "k/new.png");
        verify(imageService).deleteAfterCommit("k/old.png");
    }

    @Test
    void updateProfileは新しいアイコンの確認に失敗したら保存しない() {
        when(userMapper.findById(1L)).thenReturn(user(1, "alice"));
        doThrow(com.raisetimeline.backend.exception.ApiException.invalid("avatarKey", "NG"))
                .when(imageService).requireUploaded(1L, ImagePurpose.AVATAR, "k/new.png");

        assertApiError(() -> service.updateProfile(1L, profile("k/new.png", null)),
                HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        verify(userMapper, never()).updateProfile(any(), any(), any(), anyBoolean(), any());
    }

    @Test
    void updateProfileは今と同じキーなら_アイコンを変更扱いにせず画像も消さない() {
        User current = user(1, "alice");
        current.setAvatarKey("k/same.png");
        when(userMapper.findById(1L)).thenReturn(current);

        service.updateProfile(1L, profile("k/same.png", null));

        verify(userMapper).updateProfile(1L, "新しい名前", "新bio", false, "k/same.png");
        verify(imageService, never()).requireUploaded(any(), any(), any());
        verify(imageService, never()).deleteAfterCommit(any());
    }

    @Test
    void updateProfileはアイコンを削除でき_古い画像をコミット後に削除する() {
        User current = user(1, "alice");
        current.setAvatarKey("k/old.png");
        when(userMapper.findById(1L)).thenReturn(current);

        service.updateProfile(1L, profile(null, true));

        verify(userMapper).updateProfile(1L, "新しい名前", "新bio", true, null);
        verify(imageService).deleteAfterCommit("k/old.png");
    }

    @Test
    void updateProfileはアイコンが元から無い人の削除指定では_何も消さない() {
        when(userMapper.findById(1L)).thenReturn(user(1, "alice"));

        service.updateProfile(1L, profile(null, true));

        verify(userMapper).updateProfile(1L, "新しい名前", "新bio", false, null);
        verify(imageService, never()).deleteAfterCommit(any());
    }

    @Test
    void updateProfileは更新後のユーザーを返す() {
        User updated = user(1, "alice");
        updated.setDisplayName("新しい名前");
        when(userMapper.findById(1L)).thenReturn(user(1, "alice"), updated);

        UserResponse response = service.updateProfile(1L, profile(null, null));

        assertThat(response.displayName()).isEqualTo("新しい名前");
    }

    // ---- follow / unfollow ----

    @Test
    void followは自分自身なら400のCANNOT_FOLLOW_SELF() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));

        assertApiError(() -> service.follow(1L, "alice"), HttpStatus.BAD_REQUEST, UserService.CANNOT_FOLLOW_SELF);

        verify(followMapper, never()).insertIgnore(any(), any());
    }

    @Test
    void followは相手がいなければ404() {
        when(userMapper.findByHandle("nobody")).thenReturn(null);

        assertApiError(() -> service.follow(1L, "nobody"), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void followはフォローして_相手の最新のフォロワー数を返す() {
        when(userMapper.findByHandle("bob")).thenReturn(user(2, "bob"));
        when(followMapper.countFollowers(2L)).thenReturn(5L);

        FollowResponse response = service.follow(1L, "bob");

        verify(followMapper).insertIgnore(1L, 2L);
        assertThat(response).isEqualTo(new FollowResponse(true, 5));
    }

    @Test
    void followは確認とフォローの間に相手が消えたら404() {
        when(userMapper.findByHandle("bob")).thenReturn(user(2, "bob"));
        doThrow(new DataIntegrityViolationException("fk")).when(followMapper).insertIgnore(1L, 2L);

        assertApiError(() -> service.follow(1L, "bob"), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void unfollowはフォローを解除して_最新のフォロワー数と未フォローを返す() {
        when(userMapper.findByHandle("bob")).thenReturn(user(2, "bob"));
        when(followMapper.countFollowers(2L)).thenReturn(4L);

        FollowResponse response = service.unfollow(1L, "bob");

        verify(followMapper).delete(1L, 2L);
        assertThat(response).isEqualTo(new FollowResponse(false, 4));
    }

    @Test
    void unfollowは相手がいなければ404() {
        when(userMapper.findByHandle("nobody")).thenReturn(null);

        assertApiError(() -> service.unfollow(1L, "nobody"), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    // ---- following / followers ----

    @Test
    void followingは対象ユーザーがフォローしている人を返し_閲覧者のフォロー済みを付ける() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));
        when(followMapper.findFollowing(1L, null, null, Paging.DEFAULT_LIMIT + 1))
                .thenReturn(List.of(entry(2, "bob", T0), entry(3, "carol", T0)));
        when(followMapper.findFollowedIds(9L, List.of(2L, 3L))).thenReturn(List.of(3L));

        UserListResponse response = service.following(9L, "alice", null, null);

        assertThat(response.items()).extracting(i -> i.handle()).containsExactly("bob", "carol");
        assertThat(response.items()).extracting(i -> i.followedByMe()).containsExactly(false, true);
        assertThat(response.nextCursor()).isNull();
    }

    @Test
    void followersは対象ユーザーをフォローしている人を返し_余りがあれば次のカーソルを返す() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));
        when(followMapper.findFollowers(1L, null, null, 3)).thenReturn(List.of(
                entry(2, "bob", T0.plusMinutes(2)), entry(3, "carol", T0.plusMinutes(1)), entry(4, "dave", T0)));

        UserListResponse response = service.followers(9L, "alice", null, 2);

        assertThat(response.items()).extracting(i -> i.handle()).containsExactly("bob", "carol");
        Cursor next = Cursor.decodeOrNull(response.nextCursor());
        assertThat(next.id()).isEqualTo(3L);
        assertThat(next.createdAt()).isEqualTo(T0.plusMinutes(1));
    }

    @Test
    void followersはカーソルを復号して開始位置に渡す() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));

        service.followers(9L, "alice", Cursor.encode(T0, 7L), 2);

        verify(followMapper).findFollowers(1L, T0, 7L, 3);
    }

    @Test
    void followingは結果が空ならフォロー済みの問い合わせをしない() {
        when(userMapper.findByHandle("alice")).thenReturn(user(1, "alice"));

        UserListResponse response = service.following(9L, "alice", null, null);

        assertThat(response.items()).isEmpty();
        verify(followMapper, never()).findFollowedIds(any(), any());
    }

    @Test
    void followingは対象ユーザーがいなければ404() {
        when(userMapper.findByHandle("nobody")).thenReturn(null);

        assertApiError(() -> service.following(9L, "nobody", null, null), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    // ---- search ----

    @ParameterizedTest
    @ValueSource(strings = {"", "   ", "@", " @ "})
    void searchは検索語が空なら400(String q) {
        assertApiError(() -> service.search(1L, q, null, null), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        verify(userMapper, never()).search(anyString(), anyString(), anyInt(), anyInt());
    }

    @Test
    void searchは検索語がnullなら400() {
        assertApiError(() -> service.search(1L, null, null, null), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void searchは51文字以上なら400で_50文字ちょうどなら検索する() {
        assertApiError(() -> service.search(1L, "a".repeat(51), null, null), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        service.search(1L, "a".repeat(50), null, null);

        verify(userMapper).search("%" + "a".repeat(50) + "%", "a".repeat(50) + "%", Paging.DEFAULT_LIMIT + 1, 0);
    }

    @Test
    void searchは文字数をコードポイントで数える() {
        // 絵文字(サロゲートペア)50個は 50 文字として扱い、通る
        String emoji50 = "😀".repeat(50);

        service.search(1L, emoji50, null, null);

        verify(userMapper).search("%" + emoji50 + "%", emoji50 + "%", Paging.DEFAULT_LIMIT + 1, 0);
    }

    @Test
    void searchは前後の空白と先頭のアットマークを取り除いて検索する() {
        service.search(1L, "  @taro  ", null, null);

        verify(userMapper).search("%taro%", "taro%", Paging.DEFAULT_LIMIT + 1, 0);
    }

    @Test
    void searchはLIKEの特殊文字をエスケープして_文字そのものとして探す() {
        service.search(1L, "100%_a\\b", null, null);

        verify(userMapper).search("%100\\%\\_a\\\\b%", "100\\%\\_a\\\\b%", Paging.DEFAULT_LIMIT + 1, 0);
    }

    @Test
    void searchは余りがあれば次のoffsetのカーソルを返し_続きをそのoffsetから取る() {
        when(userMapper.search("%a%", "a%", 3, 0))
                .thenReturn(List.of(user(1, "a1"), user(2, "a2"), user(3, "a3")));

        UserListResponse first = service.search(9L, "a", null, 2);

        assertThat(first.items()).extracting(i -> i.handle()).containsExactly("a1", "a2");
        assertThat(OffsetCursor.decode(first.nextCursor())).isEqualTo(2);

        when(userMapper.search("%a%", "a%", 3, 2)).thenReturn(List.of(user(3, "a3")));

        UserListResponse second = service.search(9L, "a", first.nextCursor(), 2);

        assertThat(second.items()).extracting(i -> i.handle()).containsExactly("a3");
        assertThat(second.nextCursor()).isNull();
    }

    @Test
    void searchは不正なカーソルなら400() {
        assertApiError(() -> service.search(1L, "a", "!!!", null), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void searchは自分自身も結果に含め_isMeとフォロー済みを付ける() {
        when(userMapper.search("%a%", "a%", Paging.DEFAULT_LIMIT + 1, 0))
                .thenReturn(List.of(user(9, "a_me"), user(2, "a2")));
        when(followMapper.findFollowedIds(9L, List.of(9L, 2L))).thenReturn(List.of(2L));

        UserListResponse response = service.search(9L, "a", null, null);

        assertThat(response.items()).extracting(i -> i.isMe()).containsExactly(true, false);
        assertThat(response.items()).extracting(i -> i.followedByMe()).containsExactly(false, true);
    }

    @Test
    void searchは結果が空ならフォロー済みの問い合わせをしない() {
        when(userMapper.search(anyString(), anyString(), anyInt(), anyInt())).thenReturn(List.of());

        assertThat(service.search(1L, "zzz", null, null).items()).isEmpty();

        verify(followMapper, never()).findFollowedIds(isNull(), any());
        verify(followMapper, never()).findFollowedIds(any(), any());
    }
}
