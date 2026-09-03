\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '5s';

SELECT jsonb_build_object(
  'kind', 'server',
  'server_version_num', current_setting('server_version_num'),
  'server_encoding', current_setting('server_encoding'),
  'transaction_read_only', current_setting('transaction_read_only')
)::text;

SELECT jsonb_build_object(
  'kind', 'database',
  'encoding', pg_encoding_to_char(d.encoding),
  'collation', d.datcollate,
  'ctype', d.datctype
)::text
FROM pg_database AS d
WHERE d.datname = current_database();

SELECT jsonb_build_object(
  'kind', 'extension',
  'name', e.extname,
  'version', e.extversion,
  'schema', n.nspname
)::text
FROM pg_extension AS e
JOIN pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;

SELECT jsonb_build_object(
  'kind', 'schema',
  'name', n.nspname,
  'owner', pg_get_userbyid(n.nspowner),
  'acl', coalesce(n.nspacl::text, '')
)::text
FROM pg_namespace AS n
WHERE n.nspname !~ '^pg_(toast|temp)'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname;

SELECT jsonb_build_object(
  'kind', 'role',
  'name', r.rolname,
  'superuser', r.rolsuper,
  'inherit', r.rolinherit,
  'create_role', r.rolcreaterole,
  'create_db', r.rolcreatedb,
  'can_login', r.rolcanlogin,
  'replication', r.rolreplication,
  'bypass_rls', r.rolbypassrls,
  'connection_limit', r.rolconnlimit,
  'valid_until', r.rolvaliduntil
)::text
FROM pg_roles AS r
ORDER BY r.rolname;

SELECT jsonb_build_object(
  'kind', 'role_membership',
  'role', granted.rolname,
  'member', member.rolname,
  'admin_option', membership.admin_option
)::text
FROM pg_auth_members AS membership
JOIN pg_roles AS granted ON granted.oid = membership.roleid
JOIN pg_roles AS member ON member.oid = membership.member
ORDER BY granted.rolname, member.rolname;

SELECT jsonb_build_object(
  'kind', 'type',
  'schema', n.nspname,
  'name', t.typname,
  'type_kind', t.typtype,
  'category', t.typcategory,
  'base_type', CASE WHEN t.typbasetype = 0 THEN NULL ELSE t.typbasetype::regtype::text END,
  'not_null', t.typnotnull,
  'default', t.typdefault
)::text
FROM pg_type AS t
JOIN pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND t.typtype IN ('d', 'e')
ORDER BY n.nspname, t.typname;

SELECT jsonb_build_object(
  'kind', 'enum_value',
  'schema', n.nspname,
  'type', t.typname,
  'label', e.enumlabel,
  'sort_order', e.enumsortorder
)::text
FROM pg_enum AS e
JOIN pg_type AS t ON t.oid = e.enumtypid
JOIN pg_namespace AS n ON n.oid = t.typnamespace
ORDER BY n.nspname, t.typname, e.enumsortorder;

SELECT jsonb_build_object(
  'kind', 'relation',
  'schema', n.nspname,
  'name', c.relname,
  'relation_kind', c.relkind,
  'owner', pg_get_userbyid(c.relowner),
  'row_security', c.relrowsecurity,
  'force_row_security', c.relforcerowsecurity,
  'replica_identity', c.relreplident,
  'persistence', c.relpersistence,
  'acl', coalesce(c.relacl::text, '')
)::text
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
ORDER BY n.nspname, c.relname, c.relkind;

SELECT jsonb_build_object(
  'kind', 'column',
  'schema', n.nspname,
  'relation', c.relname,
  'position', a.attnum,
  'name', a.attname,
  'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
  'not_null', a.attnotnull,
  'identity', a.attidentity,
  'generated', a.attgenerated,
  'default', pg_get_expr(ad.adbin, ad.adrelid),
  'collation', CASE WHEN a.attcollation = 0 THEN NULL ELSE coll.collname END
)::text
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef AS ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
LEFT JOIN pg_collation AS coll ON coll.oid = a.attcollation
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;

SELECT jsonb_build_object(
  'kind', 'constraint',
  'schema', n.nspname,
  'relation', c.relname,
  'name', constraint_row.conname,
  'constraint_kind', constraint_row.contype,
  'definition', pg_get_constraintdef(constraint_row.oid, true),
  'validated', constraint_row.convalidated,
  'deferrable', constraint_row.condeferrable,
  'initially_deferred', constraint_row.condeferred
)::text
FROM pg_constraint AS constraint_row
JOIN pg_class AS c ON c.oid = constraint_row.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, constraint_row.conname;

