ALTER TABLE membership DROP CHECK ck_membership_role;
ALTER TABLE membership ADD CONSTRAINT ck_membership_role CHECK (role IN ('OWNER', 'EDITOR', 'VIEWER'));
