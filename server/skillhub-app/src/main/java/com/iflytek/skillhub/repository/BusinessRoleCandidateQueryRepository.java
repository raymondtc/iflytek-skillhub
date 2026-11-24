package com.iflytek.skillhub.repository;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only facets over authoritative source ACLs, before any result pagination.
 * Native SQL deliberately unions two resource types without loading aggregates or leaking private keys.
 */
@Repository
public class BusinessRoleCandidateQueryRepository {
    private final EntityManager entityManager;
    public BusinessRoleCandidateQueryRepository(EntityManager entityManager) { this.entityManager = entityManager; }

    @Transactional(readOnly = true)
    public List<String> findVisible(String type, String namespace, String prefix, Set<Long> members) {
        @SuppressWarnings("unchecked")
        List<String> keys = entityManager.createNativeQuery("""
                SELECT DISTINCT role_key FROM (
                    SELECT br.role_key FROM company_skill_business_role br
                    JOIN skill s ON s.id = br.skill_id
                    JOIN namespace n ON n.id = s.namespace_id
                    JOIN skill_version v ON v.id = s.latest_version_id
                    WHERE (:type = '' OR :type = 'SKILL')
                      AND (:namespace = '' OR n.slug = :namespace)
                      AND n.status <> 'ARCHIVED' AND s.status = 'ACTIVE' AND s.hidden = FALSE
                      AND v.status = 'PUBLISHED' AND v.download_ready = TRUE AND v.yanked_at IS NULL
                      AND (s.visibility = 'PUBLIC' OR (s.visibility = 'NAMESPACE_ONLY' AND s.namespace_id IN (:members)))
                    UNION ALL
                    SELECT br.role_key FROM company_skill_suite_business_role br
                    JOIN skill_suite s ON s.id = br.suite_id
                    JOIN namespace n ON n.id = s.namespace_id
                    JOIN skill_suite_version v ON v.id = s.latest_version_id
                    WHERE (:type = '' OR :type = 'SUITE')
                      AND (:namespace = '' OR n.slug = :namespace)
                      AND n.status <> 'ARCHIVED' AND s.status = 'ACTIVE' AND s.hidden = FALSE
                      AND v.status = 'PUBLISHED'
                      AND (v.visibility = 'PUBLIC' OR (v.visibility = 'NAMESPACE_ONLY' AND s.namespace_id IN (:members)))
                ) candidates
                WHERE LEFT(role_key, LENGTH(:prefix)) = :prefix
                ORDER BY role_key LIMIT 100
                """).setParameter("type", type).setParameter("namespace", namespace)
                .setParameter("prefix", prefix).setParameter("members", members.isEmpty() ? Set.of(-1L) : members)
                .getResultList();
        return keys;
    }
}
