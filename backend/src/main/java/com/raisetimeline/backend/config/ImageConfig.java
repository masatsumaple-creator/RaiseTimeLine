package com.raisetimeline.backend.config;

import com.raisetimeline.backend.service.ImageStorage;
import com.raisetimeline.backend.service.S3ImageStorage;
import com.raisetimeline.backend.service.UnconfiguredImageStorage;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(S3Properties.class)
public class ImageConfig {

    /** バケットが設定されていれば S3、なければ「使えない」置き場(画像の操作は 503)。 */
    @Bean
    ImageStorage imageStorage(S3Properties properties) {
        return properties.enabled() ? new S3ImageStorage(properties) : new UnconfiguredImageStorage();
    }
}
