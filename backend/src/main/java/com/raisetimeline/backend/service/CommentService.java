package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.CommentCountResponse;
import com.raisetimeline.backend.dto.CommentCreatedResponse;
import com.raisetimeline.backend.dto.CommentPageResponse;
import com.raisetimeline.backend.dto.CommentResponse;
import com.raisetimeline.backend.dto.CreateCommentRequest;
import com.raisetimeline.backend.entity.Comment;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.CommentMapper;
import com.raisetimeline.backend.mapper.PostMapper;
import java.util.List;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CommentService {

    public static final int DEFAULT_LIMIT = 20;
    public static final int MAX_LIMIT = 50;

    private static final String NOT_FOUND = "NOT_FOUND";
    private static final String POST_NOT_FOUND_MESSAGE = "投稿が見つかりません";
    private static final String COMMENT_NOT_FOUND_MESSAGE = "コメントが見つかりません";
    private static final String FORBIDDEN = "FORBIDDEN";

    private final CommentMapper commentMapper;
    private final PostMapper postMapper;

    public CommentService(CommentMapper commentMapper, PostMapper postMapper) {
        this.commentMapper = commentMapper;
        this.postMapper = postMapper;
    }

    /** 古い順。著者は JOIN で同時に取得し、mine はログイン中のユーザー ID との比較で求める(追加クエリなし)。 */
    @Transactional(readOnly = true)
    public CommentPageResponse list(Long userId, Long postId, String cursor, Integer limit) {
        requirePostExists(postId);
        int size = limit == null ? DEFAULT_LIMIT : Math.min(Math.max(limit, 1), MAX_LIMIT);
        Cursor decoded = Cursor.decodeOrNull(cursor);

        // 1 件多く取得して、次ページがあるかを判定する
        List<Comment> rows = commentMapper.findPage(
                postId,
                decoded == null ? null : decoded.createdAt(),
                decoded == null ? null : decoded.id(),
                size + 1);
        boolean hasNext = rows.size() > size;
        List<Comment> page = hasNext ? rows.subList(0, size) : rows;
        String nextCursor = hasNext
                ? Cursor.encode(page.get(page.size() - 1).getCreatedAt(), page.get(page.size() - 1).getId())
                : null;
        return new CommentPageResponse(page.stream().map(c -> CommentResponse.from(c, userId)).toList(), nextCursor);
    }

    @Transactional
    public CommentCreatedResponse create(Long userId, Long postId, CreateCommentRequest request) {
        requirePostExists(postId);
        Comment comment = new Comment();
        comment.setPostId(postId);
        comment.setUserId(userId);
        comment.setBody(request.body());
        try {
            commentMapper.insert(comment);
        } catch (DataIntegrityViolationException e) {
            // 確認と保存の間に投稿が消された(外部キー違反)
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, POST_NOT_FOUND_MESSAGE);
        }
        return new CommentCreatedResponse(
                CommentResponse.from(commentMapper.findById(comment.getId()), userId),
                commentMapper.countByPostId(postId));
    }

    @Transactional
    public CommentCountResponse delete(Long userId, Long commentId) {
        Comment comment = commentMapper.findById(commentId);
        if (comment == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, COMMENT_NOT_FOUND_MESSAGE);
        }
        if (!comment.getUserId().equals(userId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN, "他のユーザーのコメントは削除できません");
        }
        // 確認と削除の間に消された場合は 0 件になる。WHERE に user_id を含め、他人のコメントを消さないようにする
        if (commentMapper.delete(commentId, userId) == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, COMMENT_NOT_FOUND_MESSAGE);
        }
        return new CommentCountResponse(commentMapper.countByPostId(comment.getPostId()));
    }

    private void requirePostExists(Long postId) {
        if (postMapper.findById(postId) == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, POST_NOT_FOUND_MESSAGE);
        }
    }
}
