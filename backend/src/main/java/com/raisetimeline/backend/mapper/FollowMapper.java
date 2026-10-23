package com.raisetimeline.backend.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface FollowMapper {

    /** 既にフォロー済みなら何もしない(冪等)。 */
    void insertIgnore(@Param("followerId") Long followerId, @Param("followeeId") Long followeeId);

    /** フォローしていなくても何もしない(冪等)。 */
    void delete(@Param("followerId") Long followerId, @Param("followeeId") Long followeeId);

    boolean exists(@Param("followerId") Long followerId, @Param("followeeId") Long followeeId);

    /** userId がフォローしている人数。 */
    long countFollowing(@Param("userId") Long userId);

    /** userId をフォローしている人数。 */
    long countFollowers(@Param("userId") Long userId);
}
