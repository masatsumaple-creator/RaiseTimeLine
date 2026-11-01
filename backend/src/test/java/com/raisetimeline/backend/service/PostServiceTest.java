package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.dto.CreatePostRequest;
import com.raisetimeline.backend.dto.LikeResponse;
import com.raisetimeline.backend.dto.NewPostsResponse;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdatePostRequest;
import com.raisetimeline.backend.entity.Post;
import com.raisetimeline.backend.entity.PostImage;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.CommentMapper;
import com.raisetimeline.backend.mapper.LikeMapper;
import com.raisetimeline.backend.mapper.PostCount;
import com.raisetimeline.backend.mapper.PostImageMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

@ExtendWith(MockitoExtension.class)
class PostServiceTest {

    private static final OffsetDateTime T0 = OffsetDateTime.parse("2026-01-01T00:00:00Z");

    @Mock
    PostMapper postMapper;

    @Mock
    LikeMapper likeMapper;

    @Mock
    CommentMapper commentMapper;

    @Mock
    UserService userService;

    @Mock
    ImageService imageService;

    @Mock
    PostImageMapper postImageMapper;

    @InjectMocks
    PostService service;

    private Post post(long id, long userId, String body) {
        Post post = new Post();
        post.setId(id);
        post.setUserId(userId);
        post.setBody(body);
        post.setCreatedAt(T0.plusMinutes(id));
        post.setAuthorHandle("user" + userId);
        post.setAuthorDisplayName("User" + userId);
        return post;
    }

    private CreatePostRequest create(String body, String... keys) {
        return new CreatePostRequest(body, List.of(keys));
    }

    // ---- create ----

