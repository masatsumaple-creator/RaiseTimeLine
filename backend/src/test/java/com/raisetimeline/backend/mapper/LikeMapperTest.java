package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@MapperTest
class LikeMapperTest {

    @Autowired
    LikeMapper mapper;

    @Autowired
    MapperTestData data;

    long alice;
    long bob;
    long post;

    @BeforeEach
    void setUp() {
        alice = data.user("alice");
        bob = data.user("bob");
        post = data.post(alice, "投稿");
    }

    @Test
    void insertIgnoreはいいねを1件追加する() {
        mapper.insertIgnore(bob, post);

        assertThat(mapper.countByPostId(post)).isEqualTo(1);
    }

    @Test
    void insertIgnoreは同じいいねを重ねても1件のまま_エラーにもならない() {
        mapper.insertIgnore(bob, post);
        mapper.insertIgnore(bob, post);

        assertThat(mapper.countByPostId(post)).isEqualTo(1);
    }

    @Test
    void insertIgnoreは存在しない投稿なら外部キー違反() {
        assertThatThrownBy(() -> mapper.insertIgnore(bob, -1L))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void deleteはいいねを取り消し_していなくてもエラーにならない() {
        mapper.insertIgnore(bob, post);

        mapper.delete(bob, post);
        mapper.delete(bob, post);

        assertThat(mapper.countByPostId(post)).isZero();
    }

    @Test
    void deleteは他のユーザーのいいねを消さない() {
        mapper.insertIgnore(alice, post);
        mapper.insertIgnore(bob, post);

        mapper.delete(bob, post);

        assertThat(mapper.countByPostId(post)).isEqualTo(1);
        assertThat(mapper.findLikedPostIds(alice, List.of(post))).containsExactly(post);
    }

    @Test
    void countByPostIdsは投稿ごとのいいね数を返し_0件の投稿は含めない() {
        long other = data.post(alice, "別");
        long none = data.post(alice, "いいねなし");
        mapper.insertIgnore(alice, post);
        mapper.insertIgnore(bob, post);
        mapper.insertIgnore(bob, other);

        List<PostCount> counts = mapper.countByPostIds(List.of(post, other, none));

        assertThat(counts).containsExactlyInAnyOrder(new PostCount(post, 2), new PostCount(other, 1));
    }

    @Test
    void findLikedPostIdsは指定ユーザーがいいね済みの投稿IDだけを返す() {
        long other = data.post(alice, "別");
        long notLiked = data.post(alice, "未いいね");
        mapper.insertIgnore(bob, post);
        mapper.insertIgnore(bob, other);
        mapper.insertIgnore(alice, notLiked);

        List<Long> liked = mapper.findLikedPostIds(bob, List.of(post, other, notLiked));

        assertThat(liked).containsExactlyInAnyOrder(post, other);
    }
}
