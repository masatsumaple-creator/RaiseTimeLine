package com.raisetimeline.backend.controller;

import static com.raisetimeline.backend.controller.WebTestSupport.loggedInAs;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.raisetimeline.backend.dto.UserListResponse;
import com.raisetimeline.backend.dto.UserSummaryResponse;
import com.raisetimeline.backend.exception.ApiException;
import com.raisetimeline.backend.service.UserService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(SearchController.class)
@ControllerTest
class SearchControllerTest {

    @Autowired
    MockMvc mockMvc;

    @MockitoBean
    UserService userService;

    @Test
    void usersは検索語とページングをServiceに渡して結果を返す() throws Exception {
        when(userService.search(5L, "taro", "c", 10)).thenReturn(new UserListResponse(
                List.of(new UserSummaryResponse(2L, "taro", "Taro", null, null, true, false)), "n"));

        mockMvc.perform(get("/api/search/users").param("q", "taro").param("cursor", "c").param("limit", "10")
                        .with(loggedInAs(5)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].handle").value("taro"))
                .andExpect(jsonPath("$.items[0].followedByMe").value(true))
                .andExpect(jsonPath("$.nextCursor").value("n"));
    }

    @Test
    void usersは検索語が無くてもServiceに渡し_Serviceの400をそのまま返す() throws Exception {
        when(userService.search(5L, null, null, null))
                .thenThrow(new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "検索語を入力してください"));

        mockMvc.perform(get("/api/search/users").with(loggedInAs(5)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void usersはログインしていなければ401() throws Exception {
        mockMvc.perform(get("/api/search/users").param("q", "taro")).andExpect(status().isUnauthorized());

        verifyNoInteractions(userService);
    }
}
