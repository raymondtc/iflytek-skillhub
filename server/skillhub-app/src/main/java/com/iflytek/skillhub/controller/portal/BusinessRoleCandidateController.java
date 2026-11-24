package com.iflytek.skillhub.controller.portal;

import com.iflytek.skillhub.controller.BaseApiController;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.dto.ApiResponse;
import com.iflytek.skillhub.dto.ApiResponseFactory;
import com.iflytek.skillhub.service.BusinessRoleDiscoveryAppService;
import io.swagger.v3.oas.annotations.Operation;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping({"/api/v1/business-roles", "/api/web/business-roles"})
public class BusinessRoleCandidateController extends BaseApiController {
    private final BusinessRoleDiscoveryAppService service;
    public BusinessRoleCandidateController(BusinessRoleDiscoveryAppService service, ApiResponseFactory responses) {
        super(responses); this.service = service;
    }
    @GetMapping
    @Operation(operationId = "listVisibleBusinessRoles", summary = "Find role keys on currently discoverable resources")
    public ApiResponse<List<String>> candidates(@RequestParam(required = false) String resourceType,
            @RequestParam(required = false) String namespace, @RequestParam(required = false) String q,
            @RequestAttribute(value = "userNsRoles", required = false) Map<Long, NamespaceRole> roles) {
        return ok("response.success.read", service.candidates(resourceType, namespace, q,
                roles == null ? Set.of() : roles.keySet()));
    }
}
