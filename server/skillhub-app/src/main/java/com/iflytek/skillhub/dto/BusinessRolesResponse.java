package com.iflytek.skillhub.dto;

import java.util.List;

public record BusinessRolesResponse(List<String> businessRoles, boolean canManageBusinessRoles) {
    public BusinessRolesResponse(List<String> businessRoles) { this(businessRoles, false); }
}
