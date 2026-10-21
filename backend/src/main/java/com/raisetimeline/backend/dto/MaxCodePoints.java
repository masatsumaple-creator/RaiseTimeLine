package com.raisetimeline.backend.dto;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** 文字数を Unicode コードポイントで数える(絵文字などのサロゲートペアを 1 文字として扱う)。 */
@Documented
@Constraint(validatedBy = MaxCodePoints.Validator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface MaxCodePoints {

    int value();

    String message() default "文字数が多すぎます";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class Validator implements ConstraintValidator<MaxCodePoints, String> {

        private int max;

        @Override
        public void initialize(MaxCodePoints annotation) {
            this.max = annotation.value();
        }

        @Override
        public boolean isValid(String value, ConstraintValidatorContext context) {
            return value == null || value.codePointCount(0, value.length()) <= max;
        }
    }
}