    @Test
    void createは本文も画像も無ければ400で_bodyの項目エラーを返す() {
        ApiException e = assertApiError(() -> service.create(1L, create("")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        assertThat(e.getFieldErrors()).containsKey("body");
        verify(postMapper, never()).insert(any());
    }

    @Test
    void createは本文が空白だけでも画像が無ければ400() {
        assertApiError(() -> service.create(1L, create("   ")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void createは同じ画像を2回指定したら400で_保存しない() {
        ApiException e = assertApiError(
                () -> service.create(1L, create("x", "k/a.png", "k/a.png")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        assertThat(e.getFieldErrors()).containsKey("imageKeys");
        verify(postMapper, never()).insert(any());
    }

    @Test
    void createは画像のキーを1枚ずつ_本人が投稿用にアップロードしたか確認する() {
        stubInsert(10L);
        when(postMapper.findById(10L)).thenReturn(post(10, 1, "x"));

        service.create(1L, create("x", "k/a.png", "k/b.png"));

        verify(imageService).requireUploaded(1L, ImagePurpose.POST, "k/a.png");
        verify(imageService).requireUploaded(1L, ImagePurpose.POST, "k/b.png");
    }

    @Test
    void createは画像の確認に失敗したら投稿を保存しない() {
        ApiException rejected = ApiException.invalid("imageKeys", "未アップロード");
        doThrow(rejected).when(imageService).requireUploaded(1L, ImagePurpose.POST, "k/a.png");

        assertApiError(() -> service.create(1L, create("x", "k/a.png")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        verify(postMapper, never()).insert(any());
    }

    @Test
    void createは画像なしの投稿なら画像テーブルに書き込まない() {
        stubInsert(10L);
        when(postMapper.findById(10L)).thenReturn(post(10, 1, "こんにちは"));

        PostResponse response = service.create(1L, create("こんにちは"));

        verify(postImageMapper, never()).insertAll(any(), any());
        assertThat(response.id()).isEqualTo(10L);
        assertThat(response.body()).isEqualTo("こんにちは");
    }

    @Test
    void createは本文を空にして画像だけの投稿もできる() {
        stubInsert(10L);
        when(postMapper.findById(10L)).thenReturn(post(10, 1, ""));

        service.create(1L, create("", "k/a.png"));

        verify(postImageMapper).insertAll(10L, List.of("k/a.png"));
    }

    @Test
    void createは投稿者と本文を保存し_画像を指定した順で保存する() {
        stubInsert(10L);
        when(postMapper.findById(10L)).thenReturn(post(10, 1, "本文"));

        service.create(1L, create("本文", "k/b.png", "k/a.png"));

        ArgumentCaptor<Post> captor = ArgumentCaptor.forClass(Post.class);
        verify(postMapper).insert(captor.capture());
        assertThat(captor.getValue().getUserId()).isEqualTo(1L);
        assertThat(captor.getValue().getBody()).isEqualTo("本文");
        verify(postImageMapper).insertAll(10L, List.of("k/b.png", "k/a.png"));
    }

    @Test
    void createは画像がすでに別の投稿で使われていたら400() {
        stubInsert(10L);
        doThrow(new DataIntegrityViolationException("unique")).when(postImageMapper).insertAll(10L, List.of("k/a.png"));

        ApiException e = assertApiError(
                () -> service.create(1L, create("x", "k/a.png")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        assertThat(e.getFieldErrors()).containsKey("imageKeys");
    }

    private void stubInsert(long id) {
        doAnswer(invocation -> {
            invocation.<Post>getArgument(0).setId(id);
            return null;
        }).when(postMapper).insert(any(Post.class));
    }

    // ---- get / レスポンスの組み立て ----

    @Test
    void getは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.get(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void getはいいね数_いいね済み_コメント数_画像をまとめて組み立てる() {
        Post p = post(1, 2, "本文");
        when(postMapper.findById(1L)).thenReturn(p);
        when(likeMapper.countByPostIds(List.of(1L))).thenReturn(List.of(new PostCount(1L, 3)));
        when(commentMapper.countByPostIds(List.of(1L))).thenReturn(List.of(new PostCount(1L, 2)));
        when(likeMapper.findLikedPostIds(5L, List.of(1L))).thenReturn(List.of(1L));
        PostImage image = new PostImage();
        image.setPostId(1L);
        image.setImageKey("k/a.png");
        image.setSortOrder(0);
        when(postImageMapper.findByPostIds(List.of(1L))).thenReturn(List.of(image));
        when(imageService.urlFor("k/a.png")).thenReturn("https://cdn.example.com/a.png");

        PostResponse response = service.get(5L, 1L);

        assertThat(response.likeCount()).isEqualTo(3);
        assertThat(response.likedByMe()).isTrue();
        assertThat(response.commentCount()).isEqualTo(2);
        assertThat(response.images()).containsExactly(new PostResponse.Image("https://cdn.example.com/a.png", 0));
        assertThat(response.author().handle()).isEqualTo("user2");
        assertThat(response.editedAt()).isNull();
    }

    @Test
    void getは集計に含まれない投稿のいいね数とコメント数を0にする() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "本文"));

        PostResponse response = service.get(5L, 1L);

        assertThat(response.likeCount()).isZero();
        assertThat(response.commentCount()).isZero();
        assertThat(response.likedByMe()).isFalse();
        assertThat(response.images()).isEmpty();
    }

    @Test
    void getは表示用URLを作れない画像を含めない() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "本文"));
        PostImage image = new PostImage();
        image.setPostId(1L);
        image.setImageKey("k/a.png");
        when(postImageMapper.findByPostIds(List.of(1L))).thenReturn(List.of(image));
        when(imageService.urlFor("k/a.png")).thenReturn(null);

        assertThat(service.get(5L, 1L).images()).isEmpty();
    }

    // ---- timeline ----

    @Test
    void timelineは既定でフォロー中タブとして_自分のIDで絞り込む() {
        service.timeline(5L, null, null, null);

        verify(postMapper).findPage(null, 5L, null, null, Paging.DEFAULT_LIMIT + 1);
    }

    @Test
    void timelineの全体タブは絞り込まない() {
        service.timeline(5L, PostService.TAB_ALL, null, null);

        verify(postMapper).findPage(null, null, null, null, Paging.DEFAULT_LIMIT + 1);
    }

    @Test
    void timelineは不明なタブなら400() {
        assertApiError(() -> service.timeline(5L, "other", null, null), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    @Test
    void timelineは余りがあれば次のカーソルを返し_カーソルを取得に渡す() {
        when(postMapper.findPage(isNull(), isNull(), eq(T0), eq(7L), eq(3))).thenReturn(List.of(
                post(3, 1, "3"), post(2, 1, "2"), post(1, 1, "1")));

        TimelineResponse response = service.timeline(5L, PostService.TAB_ALL, Cursor.encode(T0, 7L), 2);

        assertThat(response.items()).extracting(PostResponse::id).containsExactly(3L, 2L);
        assertThat(Cursor.decodeOrNull(response.nextCursor()).id()).isEqualTo(2L);
    }

    @Test
    void timelineは取得結果が空なら集計のクエリを発行しない() {
        TimelineResponse response = service.timeline(5L, PostService.TAB_ALL, null, null);

        assertThat(response.items()).isEmpty();
        assertThat(response.nextCursor()).isNull();
        verify(likeMapper, never()).countByPostIds(anyList());
        verify(commentMapper, never()).countByPostIds(anyList());
    }

    // ---- userPosts ----

    @Test
    void userPostsはハンドルのユーザーの投稿だけを返す() {
        User author = new User();
        author.setId(9L);
        when(userService.requireByHandle("alice")).thenReturn(author);

        service.userPosts(5L, "alice", null, null);

        verify(postMapper).findPage(9L, null, null, null, Paging.DEFAULT_LIMIT + 1);
    }

    // ---- newerThan ----

    @Test
    void newerThanは新着の件数と投稿を返す() {
        when(postMapper.findNewerThan(null, 5L, 10L, PostService.MAX_NEW_POSTS + 1))
                .thenReturn(List.of(post(12, 1, "12"), post(11, 1, "11")));

        NewPostsResponse response = service.newerThan(5L, null, 10L);

        assertThat(response.count()).isEqualTo(2);
        assertThat(response.hasMore()).isFalse();
        assertThat(response.items()).extracting(PostResponse::id).containsExactly(12L, 11L);
    }

    @Test
    void newerThanは最大件数を超えたらhasMoreにして_最大件数までに切り詰める() {
        List<Post> rows = new ArrayList<>();
        LongStream.rangeClosed(1, PostService.MAX_NEW_POSTS + 1).forEach(i -> rows.add(post(i, 1, "p" + i)));
        when(postMapper.findNewerThan(null, null, 0L, PostService.MAX_NEW_POSTS + 1)).thenReturn(rows);

        NewPostsResponse response = service.newerThan(5L, PostService.TAB_ALL, 0L);

        assertThat(response.count()).isEqualTo(PostService.MAX_NEW_POSTS);
        assertThat(response.hasMore()).isTrue();
        assertThat(response.items()).hasSize(PostService.MAX_NEW_POSTS);
    }

    @Test
    void newerThanは不明なタブなら400() {
        assertApiError(() -> service.newerThan(5L, "x", 0L), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");
    }

    // ---- update ----

    @Test
    void updateは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.update(5L, 1L, new UpdatePostRequest("x")), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void updateは他人の投稿なら403で_更新しない() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "旧"));

        assertApiError(() -> service.update(5L, 1L, new UpdatePostRequest("新")), HttpStatus.FORBIDDEN, "FORBIDDEN");

        verify(postMapper, never()).updateBody(any(), any(), any());
    }

    @Test
    void updateは本文を空にすると画像が無い投稿では400() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "旧"));
        when(postImageMapper.findKeysByPostId(1L)).thenReturn(List.of());

        ApiException e = assertApiError(
                () -> service.update(5L, 1L, new UpdatePostRequest("")), HttpStatus.BAD_REQUEST, "VALIDATION_ERROR");

        assertThat(e.getFieldErrors()).containsKey("body");
    }

    @Test
    void updateは画像のある投稿なら本文を空にできる() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "旧"), post(1, 5, ""));
        when(postImageMapper.findKeysByPostId(1L)).thenReturn(List.of("k/a.png"));
        when(postMapper.updateBody(1L, 5L, "")).thenReturn(1);

        PostResponse response = service.update(5L, 1L, new UpdatePostRequest(""));

        assertThat(response.body()).isEmpty();
    }

