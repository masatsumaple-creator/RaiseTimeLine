package com.raisetimeline.backend.logging;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * 認証が済んだあとに、ユーザー ID(JWT の sub)を MDC へ入れる。以降のログすべてに userId が付く。
 * 後始末は、外側の {@link RequestLoggingFilter} が、完了ログを出してから行う。
 * Bean にはせず、SecurityConfig がセキュリティのチェーンへ直接追加する(サーブレットのチェーンへ二重に登録されないように)。
 */
public class UserIdMdcFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt && jwt.getSubject() != null) {
            MDC.put(RequestLoggingFilter.MDC_USER_ID, jwt.getSubject());
        }
        chain.doFilter(request, response);
    }
}
