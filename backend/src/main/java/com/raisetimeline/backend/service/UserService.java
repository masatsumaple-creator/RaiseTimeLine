package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.FollowResponse;
import com.raisetimeline.backend.dto.UserProfileResponse;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.FollowMapper;
import com.raisetimeline.backend.mapper.UserMapper;
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

    private User findByHandleOrThrow(String handle) {
        User user = userMapper.findByHandle(handle);
        if (user == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, NOT_FOUND, NOT_FOUND_MESSAGE);
        }
        return user;
    }
}
