package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.CreatePostRequest;
import com.raisetimeline.backend.dto.LikeResponse;
import com.raisetimeline.backend.dto.NewPostsResponse;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdatePostRequest;
import com.raisetimeline.backend.entity.Post;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
import com.raisetimeline.backend.mapper.LikeMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PostService {

    public static final String TAB_FOLLOWING = "following";
    public static final String TAB_ALL = "all";
    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;
    /** 新着として一度に返す最大件数。 */
    public static final int MAX_NEW_POSTS = 50;

    private static final String NOT_FOUND = "NOT_FOUND";
    private static final String NOT_FOUND_MESSAGE = "投稿が見つかりません";
    private static final String FORBIDDEN = "FORBIDDEN";
    private static final String INVALID_CURSOR_MESSAGE = "カーソルが正しくありません";
    private static final String INVALID_TAB_MESSAGE = "tab は following または all を指定してください";

    private final PostMapper postMapper;
    private final LikeMapper likeMapper;

    public PostService(PostMapper postMapper, LikeMapper likeMapper) {
        this.postMapper = postMapper;
        this.likeMapper = likeMapper;
    }

    @Transactional
    public PostResponse create(Long userId, CreatePostRequest request) {
        Post post = new Post();
        post.setUserId(userId);
        post.setBody(request.body());
        postMapper.insert(post);
        return toResponse(userId, postMapper.findById(post.getId()));
    }

    @Transactional(readOnly = true)
    public PostResponse get(Long userId, Long id) {
        return toResponse(userId, findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public TimelineResponse timeline(Long userId, String tab, String cursor, Integer limit) {
        Long authorId = authorFilter(userId, tab);
        int size = limit == null ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
        Cursor decoded = cursor == null || cursor.isBlank() ? null : Cursor.decode(cursor);

        // 1 件多く取得して、次ページがあるかを判定する
        List<Post> rows = postMapper.findPage(
                authorId,
                decoded == null ? null : decoded.createdAt(),
                decoded == null ? null : decoded.id(),
                size + 1);
        boolean hasNext = rows.size() > size;
        List<Post> page = hasNext ? rows.subList(0, size) : rows;
        String nextCursor = hasNext ? Cursor.encode(page.get(page.size() - 1)) : null;
        return new TimelineResponse(toResponses(userId, page), nextCursor);
    }

    @Transactional(readOnly = true)
    public NewPostsResponse newerThan(Long userId, String tab, Long sinceId) {
        List<Post> rows = postMapper.findNewerThan(authorFilter(userId, tab), sinceId, MAX_NEW_POSTS + 1);
        boolean hasMore = rows.size() > MAX_NEW_POSTS;
        List<Post> items = hasMore ? rows.subList(0, MAX_NEW_POSTS) : rows;
        return new NewPostsResponse(items.size(), hasMore, toResponses(userId, items));
    }

    @Transactional
    public PostResponse update(Long userId, Long id, UpdatePostRequest request) {
        Post post = findOwnedOrThrow(userId, id);
        if (post.getBody().equals(request.body())) {
            // 変更なしなら更新日時を触らず、「編集済み」にもしない
            return toResponse(userId, post);
        }
        // 確認と更新の間に消された場合は 0 件になる。WHERE に user_id を含め、他人の投稿を書き換えないようにする
        requireAffected(postMapper.updateBody(id, userId, request.body()));
        return toResponse(userId, postMapper.findById(id));
    }

    @Transactional
    public void delete(Long userId, Long id) {
        findOwnedOrThrow(userId, id);
        requireAffected(postMapper.delete(id, userId));
    }

    @Transactional
    public LikeResponse like(Long userId, Long postId) {
        findOrThrow(postId);
        try {
            likeMapper.insertIgnore(userId, postId);
        } catch (DataIntegrityViolationException e) {
            // 確認といいねの間に投稿が消された(外部キー違反)
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return new LikeResponse(likeMapper.countByPostId(postId), true);
    }

    @Transactional
    public LikeResponse unlike(Long userId, Long postId) {
        findOrThrow(postId);
        likeMapper.delete(userId, postId);
        return new LikeResponse(likeMapper.countByPostId(postId), false);
    }

    private PostResponse toResponse(Long userId, Post post) {
        return toResponses(userId, List.of(post)).get(0);
    }

    /**
     * 投稿一覧をレスポンスに変換する。いいね数・いいね済みは投稿ごとに問い合わせず、
     * 投稿 ID の一括(IN)で件数に依らず固定のクエリ数で取得する(N+1 を避ける)。
     */
    private List<PostResponse> toResponses(Long userId, List<Post> posts) {
        if (posts.isEmpty()) {
            return List.of();
        }
        List<Long> ids = posts.stream().map(Post::getId).toList();
        Map<Long, Long> likeCounts = likeMapper.countByPostIds(ids).stream()
                .collect(Collectors.toMap(LikeMapper.PostCount::postId, LikeMapper.PostCount::count));
        Set<Long> liked = new HashSet<>(likeMapper.findLikedPostIds(userId, ids));
        return posts.stream()
                .map(p -> PostResponse.from(p, likeCounts.getOrDefault(p.getId(), 0L), liked.contains(p.getId())))
                .toList();
    }

    private static void requireAffected(int rows) {
        if (rows == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
    }

    private Post findOrThrow(Long id) {
        Post post = postMapper.findById(id);
        if (post == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return post;
    }

    private Post findOwnedOrThrow(Long userId, Long id) {
        Post post = findOrThrow(id);
        if (!post.getUserId().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN, "他のユーザーの投稿は操作できません");
        }
        return post;
    }

    /**
     * 全体タブは絞り込みなし。フォロー中タブは、フォロー機能が未実装のため暫定で自分の投稿のみ。
     * フォロー機能の実装時は、ここを「自分 + フォロー中のユーザー」に置き換える。
     */
    private static Long authorFilter(Long userId, String tab) {
        if (tab == null || TAB_FOLLOWING.equals(tab)) {
            return userId;
        }
        if (TAB_ALL.equals(tab)) {
            return null;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, INVALID_TAB_MESSAGE);
    }

    /** 次ページの開始位置(直前ページ末尾の作成日時と id)。クライアントには不透明な文字列として渡す。 */
    private record Cursor(OffsetDateTime createdAt, Long id) {

        static String encode(Post last) {
            String raw = last.getCreatedAt() + "," + last.getId();
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        }

        static Cursor decode(String value) {
            try {
                String raw = new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
                int comma = raw.lastIndexOf(',');
                return new Cursor(OffsetDateTime.parse(raw.substring(0, comma)), Long.valueOf(raw.substring(comma + 1)));
            } catch (IllegalArgumentException | IndexOutOfBoundsException | DateTimeParseException e) {
                throw new ApiException(
                        HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, INVALID_CURSOR_MESSAGE);
            }
        }
    }
}
