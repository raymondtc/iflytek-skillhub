package com.iflytek.skillhub.repository;

import com.iflytek.skillhub.domain.shared.BusinessRoles;
import java.util.Locale;

/** Search conditions for favorites; visibility remains owned by the existing favorites policy. */
public record StarredSkillFilter(String keyword, String namespace, String businessRole, String sort) {
    public StarredSkillFilter {
        keyword = keyword == null ? "" : keyword.trim().toLowerCase(Locale.ROOT);
        namespace = namespace == null ? "" : namespace.replaceFirst("^@", "").trim().toLowerCase(Locale.ROOT);
        businessRole = BusinessRoles.filter(businessRole);
        sort = sort == null ? "" : sort;
    }
    public static StarredSkillFilter none() { return new StarredSkillFilter(null, null, null, null); }
}
