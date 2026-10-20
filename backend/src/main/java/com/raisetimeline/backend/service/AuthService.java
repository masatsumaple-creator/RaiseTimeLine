package com.raisetimeline.backend.service;

import com.raisetimeline.backend.dto.SignupRequest;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.mapper.UserMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    public static final String EMAIL_ALREADY_EXISTS = "EMAIL_ALREADY_EXISTS";
    public static final String HANDLE_ALREADY_EXISTS = "HANDLE_ALREADY_EXISTS";

    private static final String EMAIL_CONSTRAINT = "uq_users_email_lower";
    private static final String EMAIL_TAKEN_MESSAGE = "このメールアドレスは登録済みです";
    private static final String HANDLE_TAKEN_MESSAGE = "このハンドルは使われています";

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserMapper userMapper, PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public User signup(SignupRequest request) {
        if (userMapper.existsByEmail(request.email())) {
            throw emailTaken();
        }
        if (userMapper.existsByHandle(request.handle())) {
            throw handleTaken();
        }

        User user = new User();
        user.setEmail(request.email());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setHandle(request.handle());
        user.setDisplayName(request.displayName());
        try {
            userMapper.insert(user);
        } catch (DuplicateKeyException e) {
            // 事前チェックをすり抜けた同時登録は DB の一意制約で検出する
            String detail = String.valueOf(e.getMessage());
            throw detail.contains(EMAIL_CONSTRAINT) ? emailTaken() : handleTaken();
        }
        return user;
    }

    @Transactional(readOnly = true)
    public User findById(Long id) {
        return userMapper.findById(id);
    }

    private ApiException emailTaken() {
        return new ApiException(HttpStatus.CONFLICT, EMAIL_ALREADY_EXISTS, EMAIL_TAKEN_MESSAGE);
    }

    private ApiException handleTaken() {
        return new ApiException(HttpStatus.CONFLICT, HANDLE_ALREADY_EXISTS, HANDLE_TAKEN_MESSAGE);
    }
}
