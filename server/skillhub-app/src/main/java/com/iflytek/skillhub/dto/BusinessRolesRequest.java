package com.iflytek.skillhub.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/** Complete replacement; an empty array clears the container metadata. */
public record BusinessRolesRequest(@NotNull @Size(max = 128) List<String> businessRoles) {}
