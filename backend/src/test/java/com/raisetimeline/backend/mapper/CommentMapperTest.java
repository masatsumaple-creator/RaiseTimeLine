package com.raisetimeline.backend.mapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.entity.Comment;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@MapperTest
class CommentMapperTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Autowired
    CommentMapper mapper;

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

    private Comment newComment(long postId, long userId, String body) {
        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setBody(body);
        return comment;
    }

    @Test
    void insertはIDを採番し_findByIdは著者の情報を結合して返す() {
        Comment comment = newComment(post, bob, "いいね");

        mapper.insert(comment);

        Comment found = mapper.findById(comment.getId());
        assertThat(found.getBody()).isEqualTo("いいね");
        assertThat(found.getPostId()).isEqualTo(post);
        assertThat(found.getUserId()).isEqualTo(bob);
        assertThat(found.getAuthorHandle()).isEqualTo("bob");
        assertThat(found.getCreatedAt()).isNotNull();
    }

    @Test
    void insertは存在しない投稿なら外部キー違反() {
        assertThatThrownBy(() -> mapper.insert(newComment(-1L, bob, "x")))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void findByIdは無ければnull() {
        assertThat(mapper.findById(-1L)).isNull();
    }

    @Test
    void deleteは本人のコメントだけ削除する() {
        long id = data.comment(post, bob, "c", T0);

        assertThat(mapper.delete(id, alice)).isZero();
        assertThat(mapper.findById(id)).isNotNull();

        assertThat(mapper.delete(id, bob)).isEqualTo(1);
        assertThat(mapper.findById(id)).isNull();
    }

    @Test
    void findPageは古い順に返す() {
        long c2 = data.comment(post, bob, "2", T0.plusMinutes(1));
        long c1 = data.comment(post, bob, "1", T0);
        long c3 = data.comment(post, alice, "3", T0.plusMinutes(2));

        List<Comment> page = mapper.findPage(post, null, null, 10);

        assertThat(page).extracting(Comment::getId).containsExactly(c1, c2, c3);
    }

    @Test
    void findPageは別の投稿のコメントを含めない() {
        long other = data.post(alice, "別の投稿");
        long mine = data.comment(post, bob, "こっち", T0);
        data.comment(other, bob, "あっち", T0);

        List<Comment> page = mapper.findPage(post, null, null, 10);

        assertThat(page).extracting(Comment::getId).containsExactly(mine);
    }

    @Test
    void findPageはカーソルより新しいコメントだけを返す() {
        long c1 = data.comment(post, bob, "1", T0);
        long c2 = data.comment(post, bob, "2", T0.plusMinutes(1));
        long c3 = data.comment(post, bob, "3", T0.plusMinutes(2));

        List<Comment> page = mapper.findPage(post, T0, c1, 10);

        assertThat(page).extracting(Comment::getId).containsExactly(c2, c3);
    }

    @Test
    void findPageのカーソルは作成日時が同じコメントをidで区別する() {
        long c1 = data.comment(post, bob, "1", T0);
        long c2 = data.comment(post, bob, "2", T0);
        long c3 = data.comment(post, bob, "3", T0);

        List<Comment> page = mapper.findPage(post, T0, c1, 10);

        assertThat(page).extracting(Comment::getId).containsExactly(c2, c3);
    }

    @Test
    void findPageはlimitで件数を絞る() {
        long c1 = data.comment(post, bob, "1", T0);
        data.comment(post, bob, "2", T0.plusMinutes(1));

        assertThat(mapper.findPage(post, null, null, 1)).extracting(Comment::getId).containsExactly(c1);
    }

    @Test
    void countByPostIdは投稿のコメント数を返す() {
        data.comment(post, bob, "1", T0);
        data.comment(post, alice, "2", T0);
        long other = data.post(alice, "別");
        data.comment(other, bob, "3", T0);

        assertThat(mapper.countByPostId(post)).isEqualTo(2);
        assertThat(mapper.countByPostId(-1L)).isZero();
    }

    @Test
    void countByPostIdsは投稿ごとの件数を返し_0件の投稿は含めない() {
        long other = data.post(alice, "別");
        long empty = data.post(alice, "コメントなし");
        data.comment(post, bob, "1", T0);
        data.comment(post, alice, "2", T0);
        data.comment(other, bob, "3", T0);

        List<PostCount> counts = mapper.countByPostIds(List.of(post, other, empty));

        assertThat(counts).containsExactlyInAnyOrder(new PostCount(post, 2), new PostCount(other, 1));
    }
}
