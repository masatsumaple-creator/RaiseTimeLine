package com.raisetimeline.backend.config;

import com.raisetimeline.backend.dto.ErrorResponse;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Operation;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** API 仕様(OpenAPI)の共通部分。個々のエンドポイントの内容は、Controller と DTO から自動で作られる。 */
@Configuration
public class OpenApiConfig {

    static final String BEARER_SCHEME = "bearerAuth";

    /** アクセストークンなしで呼べるエンドポイント(SecurityConfig の permitAll と揃える)。 */
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "/api/auth/signup", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout");

    // 仕様書を毎回同じ内容で生成できるよう、順序の決まる Map にする(Map.of は実行ごとに並びが変わる)
    private static final Map<String, String> COMMON_ERRORS = new LinkedHashMap<>();

    static {
        COMMON_ERRORS.put("400", "入力値が不正です");
        COMMON_ERRORS.put("401", "ログインが必要です");
        COMMON_ERRORS.put("403", "この操作は許可されていません");
        COMMON_ERRORS.put("404", "対象が見つかりません");
    }

    @Bean
    OpenAPI openApi() {
        return new OpenAPI()
                .info(new Info()
                        .title("RaiseTimeLine API")
                        .description("RaiseTimeLine のバックエンド API。認証が必要な API は、右上の Authorize にアクセストークンを入れて試せる。")
                        .version("v1"))
                .components(new Components().addSecuritySchemes(BEARER_SCHEME, new SecurityScheme()
                        .type(SecurityScheme.Type.HTTP)
                        .scheme("bearer")
                        .bearerFormat("JWT")))
                // 既定は認証必須。認証不要のものだけ、下の customizer で外す
                .addSecurityItem(new SecurityRequirement().addList(BEARER_SCHEME));
    }

    /** 認証不要の API から鍵を外し、共通のエラー応答(ErrorResponse)を全エンドポイントに付ける。 */
    @Bean
    OpenApiCustomizer commonResponsesCustomizer() {
        return openApi -> {
            Schema<?> errorSchema = errorSchema(openApi);
            if (openApi.getPaths() == null) {
                return;
            }
            openApi.getPaths().forEach((path, item) -> item.readOperationsMap().forEach((method, operation) -> {
                if (PUBLIC_PATHS.contains(path)) {
                    operation.setSecurity(List.of());
                }
                COMMON_ERRORS.forEach((status, description) -> {
                    // 認証不要の API に 401/403 は付けない(refresh の 401 は Controller 側で個別に記述できる)
                    boolean authOnly = status.equals("401") || status.equals("403");
                    if (authOnly && PUBLIC_PATHS.contains(path)) {
                        return;
                    }
                    addErrorResponse(operation, status, description, errorSchema);
                });
            }));
        };
    }

    private static Schema<?> errorSchema(OpenAPI openApi) {
        Map<String, Schema> resolved = ModelConverters.getInstance().read(ErrorResponse.class);
        Components components = openApi.getComponents();
        resolved.forEach(components::addSchemas);
        return new Schema<>().$ref("#/components/schemas/ErrorResponse");
    }

    private static void addErrorResponse(Operation operation, String status, String description, Schema<?> schema) {
        if (operation.getResponses().containsKey(status)) {
            return;
        }
        operation.getResponses().addApiResponse(status, new ApiResponse()
                .description(description)
                .content(new Content().addMediaType("application/json", new MediaType().schema(schema))));
    }
}
