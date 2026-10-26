package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.UpdateProfileRequest;
import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.dto.UserSummaryResponse;
import com.raisetimeline.backend.entity.FollowEntry;
import com.raisetimeline.backend.entity.ListedUser;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.exception.GlobalExceptionHandler;
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
    static final int MAX_SEARCH_TERM_LENGTH = 50;

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
        User user = requireByHandle(handle);
        return UserProfileResponse.of(
                user,
                viewerId,
                followMapper.countFollowing(user.getId()),
                followMapper.countFollowers(user.getId()),
                followMapper.exists(viewerId, user.getId()));
    }

    /** ログイン中のユーザー自身のプロフィール(表示名と自己紹介)を更新する(F-03)。対象は常に本人の行だけ。 */
    @Transactional
    public User updateProfile(Long userId, UpdateProfileRequest request) {
        if (userMapper.updateProfile(userId, request.displayName(), request.bio()) == 0) {
            // トークンは有効だが、ユーザーが削除済みの場合
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "ログインが必要です");
        }
        return userMapper.findById(userId);
    }

    @Transactional
    public FollowResponse follow(Long viewerId, String handle) {
        User target = requireByHandle(handle);
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
        User target = requireByHandle(handle);
        followMapper.delete(viewerId, target.getId());
        return new FollowResponse(false, followMapper.countFollowers(target.getId()));
    }

    /** handle がフォローしているユーザーの一覧(新しいフォロー順)。 */
    @Transactional(readOnly = true)
    public UserListResponse following(Long viewerId, String handle, String cursor, Integer limit) {
        Long userId = requireByHandle(handle).getId();
        return list(viewerId, cursor, limit,
                (createdAt, id, size) -> followMapper.findFollowing(userId, createdAt, id, size));
    }

    /** handle をフォローしているユーザーの一覧(新しいフォロー順)。 */
    @Transactional(readOnly = true)
    public UserListResponse followers(Long viewerId, String handle, String cursor, Integer limit) {
        Long userId = requireByHandle(handle).getId();
        return list(viewerId, cursor, limit,
                (createdAt, id, size) -> followMapper.findFollowers(userId, createdAt, id, size));
    }

    private UserListResponse list(Long viewerId, String cursor, Integer limit, PageFinder finder) {
        int size = Paging.size(limit);
        Cursor decoded = Cursor.decodeOrNull(cursor);

        // 1 件多く取得して、次ページがあるかを判定する
        Paging.Page<FollowEntry> paged = Paging.slice(
                finder.find(
                        decoded == null ? null : decoded.createdAt(), decoded == null ? null : decoded.id(), size + 1),
                size, FollowEntry::getFollowedAt, FollowEntry::getId);
        List<FollowEntry> page = paged.items();

        return new UserListResponse(summaries(viewerId, page), paged.nextCursor());
    }

    /** 一覧の各行を、ログイン中のユーザーがフォロー済みかとあわせて返す(「フォロー済みか」は 1 回のクエリで求める)。 */
    private List<UserSummaryResponse> summaries(Long viewerId, List<? extends ListedUser> users) {
        if (users.isEmpty()) {
            return List.of();
        }
        Set<Long> followed = new HashSet<>(
                followMapper.findFollowedIds(viewerId, users.stream().map(ListedUser::getId).toList()));
        return users.stream()
                .map(user -> UserSummaryResponse.of(user, viewerId, followed.contains(user.getId())))
                .toList();
    }

    /**
     * ハンドルと表示名の部分一致で検索する(F-21)。大文字小文字は区別しない。
     * 結果は「先頭が一致するユーザー → ハンドルの昇順」で、自分自身も含む。続きは OFFSET のカーソルで取る。
     */
    @Transactional(readOnly = true)
    public UserListResponse search(Long viewerId, String q, String cursor, Integer limit) {
        String term = normalizeSearchTerm(q);
        int size = Paging.size(limit);
        int offset = OffsetCursor.decode(cursor);
        String escaped = escapeLike(term);

        // 1 件多く取得して、次ページがあるかを判定する
        List<User> rows = userMapper.search("%" + escaped + "%", escaped + "%", size + 1, offset);
        boolean hasNext = rows.size() > size;
        List<User> page = hasNext ? rows.subList(0, size) : rows;
        return new UserListResponse(summaries(viewerId, page), hasNext ? OffsetCursor.encode(offset + size) : null);
    }

    /** 前後の空白と先頭の @ を取り除く(@taro と taro は同じ結果)。空、または 50 文字を超えるなら 400。 */
    private static String normalizeSearchTerm(String q) {
        String term = q == null ? "" : q.strip();
        if (term.startsWith("@")) {
            term = term.substring(1).strip();
        }
        if (term.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, "検索語を入力してください");
        }
        if (term.codePointCount(0, term.length()) > MAX_SEARCH_TERM_LENGTH) {
            throw new ApiException(
                    HttpStatus.BAD_REQUEST, GlobalExceptionHandler.VALIDATION_ERROR, "50 文字以内で入力してください");
        }
        return term;
    }

    /** LIKE の特殊文字( % _)を、ワイルドカードではなく文字そのものとして探すためにエスケープする。 */
    private static String escapeLike(String term) {
        return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    @FunctionalInterface
    private interface PageFinder {
        List<FollowEntry> find(OffsetDateTime cursorCreatedAt, Long cursorId, int limit);
    }

    /** ハンドルのユーザーを返す(大文字小文字を区別しない)。無ければ 404。 */
    public User requireByHandle(String handle) {
        User user = userMapper.findByHandle(handle);
        if (user == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return user;
    }
}
