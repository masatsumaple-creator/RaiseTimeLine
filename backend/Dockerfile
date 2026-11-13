# ビルド: Gradle で実行可能 JAR を作る(テストは CI で実行済みなので省く)
FROM eclipse-temurin:25-jdk AS build
WORKDIR /app
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY config config
COPY src src
RUN ./gradlew --no-daemon bootJar -x test -x checkstyleMain -x checkstyleTest -x spotbugsMain -x spotbugsTest

# 実行: JRE だけの軽いイメージ。root では動かさない
FROM eclipse-temurin:25-jre
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build /app/build/libs/app.jar app.jar
USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
