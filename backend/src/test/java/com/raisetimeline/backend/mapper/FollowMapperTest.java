package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.FollowEntry;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@MapperTest
class FollowMapperTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Autowired
    FollowMapper mapper;

    @Autowired
    MapperTestData data;

    long alice;
    long bob;
    long carol;

    @BeforeEach
    void setUp() {
        alice = data.user("alice");
        bob = data.user("bob");
        carol = data.user("carol");
    }

    @Test
    void insertIgnoreでフォローでき_existsとカウントに反映される() {
        mapper.insertIgnore(alice, bob);

        assertThat(mapper.exists(alice, bob)).isTrue();
        assertThat(mapper.countFollowing(alice)).isEqualTo(1);
        assertThat(mapper.countFollowers(bob)).isEqualTo(1);
    }

    @Test
    void フォローは一方向で_逆向きにはならない() {
        mapper.insertIgnore(alice, bob);

        assertThat(mapper.exists(bob, alice)).isFalse();
        assertThat(mapper.countFollowing(bob)).isZero();
        assertThat(mapper.countFollowers(alice)).isZero();
    }

    @Test
    void insertIgnoreは二重フォローでもエラーにならず1件のまま() {
        mapper.insertIgnore(alice, bob);
        mapper.insertIgnore(alice, bob);

        assertThat(mapper.countFollowers(bob)).isEqualTo(1);
    }

    @Test
    void insertIgnoreは存在しないユーザーなら外部キー違反() {
        assertThatThrownBy(() -> mapper.insertIgnore(alice, -1L))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void 自分自身のフォローはCHECK制約で弾かれる() {
        assertThatThrownBy(() -> mapper.insertIgnore(alice, alice))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deleteはフォローを解除し_していなくてもエラーにならない() {
        mapper.insertIgnore(alice, bob);

        mapper.delete(alice, bob);
        mapper.delete(alice, bob);

        assertThat(mapper.exists(alice, bob)).isFalse();
    }

    @Test
    void countFollowingとcountFollowersは人数を数える() {
        mapper.insertIgnore(alice, bob);
        mapper.insertIgnore(alice, carol);
        mapper.insertIgnore(carol, bob);

        assertThat(mapper.countFollowing(alice)).isEqualTo(2);
        assertThat(mapper.countFollowers(bob)).isEqualTo(2);
        assertThat(mapper.countFollowers(alice)).isZero();
    }

    @Test
    void findFollowingはフォローした新しい順に返す() {
        data.follow(alice, bob, T0);
        data.follow(alice, carol, T0.plusMinutes(1));

        List<FollowEntry> list = mapper.findFollowing(alice, null, null, 10);

        assertThat(list).extracting(FollowEntry::getHandle).containsExactly("carol", "bob");
        assertThat(list.get(0).getFollowedAt()).isEqualTo(T0.plusMinutes(1));
    }

    @Test
    void findFollowersはフォローされた新しい順に返す() {
        data.follow(bob, alice, T0);
        data.follow(carol, alice, T0.plusMinutes(1));

        List<FollowEntry> list = mapper.findFollowers(alice, null, null, 10);

        assertThat(list).extracting(FollowEntry::getHandle).containsExactly("carol", "bob");
    }

    @Test
    void findFollowingはカーソルより古いフォローだけを返す() {
        data.follow(alice, bob, T0);
        data.follow(alice, carol, T0.plusMinutes(1));

        List<FollowEntry> list = mapper.findFollowing(alice, T0.plusMinutes(1), carol, 10);

        assertThat(list).extracting(FollowEntry::getHandle).containsExactly("bob");
    }

    @Test
    void findFollowersはカーソルより古いフォローだけを返す() {
        data.follow(bob, alice, T0);
        data.follow(carol, alice, T0.plusMinutes(1));

        List<FollowEntry> list = mapper.findFollowers(alice, T0.plusMinutes(1), carol, 10);

        assertThat(list).extracting(FollowEntry::getHandle).containsExactly("bob");
    }

    @Test
    void findFollowingは時刻が同じならユーザーIDの降順で_limitで絞れる() {
        data.follow(alice, bob, T0);
        data.follow(alice, carol, T0);

        List<FollowEntry> list = mapper.findFollowing(alice, null, null, 1);

        assertThat(list).extracting(FollowEntry::getHandle).containsExactly("carol");
    }

    @Test
    void findFollowedIdsは指定ユーザーのうちフォロー済みのIDだけを返す() {
        long dave = data.user("dave");
        mapper.insertIgnore(alice, bob);
        mapper.insertIgnore(alice, dave);
        mapper.insertIgnore(carol, dave);

        List<Long> ids = mapper.findFollowedIds(alice, List.of(bob, carol, dave));

        assertThat(ids).containsExactlyInAnyOrder(bob, dave);
    }
}
