package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.dto.UserSummaryResponse;
import com.raisetimeline.backend.entity.FollowEntry;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.FollowMapper;
import com.raisetimeline.backend.mapper.UserMapper;
import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    public static final String CANNOT_FOLLOW_SELF = "CANNOT_FOLLOW_SELF";

    private static final String NOT_FOUND = "NOT_FOUND";
    private static final String NOT_FOUND_MESSAGE = "ユーザーが見つかりません";

    private final UserMapper userMapper;
    private final FollowMapper followMapper;

    public UserService(UserMapper userMapper, FollowMapper followMapper) {
        this.userMapper = userMapper;
        this.followMapper = followMapper;
    }

    @Transactional(readOnly = true)
    public UserProfileResponse profile(Long viewerId, String handle) {
        User user = findByHandleOrThrow(handle);
        return UserProfileResponse.of(
                user,
                viewerId,
                followMapper.countFollowing(user.getId()),
                followMapper.countFollowers(user.getId()),
                followMapper.exists(viewerId, user.getId()));
    }

    @Transactional
    public FollowResponse follow(Long viewerId, String handle) {
        User target = findByHandleOrThrow(handle);
        if (target.getId().equals(viewerId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, CANNOT_FOLLOW_SELF, "自分自身はフォローできません");
        }
        try {
            followMapper.insertIgnore(viewerId, target.getId());
        } catch (DataIntegrityViolationException e) {
            // 確認とフォローの間に相手が消えた(外部キー違反)
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return new FollowResponse(true, followMapper.countFollowers(target.getId()));
    }

    @Transactional
    public FollowResponse unfollow(Long viewerId, String handle) {
        User target = findByHandleOrThrow(handle);
        followMapper.delete(viewerId, target.getId());
        return new FollowResponse(false, followMapper.countFollowers(target.getId()));
    }

    /** handle がフォローしているユーザーの一覧(新しいフォロー順)。 */
    @Transactional(readOnly = true)
    public UserListResponse following(Long viewerId, String handle, String cursor, Integer limit) {
        Long userId = findByHandleOrThrow(handle).getId();
        return list(viewerId, cursor, limit,
                (createdAt, id, size) -> followMapper.findFollowing(userId, createdAt, id, size));
    }

    /** handle をフォローしているユーザーの一覧(新しいフォロー順)。 */
    @Transactional(readOnly = true)
    public UserListResponse followers(Long viewerId, String handle, String cursor, Integer limit) {
        Long userId = findByHandleOrThrow(handle).getId();
        return list(viewerId, cursor, limit,
                (createdAt, id, size) -> followMapper.findFollowers(userId, createdAt, id, size));
    }

    private UserListResponse list(Long viewerId, String cursor, Integer limit, PageFinder finder) {
        int size = limit == null ? PostService.DEFAULT_LIMIT : Math.min(Math.max(limit, 1), PostService.MAX_LIMIT);
        Cursor decoded = Cursor.decodeOrNull(cursor);

        // 1 件多く取得して、次ページがあるかを判定する
        List<FollowEntry> rows = finder.find(
                decoded == null ? null : decoded.createdAt(), decoded == null ? null : decoded.id(), size + 1);
        boolean hasNext = rows.size() > size;
        List<FollowEntry> page = hasNext ? rows.subList(0, size) : rows;
        String nextCursor = hasNext
                ? Cursor.encode(page.get(page.size() - 1).getFollowedAt(), page.get(page.size() - 1).getId())
                : null;

        // 一覧の各行を、ログイン中のユーザーがフォロー済みか(1 回のクエリ)
        Set<Long> followed = page.isEmpty()
                ? Set.of()
                : new HashSet<>(followMapper.findFollowedIds(viewerId, page.stream().map(FollowEntry::getId).toList()));
        List<UserSummaryResponse> items = page.stream()
                .map(entry -> UserSummaryResponse.of(entry, viewerId, followed.contains(entry.getId())))
                .toList();
        return new UserListResponse(items, nextCursor);
    }

    @FunctionalInterface
    private interface PageFinder {
        List<FollowEntry> find(OffsetDateTime cursorCreatedAt, Long cursorId, int limit);
    }

    private User findByHandleOrThrow(String handle) {
        User user = userMapper.findByHandle(handle);
        if (user == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return user;
    }
}
