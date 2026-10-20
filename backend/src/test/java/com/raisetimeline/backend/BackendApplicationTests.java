package com.raisetimeline.backend;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "app.jwt.secret=test-only-jwt-secret-0123456789-abcdefghij")
class BackendApplicationTests {

    @Test
    void contextLoads() {
    }
}
