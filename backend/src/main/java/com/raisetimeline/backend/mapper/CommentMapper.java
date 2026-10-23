package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.Comment;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface CommentMapper {

    void insert(Comment comment);

    Comment findById(@Param("id") Long id);

    /** 削除した行数を返す。userId のコメントでなければ(または無ければ)0。 */
    int delete(@Param("id") Long id, @Param("userId") Long userId);

    /** 古い順。cursor が null なら先頭から。 */
    List<Comment> findPage(
            @Param("postId") Long postId,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            @Param("limit") int limit);

    long countByPostId(@Param("postId") Long postId);

    /** 投稿 ID ごとのコメント数。コメントが 0 件の投稿は含まれない。 */
    List<PostCount> countByPostIds(@Param("postIds") List<Long> postIds);
}
