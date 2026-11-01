package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.User;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DuplicateKeyException;

@MapperTest
class UserMapperTest {

    @Autowired
    UserMapper mapper;

    @Autowired
    MapperTestData data;

    private User newUser(String email, String handle) {
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash("hash");
        user.setHandle(handle);
        user.setDisplayName("名前");
        return user;
    }

    @Test
    void insertはIDを採番して返し_登録日時はDBが入れる() {
        User user = newUser("a@example.com", "alice");

        mapper.insert(user);

        assertThat(user.getId()).isNotNull();
        User found = mapper.findById(user.getId());
        assertThat(found.getEmail()).isEqualTo("a@example.com");
        assertThat(found.getHandle()).isEqualTo("alice");
        assertThat(found.getDisplayName()).isEqualTo("名前");
        assertThat(found.getBio()).isNull();
        assertThat(found.getAvatarKey()).isNull();
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Test
    void 大文字小文字だけ違うメールは一意制約で弾かれ_制約名がメッセージに含まれる() {
        mapper.insert(newUser("a@example.com", "alice"));

        assertThatThrownBy(() -> mapper.insert(newUser("A@Example.com", "bob")))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("uq_users_email_lower");
    }

    @Test
    void 大文字小文字だけ違うハンドルは一意制約で弾かれる() {
        mapper.insert(newUser("a@example.com", "alice"));

        assertThatThrownBy(() -> mapper.insert(newUser("b@example.com", "ALICE")))
                .isInstanceOf(DuplicateKeyException.class)
                .hasMessageContaining("uq_users_handle_lower");
    }

    @Test
    void existsByEmailは大文字小文字を区別しない() {
        data.user("a@example.com", "alice", "Alice");

        assertThat(mapper.existsByEmail("A@EXAMPLE.COM")).isTrue();
        assertThat(mapper.existsByEmail("other@example.com")).isFalse();
    }

    @Test
    void existsByHandleは大文字小文字を区別しない() {
        data.user("alice");

        assertThat(mapper.existsByHandle("ALICE")).isTrue();
        assertThat(mapper.existsByHandle("bob")).isFalse();
    }

    @Test
    void findByEmailは大文字小文字を区別せず_無ければnull() {
        long id = data.user("a@example.com", "alice", "Alice");

        assertThat(mapper.findByEmail("A@Example.COM").getId()).isEqualTo(id);
        assertThat(mapper.findByEmail("none@example.com")).isNull();
    }

    @Test
    void findByHandleは大文字小文字を区別せず_無ければnull() {
        long id = data.user("alice");

        assertThat(mapper.findByHandle("Alice").getId()).isEqualTo(id);
        assertThat(mapper.findByHandle("nobody")).isNull();
    }

    @Test
    void findByIdは無ければnull() {
        assertThat(mapper.findById(-1L)).isNull();
    }

    @Test
    void updateProfileはアイコン変更なしなら_表示名と自己紹介だけを書き換える() {
        long id = data.user("alice");
        mapper.updateProfile(id, "旧", "旧bio", true, "avatars/1/a.png");

        int updated = mapper.updateProfile(id, "新しい名前", "新bio", false, "ignored");

        assertThat(updated).isEqualTo(1);
        User found = mapper.findById(id);
        assertThat(found.getDisplayName()).isEqualTo("新しい名前");
        assertThat(found.getBio()).isEqualTo("新bio");
        assertThat(found.getAvatarKey()).isEqualTo("avatars/1/a.png");
    }

    @Test
    void updateProfileはアイコン変更ありなら_新しいキーに置き換える() {
        long id = data.user("alice");

        mapper.updateProfile(id, "名前", null, true, "avatars/1/b.png");

        assertThat(mapper.findById(id).getAvatarKey()).isEqualTo("avatars/1/b.png");
    }

    @Test
    void updateProfileはアイコン変更ありでキーがnullなら_アイコンを削除し_bioのnullは未設定にする() {
        long id = data.user("alice");
        mapper.updateProfile(id, "名前", "bio", true, "avatars/1/a.png");

        mapper.updateProfile(id, "名前", null, true, null);

        User found = mapper.findById(id);
        assertThat(found.getAvatarKey()).isNull();
        assertThat(found.getBio()).isNull();
    }

    @Test
    void updateProfileは存在しないユーザーなら0件() {
        assertThat(mapper.updateProfile(-1L, "名前", null, false, null)).isZero();
    }

    @Test
    void searchはハンドルと表示名の部分一致で_大文字小文字を区別しない() {
        data.user("a@example.com", "alice", "山田");
        data.user("b@example.com", "bob", "Alice好き");
        data.user("c@example.com", "carol", "キャロル");

        List<User> result = mapper.search("%ALICE%", "ALICE%", 10, 0);

        assertThat(result).extracting(User::getHandle).containsExactlyInAnyOrder("alice", "bob");
    }

    @Test
    void searchは先頭一致を上に_その中ではハンドルの昇順で返す() {
        data.user("a@example.com", "zed", "Taro");
        data.user("b@example.com", "mytaro", "別人");
        data.user("c@example.com", "taro2", "別人");
        data.user("d@example.com", "alpha", "Taro先生");

        List<User> result = mapper.search("%taro%", "taro%", 10, 0);

        // 先頭一致: alpha(表示名 Taro先生)・taro2・zed(表示名 Taro) をハンドル昇順、そのあとに部分一致の mytaro
        assertThat(result).extracting(User::getHandle).containsExactly("alpha", "taro2", "zed", "mytaro");
    }

    @Test
    void searchはメールと自己紹介を検索対象にしない() {
        long id = data.user("secret@example.com", "alice", "Alice");
        mapper.updateProfile(id, "Alice", "secretな自己紹介", false, null);

        assertThat(mapper.search("%secret%", "secret%", 10, 0)).isEmpty();
    }

    @Test
    void searchはエスケープ済みのパターンなら_パーセントやアンダースコアを文字として探す() {
        data.user("a@example.com", "a_b", "x");
        data.user("b@example.com", "axb", "x");
        data.user("c@example.com", "100pct", "100%");

        assertThat(mapper.search("%a\\_b%", "a\\_b%", 10, 0)).extracting(User::getHandle).containsExactly("a_b");
        assertThat(mapper.search("%100\\%%", "100\\%%", 10, 0)).extracting(User::getHandle).containsExactly("100pct");
    }

    @Test
    void searchはlimitとoffsetでページを切り出す() {
        data.user("a@example.com", "user1", "x");
        data.user("b@example.com", "user2", "x");
        data.user("c@example.com", "user3", "x");

        assertThat(mapper.search("%user%", "user%", 2, 0)).extracting(User::getHandle).containsExactly("user1", "user2");
        assertThat(mapper.search("%user%", "user%", 2, 2)).extracting(User::getHandle).containsExactly("user3");
    }

    @Test
    void searchは一覧に必要な列だけを返し_パスワードハッシュとメールは含めない() {
        data.user("a@example.com", "alice", "Alice");

        User found = mapper.search("%alice%", "alice%", 10, 0).get(0);

        assertThat(found.getPasswordHash()).isNull();
        assertThat(found.getEmail()).isNull();
    }
}
