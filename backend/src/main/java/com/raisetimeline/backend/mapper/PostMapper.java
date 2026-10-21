package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.Post;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PostMapper {

    void insert(Post post);

    Post findById(@Param("id") Long id);

    /** 更新した行数を返す。userId の投稿でなければ(または無ければ)0。 */
    int updateBody(@Param("id") Long id, @Param("userId") Long userId, @Param("body") String body);

    /** 削除した行数を返す。userId の投稿でなければ(または無ければ)0。 */
    int delete(@Param("id") Long id, @Param("userId") Long userId);

    /** authorId が null なら全ユーザー。cursor が null なら先頭から。 */
    List<Post> findPage(
            @Param("authorId") Long authorId,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            @Param("limit") int limit);

    /** sinceId より新しい(id が大きい)投稿を新しい順に返す。 */
    List<Post> findNewerThan(
            @Param("authorId") Long authorId,
            @Param("sinceId") Long sinceId,
            @Param("limit") int limit);
}
