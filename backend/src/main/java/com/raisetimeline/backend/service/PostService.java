package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.CreatePostRequest;
import com.raisetimeline.backend.dto.LikeResponse;
import com.raisetimeline.backend.dto.NewPostsResponse;
import com.raisetimeline.backend.dto.PostResponse;
import com.raisetimeline.backend.dto.TimelineResponse;
import com.raisetimeline.backend.dto.UpdatePostRequest;
import com.raisetimeline.backend.entity.Post;
import com.raisetimeline.backend.entity.PostImage;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
import com.raisetimeline.backend.mapper.CommentMapper;
import com.raisetimeline.backend.mapper.LikeMapper;
import com.raisetimeline.backend.mapper.PostCount;
import com.raisetimeline.backend.mapper.PostImageMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.util.ArrayList;
import java.util.HashMap;
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
    /** 新着として一度に返す最大件数。 */
    public static final int MAX_NEW_POSTS = 50;

    private static final String NOT_FOUND = "NOT_FOUND";
    private static final String NOT_FOUND_MESSAGE = "投稿が見つかりません";
    private static final String FORBIDDEN = "FORBIDDEN";
    private static final String INVALID_TAB_MESSAGE = "tab は following または all を指定してください";

    private final PostMapper postMapper;
    private final LikeMapper likeMapper;
    private final CommentMapper commentMapper;
    private final UserService userService;
    private final ImageService imageService;
    private final PostImageMapper postImageMapper;

    public PostService(
            PostMapper postMapper, LikeMapper likeMapper, CommentMapper commentMapper, UserService userService,
            ImageService imageService,
            PostImageMapper postImageMapper) {
        this.postMapper = postMapper;
        this.likeMapper = likeMapper;
        this.commentMapper = commentMapper;
        this.userService = userService;
        this.imageService = imageService;
        this.postImageMapper = postImageMapper;
    }

    /**
     * 投稿を作る(F-05)。本文か画像のどちらかは必要。画像(imageKeys)は、本人が S3 へアップロードしたものだけ使え、
     * 並びが表示順になる。投稿と画像は同じトランザクションで保存する。
     */
    @Transactional
    public PostResponse create(Long userId, CreatePostRequest request) {
        List<String> imageKeys = request.imageKeys();
        if (request.body().isEmpty() && imageKeys.isEmpty()) {
            throw ApiException.invalid("body", "本文または画像を入れてください");
        }
        requireUsableImages(userId, imageKeys);

        Post post = new Post();
        post.setUserId(userId);
        post.setBody(request.body());
        postMapper.insert(post);
        if (!imageKeys.isEmpty()) {
            try {
                postImageMapper.insertAll(post.getId(), imageKeys);
            } catch (DataIntegrityViolationException e) {
                // 同じ画像が、すでに別の投稿に使われている(キーは一意)
                throw ApiException.invalid("imageKeys", "この画像はすでに使われています");
            }
        }
        return toResponse(userId, postMapper.findById(post.getId()));
    }

    /** 画像のキーを確認する。同じ画像を 2 回は使えず、1 枚ずつ、本人が投稿用にアップロードした画像かを確かめる。 */
    private void requireUsableImages(Long userId, List<String> imageKeys) {
        if (new HashSet<>(imageKeys).size() != imageKeys.size()) {
            throw ApiException.invalid("imageKeys", "同じ画像は 1 枚だけ選べます");
        }
        for (String key : imageKeys) {
            imageService.requireUploaded(userId, ImagePurpose.POST, key);
        }
    }

    @Transactional(readOnly = true)
    public PostResponse get(Long userId, Long id) {
        return toResponse(userId, findOrThrow(id));
    }

    @Transactional(readOnly = true)
    public TimelineResponse timeline(Long userId, String tab, String cursor, Integer limit) {
        return page(userId, null, followerFilter(userId, tab), cursor, limit);
    }

    /** 指定したハンドルのユーザーの投稿を、新しい順に返す(プロフィール S-05)。 */
    @Transactional(readOnly = true)
    public TimelineResponse userPosts(Long viewerId, String handle, String cursor, Integer limit) {
        return page(viewerId, userService.requireByHandle(handle).getId(), null, cursor, limit);
    }

    /** authorId: そのユーザーの投稿だけ。followerId: そのユーザー自身と、フォロー中のユーザーの投稿。どちらも null なら全ユーザー。 */
    private TimelineResponse page(Long userId, Long authorId, Long followerId, String cursor, Integer limit) {
        int size = Paging.size(limit);
        Cursor decoded = Cursor.decodeOrNull(cursor);

        // 1 件多く取得して、次ページがあるかを判定する
        Paging.Page<Post> page = Paging.slice(
                postMapper.findPage(
                        authorId,
                        followerId,
                        decoded == null ? null : decoded.createdAt(),
                        decoded == null ? null : decoded.id(),
                        size + 1),
                size, Post::getCreatedAt, Post::getId);
        return new TimelineResponse(toResponses(userId, page.items()), page.nextCursor());
    }

    @Transactional(readOnly = true)
    public NewPostsResponse newerThan(Long userId, String tab, Long sinceId) {
        List<Post> rows = postMapper.findNewerThan(null, followerFilter(userId, tab), sinceId, MAX_NEW_POSTS + 1);
        boolean hasMore = rows.size() > MAX_NEW_POSTS;
        List<Post> items = hasMore ? rows.subList(0, MAX_NEW_POSTS) : rows;
        return new NewPostsResponse(items.size(), hasMore, toResponses(userId, items));
    }

    @Transactional
    public PostResponse update(Long userId, Long id, UpdatePostRequest request) {
        Post post = findOwnedOrThrow(userId, id);
        if (request.body().isEmpty() && postImageMapper.findKeysByPostId(id).isEmpty()) {
            // 画像のある投稿は、本文を空にしてもよい(画像だけの投稿になる)
            throw ApiException.invalid("body", "本文を入力してください");
        }
        if (post.getBody().equals(request.body())) {
            // 変更なしなら更新日時を触らず、「編集済み」にもしない
            return toResponse(userId, post);
        }
        // 確認と更新の間に消された場合は 0 件になる。WHERE に user_id を含め、他人の投稿を書き換えないようにする
        requireAffected(postMapper.updateBody(id, userId, request.body()));
        return toResponse(userId, postMapper.findById(id));
    }

    /** 自分の投稿を消す。コメント・いいね・画像の行は連動して消え、S3 の画像は、コミット後に消す。 */
    @Transactional
    public void delete(Long userId, Long id) {
        findOwnedOrThrow(userId, id);
        List<String> imageKeys = postImageMapper.findKeysByPostId(id);
        requireAffected(postMapper.delete(id, userId));
        imageKeys.forEach(imageService::deleteAfterCommit);
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
     * 投稿一覧をレスポンスに変換する。いいね数・いいね済み・コメント数・画像は投稿ごとに問い合わせず、
     * 投稿 ID の一括(IN)で件数に依らず固定のクエリ数で取得する(N+1 を避ける)。
     */
    private List<PostResponse> toResponses(Long userId, List<Post> posts) {
        if (posts.isEmpty()) {
            return List.of();
        }
        List<Long> ids = posts.stream().map(Post::getId).toList();
        Map<Long, Long> likeCounts = toMap(likeMapper.countByPostIds(ids));
        Map<Long, Long> commentCounts = toMap(commentMapper.countByPostIds(ids));
        Set<Long> liked = new HashSet<>(likeMapper.findLikedPostIds(userId, ids));
        Map<Long, List<PostResponse.Image>> images = new HashMap<>();
        for (PostImage image : postImageMapper.findByPostIds(ids)) {
            String url = imageService.urlFor(image.getImageKey());
            if (url != null) {
                images.computeIfAbsent(image.getPostId(), key -> new ArrayList<>())
                        .add(new PostResponse.Image(url, image.getSortOrder()));
            }
        }
        return posts.stream()
                .map(p -> PostResponse.from(
                        p,
                        likeCounts.getOrDefault(p.getId(), 0L),
                        liked.contains(p.getId()),
                        commentCounts.getOrDefault(p.getId(), 0L),
                        images.getOrDefault(p.getId(), List.of()),
                        imageService::urlFor))
                .toList();
    }

    private static Map<Long, Long> toMap(List<PostCount> counts) {
        return counts.stream().collect(Collectors.toMap(PostCount::postId, PostCount::count));
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

    /** 全体タブは絞り込みなし(null)。フォロー中タブは、自分とフォロー中のユーザーの投稿(userId)。 */
    private static Long followerFilter(Long userId, String tab) {
        if (tab == null || TAB_FOLLOWING.equals(tab)) {
            return userId;
        }
        if (TAB_ALL.equals(tab)) {
            return null;
        }
        throw new ApiException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, INVALID_TAB_MESSAGE);
    }
}