    @Test
    void updateは本文が変わらなければ更新せず_編集済みにもしない() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "同じ"));

        PostResponse response = service.update(5L, 1L, new UpdatePostRequest("同じ"));

        verify(postMapper, never()).updateBody(any(), any(), any());
        assertThat(response.editedAt()).isNull();
    }

    @Test
    void updateは確認と更新の間に消されて0件なら404() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "旧"));
        when(postMapper.updateBody(1L, 5L, "新")).thenReturn(0);

        assertApiError(() -> service.update(5L, 1L, new UpdatePostRequest("新")), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void updateは本文を更新して_更新後の投稿を返す() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "旧"), post(1, 5, "新"));
        when(postMapper.updateBody(1L, 5L, "新")).thenReturn(1);

        PostResponse response = service.update(5L, 1L, new UpdatePostRequest("新"));

        assertThat(response.body()).isEqualTo("新");
        verify(postMapper).updateBody(1L, 5L, "新");
    }

    // ---- delete ----

    @Test
    void deleteは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void deleteは他人の投稿なら403で_削除しない() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "x"));

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.FORBIDDEN, "FORBIDDEN");

        verify(postMapper, never()).delete(any(), any());
    }

    @Test
    void deleteは投稿を削除し_画像をコミット後の削除に回す() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "x"));
        when(postImageMapper.findKeysByPostId(1L)).thenReturn(List.of("k/a.png", "k/b.png"));
        when(postMapper.delete(1L, 5L)).thenReturn(1);

        service.delete(5L, 1L);

        verify(imageService).deleteAfterCommit("k/a.png");
        verify(imageService).deleteAfterCommit("k/b.png");
    }

    @Test
    void deleteは確認と削除の間に消されて0件なら404で_画像も消さない() {
        when(postMapper.findById(1L)).thenReturn(post(1, 5, "x"));
        when(postImageMapper.findKeysByPostId(1L)).thenReturn(List.of("k/a.png"));
        when(postMapper.delete(1L, 5L)).thenReturn(0);

        assertApiError(() -> service.delete(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");

        verify(imageService, never()).deleteAfterCommit(any());
    }

    // ---- like / unlike ----

    @Test
    void likeは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.like(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");

        verify(likeMapper, never()).insertIgnore(any(), any());
    }

    @Test
    void likeはいいねして_最新のいいね数と済みを返す() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "x"));
        when(likeMapper.countByPostId(1L)).thenReturn(4L);

        LikeResponse response = service.like(5L, 1L);

        verify(likeMapper).insertIgnore(5L, 1L);
        assertThat(response).isEqualTo(new LikeResponse(4, true));
    }

    @Test
    void likeは確認といいねの間に投稿が消されたら404() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "x"));
        doThrow(new DataIntegrityViolationException("fk")).when(likeMapper).insertIgnore(5L, 1L);

        assertApiError(() -> service.like(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void unlikeは投稿が無ければ404() {
        when(postMapper.findById(1L)).thenReturn(null);

        assertApiError(() -> service.unlike(5L, 1L), HttpStatus.NOT_FOUND, "NOT_FOUND");
    }

    @Test
    void unlikeはいいねを取り消して_最新のいいね数と未済みを返す() {
        when(postMapper.findById(1L)).thenReturn(post(1, 2, "x"));
        when(likeMapper.countByPostId(1L)).thenReturn(2L);

        LikeResponse response = service.unlike(5L, 1L);

        verify(likeMapper).delete(5L, 1L);
        assertThat(response).isEqualTo(new LikeResponse(2, false));
    }
}
