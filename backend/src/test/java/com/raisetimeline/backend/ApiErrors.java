package com.raisetimeline.backend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.raisetimeline.backend.exception.ApiException;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.springframework.http.HttpStatus;

/** ApiException が、期待したステータスとコードで投げられることを確かめる。 */
public final class ApiErrors {

    private ApiErrors() {
    }

    public static ApiException assertApiError(ThrowingCallable action, HttpStatus status, String code) {
        ApiException[] thrown = new ApiException[1];
        assertThatThrownBy(action).isInstanceOfSatisfying(ApiException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
            thrown[0] = e;
        });
        return thrown[0];
    }
}