SELECT jsonb_build_object(
  'kind', 'index',
  'schema', n.nspname,
  'relation', relation.relname,
  'name', index_relation.relname,
  'definition', pg_get_indexdef(index_relation.oid),
  'valid', index_row.indisvalid,
  'ready', index_row.indisready,
  'unique', index_row.indisunique,
  'primary', index_row.indisprimary
)::text
FROM pg_index AS index_row
JOIN pg_class AS relation ON relation.oid = index_row.indrelid
JOIN pg_class AS index_relation ON index_relation.oid = index_row.indexrelid
JOIN pg_namespace AS n ON n.oid = relation.relnamespace
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, relation.relname, index_relation.relname;

SELECT jsonb_build_object(
  'kind', 'sequence',
  'schema', schemaname,
  'name', sequencename,
  'owner', sequenceowner,
  'data_type', data_type,
  'start_value', start_value,
  'minimum_value', min_value,
  'maximum_value', max_value,
  'increment', increment_by,
  'cycle', cycle,
  'cache_size', cache_size,
  'last_value', last_value
)::text
FROM pg_sequences
WHERE schemaname !~ '^pg_'
  AND schemaname <> 'information_schema'
ORDER BY schemaname, sequencename;

SELECT jsonb_build_object(
  'kind', 'routine',
  'schema', n.nspname,
  'name', p.proname,
  'routine_kind', p.prokind,
  'identity_arguments', pg_get_function_identity_arguments(p.oid),
  'result', pg_get_function_result(p.oid),
  'language', language.lanname,
  'volatility', p.provolatile,
  'parallel', p.proparallel,
  'security_definer', p.prosecdef,
  'leakproof', p.proleakproof,
  'acl', coalesce(p.proacl::text, ''),
  'definition', pg_get_functiondef(p.oid)
)::text
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_language AS language ON language.oid = p.prolang
WHERE n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
  AND p.prokind IN ('f', 'p')
ORDER BY n.nspname, p.proname, pg_get_function_identity_arguments(p.oid);

SELECT jsonb_build_object(
  'kind', 'trigger',
  'schema', n.nspname,
  'relation', c.relname,
  'name', trigger_row.tgname,
  'enabled', trigger_row.tgenabled,
  'definition', pg_get_triggerdef(trigger_row.oid, true)
)::text
FROM pg_trigger AS trigger_row
JOIN pg_class AS c ON c.oid = trigger_row.tgrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT trigger_row.tgisinternal
  AND n.nspname !~ '^pg_'
  AND n.nspname <> 'information_schema'
ORDER BY n.nspname, c.relname, trigger_row.tgname;

SELECT jsonb_build_object(
  'kind', 'policy',
  'schema', n.nspname,
  'relation', c.relname,
  'name', policy_row.polname,
  'permissive', policy_row.polpermissive,
  'command', policy_row.polcmd,
  'roles', ARRAY(
    SELECT coalesce(role_name.rolname, 'PUBLIC')
    FROM unnest(policy_row.polroles) AS policy_role(role_oid)
    LEFT JOIN pg_roles AS role_name ON role_name.oid = policy_role.role_oid
    ORDER BY coalesce(role_name.rolname, 'PUBLIC')
  ),
  'using_expression', pg_get_expr(policy_row.polqual, policy_row.polrelid),
  'check_expression', pg_get_expr(policy_row.polwithcheck, policy_row.polrelid)
)::text
FROM pg_policy AS policy_row
JOIN pg_class AS c ON c.oid = policy_row.polrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
ORDER BY n.nspname, c.relname, policy_row.polname;

SELECT jsonb_build_object(
  'kind', 'default_acl',
  'owner', pg_get_userbyid(default_acl.defaclrole),
  'schema', namespace.nspname,
  'object_kind', default_acl.defaclobjtype,
  'acl', coalesce(default_acl.defaclacl::text, '')
)::text
FROM pg_default_acl AS default_acl
LEFT JOIN pg_namespace AS namespace ON namespace.oid = default_acl.defaclnamespace
ORDER BY pg_get_userbyid(default_acl.defaclrole), namespace.nspname, default_acl.defaclobjtype;

SELECT jsonb_build_object(
  'kind', 'publication_table',
  'publication', pubname,
  'schema', schemaname,
  'relation', tablename
)::text
FROM pg_publication_tables
ORDER BY pubname, schemaname, tablename;

COMMIT;

SELECT jsonb_build_object('kind', 'snapshot_complete', 'value', true)::text;
