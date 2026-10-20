package com.raisetimeline.backend.service;

import com.raisetimeline.backend.entity.User;
import com.raisetimeline.backend.mapper.UserMapper;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserMapper userMapper;

    public AppUserDetailsService(UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        User user = userMapper.findByEmail(email);
        if (user == null) {
            throw new UsernameNotFoundException("user not found");
        }
        return new AppUserDetails(user);
    }
}
