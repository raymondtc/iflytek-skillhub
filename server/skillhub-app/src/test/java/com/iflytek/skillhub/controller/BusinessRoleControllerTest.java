package com.iflytek.skillhub.controller;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

import com.iflytek.skillhub.domain.namespace.NamespaceMemberRepository;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.dto.BusinessRolesResponse;
import com.iflytek.skillhub.service.BusinessRoleAppService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class BusinessRoleControllerTest {
    @Autowired MockMvc mvc;
    @MockBean BusinessRoleAppService service;
    @MockBean NamespaceMemberRepository namespaceMembers;

    @Test void publishesTheConfiguredKeyNameOptionsWithoutRequiringResourceData() throws Exception {
        for (String prefix : List.of("/api/v1", "/api/web")) {
            mvc.perform(get(prefix + "/business-roles/options")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.length()").value(4))
                    .andExpect(jsonPath("$.data[0].key").value("ExampleTeam-engineering"))
                    .andExpect(jsonPath("$.data[0].name").value("Engineering"))
                    .andExpect(jsonPath("$.data[1].key").value("ExampleTeam-sales"))
                    .andExpect(jsonPath("$.data[1].name").value("Sales"))
                    .andExpect(jsonPath("$.data[2].key").value("ExampleTeam-delivery"))
                    .andExpect(jsonPath("$.data[2].name").value("Support"))
                    .andExpect(jsonPath("$.data[3].key").value("ExampleTeam-leadership"))
                    .andExpect(jsonPath("$.data[3].name").value("Leadership"));
        }
        verifyNoInteractions(service);
    }

    @Test void supportsBothResourceRoutesAndRejectsAnonymousWrites() throws Exception {
        for (String prefix : List.of("/api/v1", "/api/web")) {
            for (String type : List.of("skills", "suites")) {
                String path = prefix + "/" + type + "/team/demo/business-roles";
                when(service.get(type, "team", "demo", null, Map.of(), Set.of()))
                        .thenReturn(new BusinessRolesResponse(List.of()));
                mvc.perform(get(path)).andExpect(status().isOk())
                        .andExpect(jsonPath("$.data.businessRoles").isEmpty());
                mvc.perform(put(path).with(csrf()).contentType("application/json")
                        .content("{\"businessRoles\":[]}"))
                        .andExpect(status().isUnauthorized());
                doThrow(new DomainForbiddenException("error.skill.access.denied")).when(service)
                        .get(type, "team", "private", null, Map.of(), Set.of());
                mvc.perform(get(prefix + "/" + type + "/team/private/business-roles"))
                        .andExpect(status().isForbidden());
            }
        }
        verify(service, never()).replace(any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test void publishesNewApiShapeInGeneratedOpenApi() throws Exception {
        byte[] schema = mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
                .andExpect(jsonPath("$.components.schemas.BusinessRolesRequest.properties.businessRoles.type").value("array"))
                .andExpect(jsonPath("$.components.schemas.BusinessRoleOption.required[0]").value("key"))
                .andExpect(jsonPath("$.components.schemas.BusinessRoleOption.required[1]").value("name"))
                .andExpect(jsonPath("$.paths['/api/v1/{resourceType}/{namespace}/{slug}/business-roles'].put").exists())
                .andReturn().getResponse().getContentAsByteArray();
        String output = System.getProperty("businessRoles.openapiOutput");
        if (output != null) Files.write(Path.of(output), schema);
    }
}
