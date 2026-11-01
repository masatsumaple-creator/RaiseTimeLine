package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.dto.UploadUrlRequest;
import com.raisetimeline.backend.dto.UploadUrlResponse;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.ImagePurpose;
import com.raisetimeline.backend.service.ImageService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ImageController.class)
@ControllerTest
class ImageControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    ImageService imageService;

    @Test
    void uploadUrlは用途と形式と大きさをServiceに渡し_署名付きURLを返す() throws Exception {
        when(imageService.createUploadUrl(eq(5L), any()))
                .thenReturn(new UploadUrlResponse("https://s3.example.com/put", "post/5/x.png", 300));

        mockMvc.perform(post("/api/images/upload-url").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"post\",\"contentType\":\"image/png\",\"size\":1024}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.uploadUrl").value("https://s3.example.com/put"))
                .andExpect(jsonPath("$.imageKey").value("post/5/x.png"))
                .andExpect(jsonPath("$.expiresIn").value(300));

        ArgumentCaptor<UploadUrlRequest> captor = ArgumentCaptor.forClass(UploadUrlRequest.class);
        verify(imageService).createUploadUrl(eq(5L), captor.capture());
        assertThat(captor.getValue().purpose()).isEqualTo(ImagePurpose.POST);
        assertThat(captor.getValue().contentType()).isEqualTo("image/png");
        assertThat(captor.getValue().size()).isEqualTo(1024L);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"contentType\":\"image/png\",\"size\":1024}",
            "{\"purpose\":\"post\",\"size\":1024}",
            "{\"purpose\":\"post\",\"contentType\":\"\",\"size\":1024}",
            "{\"purpose\":\"post\",\"contentType\":\"image/png\"}",
            "{}",
    })
    void uploadUrlは必須項目が欠けていたら400で_Serviceを呼ばない(String json) throws Exception {
        mockMvc.perform(post("/api/images/upload-url").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"))
                .andExpect(jsonPath("$.fieldErrors").isNotEmpty());

        verifyNoInteractions(imageService);
    }

    @Test
    void uploadUrlは用途が不明な値なら400() throws Exception {
        mockMvc.perform(post("/api/images/upload-url").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"unknown\",\"contentType\":\"image/png\",\"size\":1}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));

        verifyNoInteractions(imageService);
    }

    @Test
    void uploadUrlは画像機能が無効な環境ではServiceの503をそのまま返す() throws Exception {
        when(imageService.createUploadUrl(eq(5L), any()))
                .thenThrow(new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "IMAGES_UNAVAILABLE", "無効"));

        mockMvc.perform(post("/api/images/upload-url").with(loggedInAs(5)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"avatar\",\"contentType\":\"image/png\",\"size\":1}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("IMAGES_UNAVAILABLE"));
    }

    @Test
    void uploadUrlはログインしていなければ401() throws Exception {
        mockMvc.perform(post("/api/images/upload-url").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\":\"post\",\"contentType\":\"image/png\",\"size\":1}"))
                .andExpect(status().isUnauthorized());

        verifyNoInteractions(imageService);
    }
}
