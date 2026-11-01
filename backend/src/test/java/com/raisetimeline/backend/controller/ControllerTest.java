package com.raisetimeline.backend.controller;

import com.raisetimeline.backend.config.JwtConfig;
import com.raisetimeline.backend.config.SecurityConfig;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

/**
 * Controller の Web 層テストの共通設定。@WebMvcTest(対象の Controller) と一緒に付ける。
 * 本物の SecurityConfig(認証・認可)と JwtConfig(トークンの検証)、GlobalExceptionHandler(エラーの形)を載せ、
 * Service と DB はモックに置き換える。
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Import({SecurityConfig.class, JwtConfig.class, RefreshCookies.class, WebTestSupport.TestBeans.class})
@TestPropertySource(properties = {
        "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij",
        "app.jwt.expiration=15m",
        "app.refresh-token.expiration=7d",
        "app.refresh-token.cookie-secure=false",
        "app.refresh-token.reuse-grace=10s",
})
public @interface ControllerTest {
}
