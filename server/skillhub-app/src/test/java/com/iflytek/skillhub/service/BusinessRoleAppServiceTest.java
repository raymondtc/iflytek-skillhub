package com.iflytek.skillhub.service;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.iflytek.skillhub.domain.audit.AuditLogService;
import com.iflytek.skillhub.domain.namespace.*;
import com.iflytek.skillhub.domain.shared.BusinessRoles;
import com.iflytek.skillhub.domain.shared.exception.*;
import com.iflytek.skillhub.domain.skill.*;
import com.iflytek.skillhub.domain.skill.service.*;
import com.iflytek.skillhub.domain.suite.*;
import com.iflytek.skillhub.observability.RequestIdAccessor;
import jakarta.persistence.EntityManager;
import java.util.*;
import org.junit.jupiter.api.Test;

class BusinessRoleAppServiceTest {
    private final NamespaceRepository namespaces = mock(NamespaceRepository.class);
    private final SkillRepository skills = mock(SkillRepository.class);
    private final SkillSuiteRepository suites = mock(SkillSuiteRepository.class);
    private final SkillQueryService skillQuery = mock(SkillQueryService.class);
    private final SkillSuiteQueryService suiteQuery = mock(SkillSuiteQueryService.class);
    private final EntityManager em = mock(EntityManager.class);
    private final AuditLogService audit = mock(AuditLogService.class);
    private final BusinessRoleAppService service = new BusinessRoleAppService(namespaces,
            new SkillSlugResolutionService(skills), suites, skillQuery, suiteQuery, em, audit,
            mock(RequestIdAccessor.class));

    private void seed(Skill skill, SkillSuite suite) {
        Namespace ns = mock(Namespace.class);
        when(ns.getId()).thenReturn(10L);
        when(namespaces.findBySlug("team")).thenReturn(Optional.of(ns));
        when(skills.findByNamespaceIdAndSlug(10L, "demo")).thenReturn(List.of(skill));
        when(suites.findByNamespaceIdAndSlug(10L, "demo")).thenReturn(Optional.of(suite));
    }

    @Test void validatesStableKeysAndNormalizesWithoutMutatingOnFailure() {
        assertThat(BusinessRoles.normalize(List.of("sales", "support", "sales")))
                .containsExactly("sales", "support");
        for (String key : List.of("", "Sales", "sales%", " sales", "sales/owner", "a".repeat(65))) {
            assertThatThrownBy(() -> BusinessRoles.normalize(List.of(key))).isInstanceOf(DomainBadRequestException.class);
        }
        assertThatThrownBy(() -> BusinessRoles.normalize(null)).isInstanceOf(DomainBadRequestException.class);
        assertThatThrownBy(() -> BusinessRoles.normalize(java.util.stream.IntStream.range(0, 33)
                .mapToObj(i -> "role" + i).toList())).isInstanceOf(DomainBadRequestException.class);
        Skill skill = new Skill(10L, "demo", "owner", SkillVisibility.PUBLIC);
        skill.setBusinessRoles(List.of("sales"));
        assertThatThrownBy(() -> skill.setBusinessRoles(List.of("bad key"))).isInstanceOf(DomainBadRequestException.class);
        assertThat(skill.getBusinessRoles()).containsExactly("sales");
    }

    @Test void managesBothContainersAndClearsWithoutChangingPublishedPointers() {
        Skill skill = new Skill(10L, "demo", "owner", SkillVisibility.PUBLIC);
        skill.setLatestVersionId(100L);
        SkillSuite suite = new SkillSuite(10L, "demo", "Demo", "owner");
        suite.setLatestVersionId(200L);
        seed(skill, suite);
        assertThat(skill.getBusinessRoles()).isEmpty();
        assertThat(suite.getBusinessRoles()).isEmpty();
        for (String type : List.of("skills", "suites")) {
            assertThat(service.replace(type, "team", "demo", List.of("support", "sales", "sales"),
                    "owner", Map.of(10L, NamespaceRole.MEMBER), Set.of(), null).businessRoles())
                    .containsExactly("sales", "support");
            assertThat(service.get(type, "team", "demo", "owner", Map.of(10L, NamespaceRole.MEMBER), Set.of())
                    .businessRoles()).containsExactly("sales", "support");
            service.replace(type, "team", "demo", List.of(), "admin", Map.of(), Set.of("SUPER_ADMIN"), null);
            assertThat(service.get(type, "team", "demo", "admin", Map.of(), Set.of("SUPER_ADMIN"))
                    .businessRoles()).isEmpty();
        }
        assertThat(skill.getLatestVersionId()).isEqualTo(100L);
        assertThat(suite.getLatestVersionId()).isEqualTo(200L);
    }

    @Test void rejectsUnprivilegedAndAnonymousWritesWithoutLocksOrAudit() {
        Skill skill = new Skill(10L, "demo", "owner", SkillVisibility.PUBLIC);
        skill.setLatestVersionId(1L);
        SkillSuite suite = new SkillSuite(10L, "demo", "Demo", "owner");
        seed(skill, suite);
        for (String type : List.of("skills", "suites")) {
            for (String actor : Arrays.asList(null, "stranger")) {
                assertThatThrownBy(() -> service.replace(type, "team", "demo", List.of("sales"), actor,
                        Map.of(20L, NamespaceRole.OWNER), Set.of("SKILL_ADMIN"), null))
                        .isInstanceOf(DomainForbiddenException.class);
            }
        }
        assertThat(skill.getBusinessRoles()).isEmpty();
        assertThat(suite.getBusinessRoles()).isEmpty();
        verifyNoInteractions(em, audit);
    }

    @Test void delegatesReadVisibilityAndDoesNotReturnPrivateRoles() {
        Skill skill = new Skill(10L, "demo", "owner", SkillVisibility.PRIVATE);
        skill.setLatestVersionId(1L);
        skill.setBusinessRoles(List.of("sales"));
        SkillSuite suite = new SkillSuite(10L, "demo", "Demo", "owner");
        suite.setBusinessRoles(List.of("sales"));
        seed(skill, suite);
        when(skillQuery.getSkillDetail("team", "demo", "stranger", Map.of(), Set.of()))
                .thenThrow(new DomainForbiddenException("error.skill.access.denied"));
        when(suiteQuery.getDetail("team", "demo", null, "stranger", Map.of(), Set.of()))
                .thenThrow(new DomainForbiddenException("error.skill.access.denied"));
        for (String type : List.of("skills", "suites")) {
            assertThatThrownBy(() -> service.get(type, "team", "demo", "stranger", Map.of(), Set.of()))
                    .isInstanceOf(DomainForbiddenException.class);
        }
    }

    @Test void namespaceAdminCanManageBothButSuiteCreatorNeedsCurrentMembership() {
        Skill skill = new Skill(10L, "demo", "owner", SkillVisibility.PUBLIC);
        skill.setLatestVersionId(1L);
        SkillSuite suite = new SkillSuite(10L, "demo", "Demo", "owner");
        seed(skill, suite);
        for (String type : List.of("skills", "suites")) {
            service.replace(type, "team", "demo", List.of("support"), "ns-admin",
                    Map.of(10L, NamespaceRole.ADMIN), Set.of(), null);
        }
        assertThatThrownBy(() -> service.replace("suites", "team", "demo", List.of(), "owner",
                Map.of(), Set.of(), null)).isInstanceOf(DomainForbiddenException.class);
        assertThat(suite.getBusinessRoles()).containsExactly("support");
    }
}
