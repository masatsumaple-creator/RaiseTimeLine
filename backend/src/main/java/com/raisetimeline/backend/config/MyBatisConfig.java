package com.raisetimeline.backend.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

@Configuration
@MapperScan("com.raisetimeline.backend.mapper")
public class MyBatisConfig {
}
