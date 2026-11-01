package com.raisetimeline.backend.service;

import static com.raisetimeline.backend.ApiErrors.assertApiError;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.dto.SignupRequest;
import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    UserMapper userMapper;

    @Mock
    PasswordEncoder passwordEncoder;

    @InjectMocks
    AuthService service;

    private final SignupRequest request = new SignupRequest("a@example.com", "password1", "alice", "Alice");

    @Test
    void signupはパスワードをハッシュ化して保存し_採番されたユーザーを返す() {
        when(userMapper.existsByEmail("a@example.com")).thenReturn(false);
        when(userMapper.existsByHandle("alice")).thenReturn(false);
        when(passwordEncoder.encode("password1")).thenReturn("ENCODED");
        doAnswer(invocation -> {
            invocation.<User>getArgument(0).setId(10L);
            return null;
        }).when(userMapper).insert(any(User.class));

        User created = service.signup(request);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userMapper).insert(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getEmail()).isEqualTo("a@example.com");
        assertThat(saved.getHandle()).isEqualTo("alice");
        assertThat(saved.getDisplayName()).isEqualTo("Alice");
        assertThat(saved.getPasswordHash()).isEqualTo("ENCODED");
        assertThat(created.getId()).isEqualTo(10L);
    }

    @Test
    void signupはメールが登録済みなら409で_保存しない() {
        when(userMapper.existsByEmail("a@example.com")).thenReturn(true);

        assertApiError(() -> service.signup(request), HttpStatus.CONFLICT, AuthService.EMAIL_ALREADY_EXISTS);

        verify(userMapper, never()).insert(any());
    }

    @Test
    void signupはハンドルが使われていれば409で_保存しない() {
        when(userMapper.existsByEmail("a@example.com")).thenReturn(false);
        when(userMapper.existsByHandle("alice")).thenReturn(true);

        assertApiError(() -> service.signup(request), HttpStatus.CONFLICT, AuthService.HANDLE_ALREADY_EXISTS);

        verify(userMapper, never()).insert(any());
    }

    @Test
    void signupは同時登録で事前チェックをすり抜けても_メールの一意制約違反ならメール重複の409() {
        when(passwordEncoder.encode("password1")).thenReturn("ENCODED");
        doThrow(new DuplicateKeyException("duplicate key value violates unique constraint \"uq_users_email_lower\""))
                .when(userMapper).insert(any(User.class));

        assertApiError(() -> service.signup(request), HttpStatus.CONFLICT, AuthService.EMAIL_ALREADY_EXISTS);
    }

    @Test
    void signupは同時登録で事前チェックをすり抜けても_ハンドルの一意制約違反ならハンドル重複の409() {
        when(passwordEncoder.encode("password1")).thenReturn("ENCODED");
        doThrow(new DuplicateKeyException("duplicate key value violates unique constraint \"uq_users_handle_lower\""))
                .when(userMapper).insert(any(User.class));

        assertApiError(() -> service.signup(request), HttpStatus.CONFLICT, AuthService.HANDLE_ALREADY_EXISTS);
    }

    @Test
    void findByIdはMapperの結果をそのまま返す() {
        User user = new User();
        when(userMapper.findById(3L)).thenReturn(user);
        when(userMapper.findById(4L)).thenReturn(null);

        assertThat(service.findById(3L)).isSameAs(user);
        assertThat(service.findById(4L)).isNull();
    }
}
