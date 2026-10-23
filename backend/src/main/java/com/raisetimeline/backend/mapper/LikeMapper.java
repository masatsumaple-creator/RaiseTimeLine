package com.raisetimeline.backend.mapper;

import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface LikeMapper {

    /** 既にいいね済みなら何もしない(冪等)。 */
    void insertIgnore(@Param("userId") Long userId, @Param("postId") Long postId);

    void delete(@Param("userId") Long userId, @Param("postId") Long postId);

    long countByPostId(@Param("postId") Long postId);

    /** 投稿 ID ごとのいいね数。いいねが 0 件の投稿は含まれない。 */
    List<PostCount> countByPostIds(@Param("postIds") List<Long> postIds);

    /** postIds のうち userId がいいね済みの投稿 ID。 */
    List<Long> findLikedPostIds(@Param("userId") Long userId, @Param("postIds") List<Long> postIds);
}
