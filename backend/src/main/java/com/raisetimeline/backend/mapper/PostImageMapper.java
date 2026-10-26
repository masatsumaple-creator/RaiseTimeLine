package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.PostImage;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PostImageMapper {

    /** keys の並びを、そのまま表示順(0 から)として保存する。同じ画像を別の投稿に使っていると、一意制約で失敗する。 */
    void insertAll(@Param("postId") Long postId, @Param("keys") List<String> keys);

    /** postIds の投稿の画像を、投稿ごとに表示順で返す。画像の無い投稿は含まれない。 */
    List<PostImage> findByPostIds(@Param("postIds") List<Long> postIds);

    /** その投稿の画像のキー(表示順)。 */
    List<String> findKeysByPostId(@Param("postId") Long postId);
}
