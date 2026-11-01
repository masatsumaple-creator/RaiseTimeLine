package com.raisetimeline.backend.mapper;

import com.raisetimeline.backend.TestcontainersConfiguration;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;

/**
 * Mapper(SQL)を、使い捨ての PostgreSQL コンテナに対して検証するテストの共通設定。
 * マイグレーション(Flyway)も実際に流れる。各テストはトランザクション内で動き、終わると自動で巻き戻るので、テスト同士は影響しない。
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@MybatisTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TestcontainersConfiguration.class, MapperTestData.class})
public @interface MapperTest {
}
