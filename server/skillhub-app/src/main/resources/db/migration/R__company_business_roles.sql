-- Repeatable, additive company extension: deliberately outside upstream version numbers.
-- Container metadata only: existing resources have no rows (empty businessRoles).
CREATE TABLE IF NOT EXISTS company_skill_business_role (
    skill_id BIGINT NOT NULL REFERENCES skill(id) ON DELETE CASCADE,
    role_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (skill_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_company_skill_business_role_key ON company_skill_business_role(role_key, skill_id);
CREATE TABLE IF NOT EXISTS company_skill_suite_business_role (
    suite_id BIGINT NOT NULL REFERENCES skill_suite(id) ON DELETE CASCADE,
    role_key VARCHAR(64) NOT NULL,
    PRIMARY KEY (suite_id, role_key)
);
CREATE INDEX IF NOT EXISTS idx_company_skill_suite_business_role_key ON company_skill_suite_business_role(role_key, suite_id);
