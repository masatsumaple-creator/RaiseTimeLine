package com.raisetimeline.backend;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** 画像の置き場を、S3 ではなくメモリ上の偽物に差し替える(テストから AWS に触れないようにする)。 */
@TestConfiguration(proxyBeanMethods = false)
public class FakeImageStorageConfiguration {

    @Bean
    @Primary
    FakeImageStorage fakeImageStorage() {
        return new FakeImageStorage();
    }
}
