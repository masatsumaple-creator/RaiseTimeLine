package com.raisetimeline.backend.controller;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.JwtRequestPostProcessor;

/** Controller テストの共通部品。 */
final class WebTestSupport {

    private WebTestSupport() {
    }

    /** subject がユーザーID のログイン済みユーザーとしてリクエストする。 */
    static JwtRequestPostProcessor loggedInAs(long userId) {
        return jwt().jwt(token -> token.subject(String.valueOf(userId)));
    }

    /** SecurityConfig が必要とする UserDetailsService(Controller テストでは使わないので、常に見つからない扱い)。 */
    @TestConfiguration(proxyBeanMethods = false)
    static class TestBeans {

        @Bean
        UserDetailsService userDetailsService() {
            return username -> {
                throw new UsernameNotFoundException("not used in controller tests");
            };
        }
    }
}
