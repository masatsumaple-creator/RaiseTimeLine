package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.dto.CommentCountResponse;
import com.raisetimeline.backend.dto.CommentCreatedResponse;
import com.raisetimeline.backend.dto.CommentPageResponse;
import com.raisetimeline.backend.dto.CreateCommentRequest;
import com.raisetimeline.backend.entity.Comment;
import com.raisetimeline.backend.entity.Post;
import com.raisetimeline.backend.mapper.CommentMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class CommentServiceTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Mock
    CommentMapper commentMapper;

    @Mock
    PostMapper postMapper;

    @Mock
    ImageService imageService;

    @InjectMocks
    CommentService service;

    private Comment comment(long id, long postId, long userId, OffsetDateTime createdAt) {
        Comment comment = new Comment();
        comment.setId(id);
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setBody("本文" + id);
        comment.setCreatedAt(createdAt);
        comment.setAuthorHandle("user" + userId);
        comment.setAuthorDisplayName("User" + userId);
        return comment;
    }

    private void postExists(long postId) {
        when(postMapper.findById(postId)).thenReturn(new Post());
    }

    @Test
    void listは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.list(1L, 1L, null, null), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void listは次ページの有無を判定するため_指定件数より1件多く取得する() {
        postExists(1L);
        when(commentMapper.findPage(eq(1L), isNull(), isNull(), eq(3))).thenReturn(List.of());

        service.list(9L, 1L, null, 2);

        verify(commentMapper).findPage(1L, null, null, 3);
    }

    @Test
    void listは件数の指定が無ければ既定の20件で取得する() {
        postExists(1L);

        service.list(9L, 1L, null, null);

        verify(commentMapper).findPage(1L, null, null, Paging.DEFAULT_LIMIT + 1);
    }

    @Test
    void listは余りがあれば次ページのカーソルを返し_表示するのは指定件数まで() {
        postExists(1L);
        when(commentMapper.findPage(1L, null, null, 3)).thenReturn(List.of(
                comment(1, 1, 5, T0), comment(2, 1, 5, T0.plusMinutes(1)), comment(3, 1, 5, T0.plusMinutes(2))));

        CommentPageResponse page = service.list(9L, 1L, null, 2);

        assertThat(page.items()).extracting(c -> c.id()).containsExactly(1L, 2L);
        Cursor next = Cursor.decodeOrNull(page.nextCursor());
        assertThat(next.id()).isEqualTo(2L);
        assertThat(next.createdAt()).isEqualTo(T0.plusMinutes(1));
    }

    @Test
    void listは最後のページならnextCursorがnull() {
        postExists(1L);
        when(commentMapper.findPage(1L, null, null, 3)).thenReturn(List.of(comment(1, 1, 5, T0)));

        assertThat(service.list(9L, 1L, null, 2).nextCursor()).isNull();
    }

    @Test
    void listはカーソルを復号して取得の開始位置に渡す() {
        postExists(1L);
        String cursor = Cursor.encode(T0, 7L);

        service.list(9L, 1L, cursor, 2);

        verify(commentMapper).findPage(1L, T0, 7L, 3);
    }

    @Test
    void listは不正なカーソルなら400() {
        postExists(1L);

        assertApiError(() -> service.list(9L, 1L, "!!!", 2), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void listはログイン中のユーザーのコメントにだけmineを付ける() {
        postExists(1L);
        when(commentMapper.findPage(1L, null, null, 21)).thenReturn(List.of(
                comment(1, 1, 5, T0), comment(2, 1, 9, T0.plusMinutes(1))));

        CommentPageResponse page = service.list(9L, 1L, null, null);

        assertThat(page.items()).extracting(c -> c.mine()).containsExactly(false, true);
    }

    @Test
    void listは著者のアイコンキーを表示用URLに変換する() {
        postExists(1L);
        Comment withAvatar = comment(1, 1, 5, T0);
        withAvatar.setAuthorAvatarKey("avatars/5/a.png");
        when(imageService.urlFor("avatars/5/a.png")).thenReturn("https://cdn.example.com/a.png");
        when(commentMapper.findPage(1L, null, null, 21)).thenReturn(List.of(withAvatar));

        CommentPageResponse page = service.list(9L, 1L, null, null);

        assertThat(page.items().get(0).author().avatarUrl()).isEqualTo("https://cdn.example.com/a.png");
    }

    @Test
    void createは投稿が無ければ404で_保存しない() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.create(5L, 1L, new CreateCommentRequest("x")), HttpStatus.NOT_FOUND, "NOT_FOUND");

        verify(commentMapper, never()).insert(any());
    }

    @Test
    void createはコメントを保存し_作成したコメントと最新のコメント数を返す() {
        postExists(1L);
        doAnswer(invocation -> {
            invocation.<Comment>getArgument(0).setId(100L);
            return null;
        }).when(commentMapper).insert(any(Comment.class));
        when(commentMapper.findById(100L)).thenReturn(comment(100, 1, 5, T0));
        when(commentMapper.countByPostId(1L)).thenReturn(4L);

        CommentCreatedResponse created = service.create(5L, 1L, new CreateCommentRequest("こんにちは"));

        ArgumentCaptor<Comment> captor = ArgumentCaptor.forClass(Comment.class);
        verify(commentMapper).insert(captor.capture());
        assertThat(captor.getValue().getPostId()).isEqualTo(1L);
        assertThat(captor.getValue().getUserId()).isEqualTo(5L);
        assertThat(captor.getValue().getBody()).isEqualTo("こんにちは");
        assertThat(created.comment().id()).isEqualTo(100L);
        assertThat(created.comment().mine()).isTrue();
        assertThat(created.commentCount()).isEqualTo(4L);
    }

    @Test
    void createは確認と保存の間に投稿が消されたら404() {
        postExists(1L);
        doThrow(new DataIntegrityViolationException("fk")).when(commentMapper).insert(any(Comment.class));

        assertApiError(() -> service.create(5L, 1L, new CreateCommentRequest("x")), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void deleteはコメントが無ければ404() {
        when(commentMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");

        verify(commentMapper, never()).delete(any(), any());
    }

    @Test
    void deleteは他人のコメントなら403で_削除しない() {
        when(commentMapper.findById(1L)).thenReturn(comment(1, 2, 8, T0));

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.FORBIDDEN, "FORBIDDEN");

        verify(commentMapper, never()).delete(any(), any());
    }

    @Test
    void deleteは確認と削除の間に消されて0件なら404() {
        when(commentMapper.findById(1L)).thenReturn(comment(1, 2, 5, T0));
        when(commentMapper.delete(1L, 5L)).thenReturn(0);

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void deleteは本人のコメントを削除し_その投稿の残りのコメント数を返す() {
        when(commentMapper.findById(1L)).thenReturn(comment(1, 2, 5, T0));
        when(commentMapper.delete(1L, 5L)).thenReturn(1);
        when(commentMapper.countByPostId(2L)).thenReturn(3L);

        CommentCountResponse response = service.delete(5L, 1L);

        assertThat(response.commentCount()).isEqualTo(3L);
    }
}
