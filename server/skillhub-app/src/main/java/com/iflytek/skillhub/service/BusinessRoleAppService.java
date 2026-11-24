package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.audit.AuditDetail;
import com.iflytek.skillhub.domain.audit.AuditLogService;
import com.iflytek.skillhub.domain.namespace.NamespaceRepository;
import com.iflytek.skillhub.domain.namespace.NamespaceRole;
import com.iflytek.skillhub.domain.shared.BusinessRoles;
import com.iflytek.skillhub.domain.shared.exception.DomainForbiddenException;
import com.iflytek.skillhub.domain.shared.exception.DomainNotFoundException;
import com.iflytek.skillhub.domain.skill.Skill;
import com.iflytek.skillhub.domain.skill.service.SkillQueryService;
import com.iflytek.skillhub.domain.skill.service.SkillSlugResolutionService;
import com.iflytek.skillhub.domain.suite.*;
import com.iflytek.skillhub.dto.BusinessRolesResponse;
import com.iflytek.skillhub.observability.RequestIdAccessor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Coordinates container metadata with existing detail visibility and management policies.
 * Direct EntityManager locking deliberately serializes replacement of the element collection;
 * roles are loaded only after locking, so concurrent replacements cannot merge or lose rows.
 */
@Service
public class BusinessRoleAppService {
    private final NamespaceRepository namespaces;
    private final SkillSlugResolutionService skillResolver;
    private final SkillSuiteRepository suites;
    private final SkillQueryService skillQuery;
    private final SkillSuiteQueryService suiteQuery;
    private final EntityManager entityManager;
    private final AuditLogService audit;
    private final RequestIdAccessor requestId;

    public BusinessRoleAppService(NamespaceRepository namespaces, SkillSlugResolutionService skillResolver,
            SkillSuiteRepository suites, SkillQueryService skillQuery, SkillSuiteQueryService suiteQuery,
            EntityManager entityManager, AuditLogService audit, RequestIdAccessor requestId) {
        this.namespaces = namespaces;
        this.skillResolver = skillResolver;
        this.suites = suites;
        this.skillQuery = skillQuery;
        this.suiteQuery = suiteQuery;
        this.entityManager = entityManager;
        this.audit = audit;
        this.requestId = requestId;
    }

    @Transactional(readOnly = true)
    public BusinessRolesResponse get(String resourceType, String namespace, String slug,
            String userId, Map<Long, NamespaceRole> roles, Set<String> platformRoles) {
        Long nsId = namespaceId(namespace);
        if ("skills".equals(resourceType)) {
            Skill skill = skill(nsId, slug, userId);
            if (!canManage(skill, userId, roles, platformRoles)) {
                skillQuery.getSkillDetail(namespace, slug, userId, roles, platformRoles);
            }
            return new BusinessRolesResponse(skill.getBusinessRoles(), canManage(skill, userId, roles, platformRoles));
        }
        SkillSuite suite = suite(nsId, slug);
        if (!canManage(suite, userId, roles, platformRoles)) {
            suiteQuery.getDetail(namespace, slug, null, userId, roles, platformRoles);
        }
        return new BusinessRolesResponse(suite.getBusinessRoles(), canManage(suite, userId, roles, platformRoles));
    }

    @Transactional
    public BusinessRolesResponse replace(String resourceType, String namespace, String slug,
            List<String> values, String userId, Map<Long, NamespaceRole> roles,
            Set<String> platformRoles, AuditRequestContext context) {
        List<String> normalized = BusinessRoles.normalize(values);
        Long nsId = namespaceId(namespace);
        Long id;
        List<String> before;
        String auditType;
        if ("skills".equals(resourceType)) {
            Skill skill = skill(nsId, slug, userId);
            require(userId != null && canManage(skill, userId, roles, platformRoles));
            entityManager.lock(skill, LockModeType.PESSIMISTIC_WRITE);
            before = skill.getBusinessRoles();
            skill.setBusinessRoles(normalized);
            id = skill.getId();
            auditType = "SKILL";
        } else {
            SkillSuite suite = suite(nsId, slug);
            require(userId != null && canManage(suite, userId, roles, platformRoles));
            entityManager.lock(suite, LockModeType.PESSIMISTIC_WRITE);
            before = suite.getBusinessRoles();
            suite.setBusinessRoles(normalized);
            id = suite.getId();
            auditType = "SKILL_SUITE";
        }
        audit.record(userId, "BUSINESS_ROLES_REPLACE", auditType, id, requestId.current(),
                context == null ? null : context.clientIp(), context == null ? null : context.userAgent(),
                AuditDetail.of("before", before, "businessRoles", normalized));
        return new BusinessRolesResponse(normalized, true);
    }

    private Long namespaceId(String slug) {
        return namespaces.findBySlug(slug)
                .orElseThrow(() -> new DomainNotFoundException("namespace.not_found", slug)).getId();
    }
    private Skill skill(Long nsId, String slug, String userId) {
        return skillResolver.resolve(nsId, slug, userId, SkillSlugResolutionService.Preference.CURRENT_USER);
    }
    private SkillSuite suite(Long nsId, String slug) {
        return suites.findByNamespaceIdAndSlug(nsId, slug)
                .orElseThrow(() -> new DomainNotFoundException("error.suite.notFound", slug));
    }
    private boolean canManage(Skill skill, String userId, Map<Long, NamespaceRole> roles, Set<String> platformRoles) {
        NamespaceRole role = roles.get(skill.getNamespaceId());
        return userId != null && (platformRoles.contains("SUPER_ADMIN") || userId.equals(skill.getOwnerId())
                || role == NamespaceRole.OWNER || role == NamespaceRole.ADMIN);
    }
    private boolean canManage(SkillSuite suite, String userId, Map<Long, NamespaceRole> roles, Set<String> platformRoles) {
        return userId != null && SkillSuiteAuthorizationPolicy.canCreateVersion(suite,
                new SkillSuiteActionContext(userId, roles, platformRoles, null, null, null));
    }
    private void require(boolean allowed) {
        if (!allowed) throw new DomainForbiddenException("business_role.forbidden");
    }
}
