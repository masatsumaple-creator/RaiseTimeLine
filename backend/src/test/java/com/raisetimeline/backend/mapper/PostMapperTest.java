package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.Post;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@MapperTest
class PostMapperTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Autowired
    PostMapper mapper;

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

    private Post newPost(long userId, String body) {
        Post post = new Post();
        post.setUserId(userId);
        post.setBody(body);
        return post;
    }

    @Test
    void insertはIDを採番し_findByIdは著者の情報を結合して返す() {
        Post post = newPost(alice, "こんにちは");

        mapper.insert(post);

        Post found = mapper.findById(post.getId());
        assertThat(found.getBody()).isEqualTo("こんにちは");
        assertThat(found.getUserId()).isEqualTo(alice);
        assertThat(found.getAuthorHandle()).isEqualTo("alice");
        assertThat(found.getAuthorDisplayName()).isEqualTo("alice");
        assertThat(found.getAuthorAvatarKey()).isNull();
        assertThat(found.getCreatedAt()).isNotNull();
        assertThat(found.getUpdatedAt()).isNull();
    }

    @Test
    void insertは存在しないユーザーなら外部キー違反() {
        assertThatThrownBy(() -> mapper.insert(newPost(-1L, "x")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void findByIdは無ければnull() {
        assertThat(mapper.findById(-1L)).isNull();
    }

    @Test
    void updateBodyは本人の投稿だけ更新し_更新日時を入れる() {
        long id = data.post(alice, "旧");

        int updated = mapper.updateBody(id, alice, "新");

        assertThat(updated).isEqualTo(1);
        Post found = mapper.findById(id);
        assertThat(found.getBody()).isEqualTo("新");
        assertThat(found.getUpdatedAt()).isNotNull();
    }

    @Test
    void updateBodyは他人の投稿なら0件で_本文は変わらない() {
        long id = data.post(alice, "旧");

        int updated = mapper.updateBody(id, bob, "乗っ取り");

        assertThat(updated).isZero();
        assertThat(mapper.findById(id).getBody()).isEqualTo("旧");
    }

    @Test
    void deleteは本人の投稿だけ削除する() {
        long id = data.post(alice, "x");

        assertThat(mapper.delete(id, bob)).isZero();
        assertThat(mapper.findById(id)).isNotNull();

        assertThat(mapper.delete(id, alice)).isEqualTo(1);
        assertThat(mapper.findById(id)).isNull();
    }

    @Test
    void deleteは投稿に紐づくコメントといいねも連動して消す() {
        long id = data.post(alice, "x");
        data.comment(id, bob, "c", T0);
        data.like(bob, id);

        mapper.delete(id, alice);

        assertThat(data.count("comments")).isZero();
        assertThat(data.count("likes")).isZero();
    }

    @Test
    void findPageは条件なしなら全員の投稿を新しい順に返す() {
        long p1 = data.post(alice, "1", T0);
        long p2 = data.post(bob, "2", T0.plusMinutes(1));
        long p3 = data.post(carol, "3", T0.plusMinutes(2));

        List<Post> page = mapper.findPage(null, null, null, null, 10);

        assertThat(page).extracting(Post::getId).containsExactly(p3, p2, p1);
    }

    @Test
    void findPageは作成日時が同じならidの降順で並べる() {
        long p1 = data.post(alice, "1", T0);
        long p2 = data.post(alice, "2", T0);

        List<Post> page = mapper.findPage(null, null, null, null, 10);

        assertThat(page).extracting(Post::getId).containsExactly(p2, p1);
    }

    @Test
    void findPageはauthorIdでそのユーザーの投稿だけに絞る() {
        long mine = data.post(alice, "a", T0);
        data.post(bob, "b", T0.plusMinutes(1));

        List<Post> page = mapper.findPage(alice, null, null, null, 10);

        assertThat(page).extracting(Post::getId).containsExactly(mine);
    }

    @Test
    void findPageはfollowerIdなら自分とフォロー中のユーザーの投稿だけを返す() {
        long mine = data.post(alice, "自分", T0);
        long followed = data.post(bob, "フォロー中", T0.plusMinutes(1));
        data.post(carol, "他人", T0.plusMinutes(2));
        data.follow(alice, bob);

        List<Post> page = mapper.findPage(null, alice, null, null, 10);

        assertThat(page).extracting(Post::getId).containsExactly(followed, mine);
    }

    @Test
    void findPageのフォローは一方向で_フォローされている側のフィードには出ない() {
        data.post(alice, "alice", T0);
        long bobPost = data.post(bob, "bob", T0.plusMinutes(1));
        data.follow(alice, bob);

        List<Post> page = mapper.findPage(null, bob, null, null, 10);

        assertThat(page).extracting(Post::getId).containsExactly(bobPost);
    }

    @Test
    void findPageはカーソルより古い投稿だけを返す() {
        long p1 = data.post(alice, "1", T0);
        long p2 = data.post(alice, "2", T0.plusMinutes(1));
        long p3 = data.post(alice, "3", T0.plusMinutes(2));

        List<Post> page = mapper.findPage(null, null, T0.plusMinutes(2), p3, 10);

        assertThat(page).extracting(Post::getId).containsExactly(p2, p1);
    }

    @Test
    void findPageのカーソルは作成日時が同じ投稿をidで区別する() {
        long p1 = data.post(alice, "1", T0);
        long p2 = data.post(alice, "2", T0);
        long p3 = data.post(alice, "3", T0);

        List<Post> page = mapper.findPage(null, null, T0, p3, 10);

        assertThat(page).extracting(Post::getId).containsExactly(p2, p1);
    }

    @Test
    void findPageはlimitで件数を絞る() {
        data.post(alice, "1", T0);
        data.post(alice, "2", T0.plusMinutes(1));
        long newest = data.post(alice, "3", T0.plusMinutes(2));

        List<Post> page = mapper.findPage(null, null, null, null, 1);

        assertThat(page).extracting(Post::getId).containsExactly(newest);
    }

    @Test
    void findNewerThanはsinceIdより大きいidだけを新しい順に返す() {
        long old = data.post(alice, "古い", T0);
        long p2 = data.post(alice, "2", T0.plusMinutes(1));
        long p3 = data.post(alice, "3", T0.plusMinutes(2));

        List<Post> posts = mapper.findNewerThan(null, null, old, 10);

        assertThat(posts).extracting(Post::getId).containsExactly(p3, p2);
    }

    @Test
    void findNewerThanは新着が無ければ空() {
        long latest = data.post(alice, "1", T0);

        assertThat(mapper.findNewerThan(null, null, latest, 10)).isEmpty();
    }

    @Test
    void findNewerThanはfollowerIdで自分とフォロー中に絞る() {
        long since = data.post(carol, "基準", T0);
        long mine = data.post(alice, "自分", T0.plusMinutes(1));
        long followed = data.post(bob, "フォロー中", T0.plusMinutes(2));
        data.post(carol, "他人", T0.plusMinutes(3));
        data.follow(alice, bob);

        List<Post> posts = mapper.findNewerThan(null, alice, since, 10);

        assertThat(posts).extracting(Post::getId).containsExactly(followed, mine);
    }

    @Test
    void findNewerThanはlimitで件数を絞り_新しいものを優先する() {
        long since = data.post(alice, "基準", T0);
        data.post(alice, "2", T0.plusMinutes(1));
        long p3 = data.post(alice, "3", T0.plusMinutes(2));

        List<Post> posts = mapper.findNewerThan(null, null, since, 1);

        assertThat(posts).extracting(Post::getId).containsExactly(p3);
    }
}
