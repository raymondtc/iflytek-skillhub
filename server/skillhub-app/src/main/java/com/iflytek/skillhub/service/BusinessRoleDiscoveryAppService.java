package com.iflytek.skillhub.service;

import com.iflytek.skillhub.domain.shared.exception.DomainBadRequestException;
import com.iflytek.skillhub.repository.BusinessRoleCandidateQueryRepository;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class BusinessRoleDiscoveryAppService {
    private final BusinessRoleCandidateQueryRepository repository;
    public BusinessRoleDiscoveryAppService(BusinessRoleCandidateQueryRepository repository) { this.repository = repository; }

    public List<String> candidates(String resourceType, String namespace, String prefix, Set<Long> members) {
        String type = resourceType == null ? "" : resourceType.toUpperCase(Locale.ROOT);
        if (!Set.of("", "SKILL", "SUITE").contains(type)) throw new DomainBadRequestException("business_role.invalid_type");
        String query = prefix == null ? "" : prefix;
        if (query.length() > 64 || !query.matches("[a-z0-9_.-]*")) throw new DomainBadRequestException("business_role.invalid_key");
        return repository.findVisible(type, namespace == null ? "" : namespace.replaceFirst("^@", ""), query, members);
    }
}
