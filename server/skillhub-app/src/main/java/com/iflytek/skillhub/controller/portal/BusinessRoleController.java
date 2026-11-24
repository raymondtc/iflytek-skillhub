package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.dto.*;
import com.iflytek.skillhub.service.AuditRequestContext;
import com.iflytek.skillhub.service.BusinessRoleAppService;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.Set;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

/** Business discovery metadata is separate from platform and namespace RBAC. */
@RestController
@RequestMapping({"/api/v1/{resourceType:skills|suites}/{namespace}/{slug}/business-roles",
        "/api/web/{resourceType:skills|suites}/{namespace}/{slug}/business-roles"})
public class BusinessRoleController extends BaseApiController {
    private final BusinessRoleAppService service;
    public BusinessRoleController(BusinessRoleAppService service, ApiResponseFactory responseFactory) {
        super(responseFactory);
        this.service = service;
    }

    @GetMapping
    @Operation(operationId = "getBusinessRoles", summary = "Read visible Skill or Suite business role keys")
    public ApiResponse<BusinessRolesResponse> get(@PathVariable String resourceType,
            @PathVariable String namespace, @PathVariable String slug,
            @RequestAttribute(value = "userId", required = false) String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal) {
        return ok("response.success.read", service.get(resourceType, namespace, slug, userId,
                roles == null ? Map.of() : roles, platformRoles(principal)));
    }

    @PutMapping
    @Operation(operationId = "replaceBusinessRoles", summary = "Replace all business roles; [] clears them")
    public ApiResponse<BusinessRolesResponse> replace(@PathVariable String resourceType,
            @PathVariable String namespace, @PathVariable String slug,
            @Valid @RequestBody BusinessRolesRequest body,
            @RequestAttribute("userId") String userId,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles,
            @AuthenticationPrincipal PlatformPrincipal principal, HttpServletRequest request) {
        return ok("response.success.updated", service.replace(resourceType, namespace, slug,
                body.businessRoles(), userId, roles == null ? Map.of() : roles,
                platformRoles(principal), AuditRequestContext.from(request)));
    }

    private Set<String> platformRoles(PlatformPrincipal principal) {
        return principal == null || principal.platformRoles() == null ? Set.of() : principal.platformRoles();
    }
}
