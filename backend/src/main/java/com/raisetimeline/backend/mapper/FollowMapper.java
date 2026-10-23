package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.entity.FollowEntry;
import java.time.OffsetDateTime;
import java.util.List;
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

    /** userId がフォローしているユーザーを、新しいフォロー順に返す。cursor が null なら先頭から。 */
    List<FollowEntry> findFollowing(
            @Param("userId") Long userId,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            @Param("limit") int limit);

    /** userId をフォローしているユーザーを、新しいフォロー順に返す。cursor が null なら先頭から。 */
    List<FollowEntry> findFollowers(
            @Param("userId") Long userId,
            @Param("cursorCreatedAt") OffsetDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            @Param("limit") int limit);

    /** userIds のうち followerId がフォローしているユーザー ID(一覧の「フォロー中」表示を 1 回で求める)。 */
    List<Long> findFollowedIds(@Param("followerId") Long followerId, @Param("userIds") List<Long> userIds);
}
