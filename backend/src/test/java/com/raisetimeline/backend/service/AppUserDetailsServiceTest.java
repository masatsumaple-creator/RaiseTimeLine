package com.raisetimeline.backend.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.mapper.UserMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

@ExtendWith(MockitoExtension.class)
class AppUserDetailsServiceTest {

    @Mock
    UserMapper userMapper;

    @InjectMocks
    AppUserDetailsService service;

    @Test
    void メールでユーザーを見つけ_IDとパスワードハッシュを持つUserDetailsを返す() {
        User user = new User();
        user.setId(5L);
        user.setEmail("a@example.com");
        user.setPasswordHash("HASH");
        when(userMapper.findByEmail("a@example.com")).thenReturn(user);

        UserDetails details = service.loadUserByUsername("a@example.com");

        assertThat(details).isInstanceOf(AppUserDetails.class);
        assertThat(((AppUserDetails) details).getId()).isEqualTo(5L);
        assertThat(details.getPassword()).isEqualTo("HASH");
        assertThat(details.getUsername()).isEqualTo("a@example.com");
    }

    @Test
    void ユーザーがいなければUsernameNotFoundException() {
        when(userMapper.findByEmail("none@example.com")).thenReturn(null);

        assertThatThrownBy(() -> service.loadUserByUsername("none@example.com"))
                .isInstanceOf(UsernameNotFoundException.class);
    }
}
