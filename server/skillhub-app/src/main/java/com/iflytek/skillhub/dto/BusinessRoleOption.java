package com.iflytek.skillhub.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record BusinessRoleOption(
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String key,
        @Schema(requiredMode = Schema.RequiredMode.REQUIRED) String name) {}
