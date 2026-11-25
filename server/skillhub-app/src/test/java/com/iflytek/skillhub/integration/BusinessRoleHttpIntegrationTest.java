package com.iflytek.skillhub.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.iflytek.skillhub.TestRedisConfig;
import com.iflytek.skillhub.auth.rbac.PlatformPrincipal;
import com.iflytek.skillhub.domain.namespace.*;
import com.iflytek.skillhub.domain.skill.*;
import com.iflytek.skillhub.domain.suite.*;
import com.iflytek.skillhub.domain.user.*;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestRedisConfig.class)
@Testcontainers
@Transactional
class BusinessRoleHttpIntegrationTest {
    @Container static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");
    @DynamicPropertySource static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.jpa.database-platform", () -> "org.hibernate.dialect.PostgreSQLDialect");
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.jpa.hibernate.ddl-auto", () -> "validate");
    }
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;

    @Test void realHttpAndPersistenceSupportBothResourcesAndDenySourceViolations() throws Exception {
        em.persist(new UserAccount("role-owner", "Owner", null, null));
        em.persist(new UserAccount("role-outsider", "Outsider", null, null));
        Namespace ns = new Namespace("role-http", "HTTP", "role-owner");
        em.persist(ns);
        em.persist(new NamespaceMember(ns.getId(), "role-owner", NamespaceRole.OWNER));
        Skill skill = new Skill(ns.getId(), "demo", "role-owner", SkillVisibility.PRIVATE);
        em.persist(skill);
        SkillVersion skillVersion = new SkillVersion(skill.getId(), "1.0.0", "role-owner");
        skillVersion.setStatus(SkillVersionStatus.PUBLISHED);
        skillVersion.setDownloadReady(true);
        em.persist(skillVersion);
        skill.setLatestVersionId(skillVersion.getId());
        SkillSuite suite = new SkillSuite(ns.getId(), "demo", "Demo", "role-owner");
        em.persist(suite);
        SkillSuiteVersion suiteVersion = new SkillSuiteVersion(suite.getId(), "1.0.0", SkillVisibility.PRIVATE, "role-owner");
        suiteVersion.setStatus(SkillSuiteVersionStatus.PUBLISHED);
        em.persist(suiteVersion);
        suite.setLatestVersionId(suiteVersion.getId());
        em.flush();

        for (String type : List.of("skills", "suites")) {
            String path = "/api/v1/" + type + "/role-http/demo/business-roles";
            mvc.perform(get(path).with(authentication(actor("role-owner", Set.of()))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.businessRoles").isEmpty());
            mvc.perform(put(path).with(authentication(actor("role-owner", Set.of()))).with(csrf())
                    .contentType("application/json").content("{\"businessRoles\":[\"ExampleTeam-sales\",\"ExampleTeam-delivery\",\"ExampleTeam-sales\"]}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.businessRoles[0]").value("ExampleTeam-delivery"))
                    .andExpect(jsonPath("$.data.businessRoles.length()").value(2));
            em.flush();
            mvc.perform(get(path)).andExpect(status().isForbidden());
            mvc.perform(get(path).with(authentication(actor("role-outsider", Set.of()))))
                    .andExpect(status().isForbidden());
            mvc.perform(put(path).with(authentication(actor("role-outsider", Set.of()))).with(csrf())
                    .contentType("application/json").content("{\"businessRoles\":[]}"))
                    .andExpect(status().isForbidden());
            mvc.perform(put(path).with(authentication(actor("role-owner", Set.of()))).with(csrf())
                    .contentType("application/json").content("{}"))
                    .andExpect(status().isBadRequest());
            mvc.perform(put(path).with(authentication(actor("role-owner", Set.of()))).with(csrf())
                    .contentType("application/json").content("{\"businessRoles\":[\"exampleteam-sales\"]}"))
                    .andExpect(status().isBadRequest());
            mvc.perform(get(path).with(authentication(actor("role-owner", Set.of()))))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.businessRoles.length()").value(2));
            mvc.perform(put(path).with(authentication(actor("role-outsider", Set.of("SUPER_ADMIN")))).with(csrf())
                    .contentType("application/json").content("{\"businessRoles\":[]}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.data.businessRoles").isEmpty());
        }
        em.flush(); em.clear();
        assertThat(em.find(Skill.class, skill.getId()).getBusinessRoles()).isEmpty();
        assertThat(em.find(SkillSuite.class, suite.getId()).getBusinessRoles()).isEmpty();
        assertThat(em.find(Skill.class, skill.getId()).getLatestVersionId()).isEqualTo(skillVersion.getId());
        assertThat(em.find(SkillSuite.class, suite.getId()).getLatestVersionId()).isEqualTo(suiteVersion.getId());
        assertThat(((Number) em.createNativeQuery("SELECT COUNT(*) FROM audit_log WHERE action='BUSINESS_ROLES_REPLACE'")
                .getSingleResult()).intValue()).isEqualTo(4);
    }
    private UsernamePasswordAuthenticationToken actor(String userId, Set<String> roles) {
        return new UsernamePasswordAuthenticationToken(new PlatformPrincipal(userId, userId, null, null, null, roles),
                null, List.of(new SimpleGrantedAuthority("ROLE_USER")));
    }
}
