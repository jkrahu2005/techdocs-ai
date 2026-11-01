# PostgreSQL Corpus Coverage Audit

- Audited at: 2026-10-26T09:39:50.529Z
- Corpus file: `/Users/rahulkumar/Desktop/techdocs-ai/backend/chunking/output/baseline-200-pages.json`
- Total chunks: 418

> Heuristic audit only: keyword matches can miss synonyms, and a “likely substantive” label is not a manual quality judgment. Inspect the evidence snippets before changing the corpus.

## Summary

| ID | Topic | Status | Chunks mentioning | Likely substantive | TOC/outline suspects | Keyword groups |
|---|---|---|---:|---:|---:|---:|
| B1 | Streaming replication and pg_basebackup | **weakly_represented** | 1 | 0 | 1 | 1/5 |
| B2 | pg_hba.conf and SCRAM authentication | **weakly_represented** | 1 | 0 | 0 | 1/5 |
| B3 | WAL archiving and point-in-time recovery | **missing** | 0 | 0 | 0 | 0/5 |
| B4 | Autovacuum tuning | **missing** | 0 | 0 | 0 | 0/5 |
| B5 | Logical replication, publications, and subscriptions | **already_covered** | 3 | 1 | 0 | 2/5 |
| B6 | EXPLAIN ANALYZE and query-plan troubleshooting | **already_covered** | 27 | 6 | 4 | 5/5 |
| B7 | shared_buffers and work_mem tuning | **weakly_represented** | 3 | 0 | 1 | 3/5 |

## B1: Streaming replication and pg_basebackup

**Status:** weakly_represented

Inspect the weak/TOC-like hits. If they do not contain usable procedures or explanations, add the relevant official documentation section.

Keyword groups found: 1/5.

Keyword-group coverage:
- replication concept: streaming replication
- base backup tool: no configured terms found
- standby server: no configured terms found
- replication connection/config: no configured terms found
- standby startup/config: no configured terms found

Evidence candidates:
- **postgresql-baseline-200-75** (postgresql-19-A4.pdf, page 71) — TOC/outline suspect
  - Matched groups: replication concept
  - Snippet: ............................................................................ 537 14.4.4. Remove Foreign Key Constraints ....................................................................... 537 14.4.5. Increase maintenance_work_mem ................................................................. 538 14.4.6. Increase max_wal_size ................................................................................ 538 14.4.7. Disable WAL Archival and Streaming Replication ................................................ 538 14.4.8. Run ANALYZE Afterwards ................................................................................ 538 14.4.9. Some Notes about pg_dump ........................…

## B2: pg_hba.conf and SCRAM authentication

**Status:** weakly_represented

Inspect the weak/TOC-like hits. If they do not contain usable procedures or explanations, add the relevant official documentation section.

Keyword groups found: 1/5.

Keyword-group coverage:
- client authentication file: pg_hba.conf, pg_hba
- SCRAM mechanism: no configured terms found
- password storage/config: no configured terms found
- HBA rule/method: no configured terms found
- reload/apply config: no configured terms found

Evidence candidates:
- **postgresql-baseline-200-174** (postgresql-19-A4.pdf, page 119–120) — mention only / uncertain
  - Matched groups: client authentication file
  - Snippet: ses, allows new schemas and publications to be created within the database, and allows trusted extensions to be installed within the database. 80 Data Definition For schemas, allows new objects to be created within the schema. To rename an existing object, you must own the object and have this privilege for the containing schema. For tablespaces, allows tables, indexes, and temporary files to be created within the tablespace, and allows databases to be created that have the tablespace as their default tablespace. Note that revoking this privilege will not alter the existence or location of existing objects. CONNECT Allows the grantee to connect to the database. This privilege is checked at c…

## B3: WAL archiving and point-in-time recovery

**Status:** missing

No configured topic keywords were found. Add the relevant official documentation, then chunk and index it.

Keyword groups found: 0/5.

Keyword-group coverage:
- continuous archiving/PITR: no configured terms found
- archive mode/command: no configured terms found
- restore command: no configured terms found
- recovery target: no configured terms found
- recovery process files: no configured terms found

Evidence candidates:
- No chunks matched the configured keywords.

## B4: Autovacuum tuning

**Status:** missing

No configured topic keywords were found. Add the relevant official documentation, then chunk and index it.

Keyword groups found: 0/5.

Keyword-group coverage:
- autovacuum itself: no configured terms found
- vacuum threshold/scale factor: no configured terms found
- worker and cost settings: no configured terms found
- dead tuples/table statistics: no configured terms found
- routine vacuuming: no configured terms found

Evidence candidates:
- No chunks matched the configured keywords.

## B5: Logical replication, publications, and subscriptions

**Status:** already_covered

Inspect the top-ranked evidence and retrieval behavior before adding more documents; this topic has multiple chunks that look substantive under the heuristic.

Keyword groups found: 2/5.

Keyword-group coverage:
- logical replication: logical replication
- publication creation/config: create publication, publication
- subscription creation/config: no configured terms found
- logical WAL/plugin: no configured terms found
- replication synchronization/slots: no configured terms found

Evidence candidates:
- **postgresql-baseline-200-139** (postgresql-19-A4.pdf, page 101–102) — likely substantive
  - Matched groups: logical replication, publication creation/config
  - Snippet: eration expression are executed with the privileges of the user executing the query or the function owner, depending on whether the functions are defined as SECURITY INVOKER or SECURITY DEFINER. • Generated columns are, conceptually, updated after BEFORE triggers have run. Therefore, changes made to base columns in a BEFORE trigger will be reflected in generated columns. But conversely, it is not allowed to access generated columns in BEFORE triggers. • Generated columns are allowed to be replicated during logical replication according to the CREATE PUBLICATION parameter publish_generated_columns or by including them in the column list of 62 Data Definition the CREATE PUBLICATION command. Th…
- **postgresql-baseline-200-173** (postgresql-19-A4.pdf, page 119–120) — mention only / uncertain
  - Matched groups: publication creation/config
  - Snippet: ECT privilege as well, since it must reference table columns to determine which rows to update, and/or to compute new values for columns.) SELECT ... FOR UPDATE and SELECT ... FOR SHARE also require this privilege on at least one column, in addition to the SELECT privilege. For sequences, this privilege allows use of the nextval and setval functions. For large objects, this privilege allows writing or truncating the object. DELETE Allows DELETE of a row from a table, view, etc. (In practice, any nontrivial DELETE command will require SELECT privilege as well, since it must reference table columns to determine which rows to delete.) TRUNCATE Allows TRUNCATE on a table. REFERENCES Allows creat…
- **postgresql-baseline-200-174** (postgresql-19-A4.pdf, page 119–120) — mention only / uncertain
  - Matched groups: publication creation/config
  - Snippet: ses, allows new schemas and publications to be created within the database, and allows trusted extensions to be installed within the database. 80 Data Definition For schemas, allows new objects to be created within the schema. To rename an existing object, you must own the object and have this privilege for the containing schema. For tablespaces, allows tables, indexes, and temporary files to be created within the tablespace, and allows databases to be created that have the tablespace as their default tablespace. Note that revoking this privilege will not alter the existence or location of existing objects. CONNECT Allows the grantee to connect to the database. This privilege is checked at c…

## B6: EXPLAIN ANALYZE and query-plan troubleshooting

**Status:** already_covered

Inspect the top-ranked evidence and retrieval behavior before adding more documents; this topic has multiple chunks that look substantive under the heuristic.

Keyword groups found: 5/5.

Keyword-group coverage:
- EXPLAIN ANALYZE: explain analyze
- plan instrumentation: planning time, execution time
- plan nodes: seq scan, sequential scan, index scan, nested loop
- plan estimation: cost=, query plan
- format/settings: verbose, settings

Evidence candidates:
- **postgresql-baseline-200-236** (postgresql-19-A4.pdf, page 147) — likely substantive
  - Matched groups: EXPLAIN ANALYZE, plan instrumentation, plan nodes, plan estimation
  - Snippet: that partition pruning is driven only by the constraints defined implicitly by the partition keys, not by the presence of indexes. Therefore it isn't necessary to define indexes on the key columns. Whether an index needs to be created for a given partition depends on whether you expect that queries that scan the partition will generally scan a large part of the partition or just a small part. An index will be helpful in the latter case but not the former. Partition pruning can be performed not only during the planning of a given query, but also during its execution. This is useful as it can allow more partitions to be pruned when clauses contain expressions whose values are not known at quer…
- **postgresql-baseline-200-237** (postgresql-19-A4.pdf, page 147–148) — likely substantive
  - Matched groups: EXPLAIN ANALYZE, plan nodes, plan estimation
  - Snippet: ere removed during this phase by observing the “Subplans Removed” property in the EXPLAIN output. It's important to note that any partitions removed by the partition pruning done at this stage are still locked at the beginning of execution. • During actual execution of the query plan. Partition pruning may also be performed here to remove partitions using values which are only known during actual query execution. This includes values from subqueries and values from execution-time parameters such as those from parameterized nested loop joins. Since the value of these parameters may change many times during the execution of the query, partition pruning is performed whenever one of the executio…
- **postgresql-baseline-200-234** (postgresql-19-A4.pdf, page 146–147) — mention only / uncertain
  - Matched groups: plan nodes, plan estimation
  - Snippet: will be much slower than the tuple routing performed internally by declarative partitioning. 5.13.4. Partition Pruning Partition pruning is a query optimization technique that improves performance for declaratively partitioned tables. As an example: SET enable_partition_pruning = on; -- the default SELECT count(*) FROM measurement WHERE logdate >= DATE '2008-01-01'; Without partition pruning, the above query would scan each of the partitions of the measurement table. With partition pruning enabled, the planner will examine the definition of each partition and prove that the partition need not be scanned because it could not contain any rows meeting the query's WHERE clause. When the planner …
- **postgresql-baseline-200-239** (postgresql-19-A4.pdf, page 148) — likely substantive
  - Matched groups: plan instrumentation, plan estimation
  - Snippet: ueries, even simple ones that are unlikely to benefit. The following caveats apply to constraint exclusion: • Constraint exclusion is only applied during query planning, unlike partition pruning, which can also be applied during query execution. • Constraint exclusion only works when the query's WHERE clause contains constants (or externally supplied parameters). For example, a comparison against a non-immutable function such as CURRENT_TIMESTAMP cannot be optimized, since the planner cannot know which child table the function's value might fall into at run time. • Keep the partitioning constraints simple, else the planner may not be able to prove that child tables might not need to be visit…
- **postgresql-baseline-200-242** (postgresql-19-A4.pdf, page 149) — likely substantive
  - Matched groups: plan instrumentation, plan estimation
  - Snippet: uring query planning and execution. The query planner is generally able to handle partition hierarchies with up to a few thousand partitions fairly well, provided that typical queries allow the query planner to prune all but a small number of partitions. Planning times become longer and memory consumption becomes higher when more partitions remain after the planner performs partition pruning. Another reason to be concerned about having a large number of partitions is that the server's memory consumption may grow significantly over time, especially if many sessions touch large numbers of partitions. That's because each partition requires its metadata to be loaded into the local memory of each…

## B7: shared_buffers and work_mem tuning

**Status:** weakly_represented

Inspect the weak/TOC-like hits. If they do not contain usable procedures or explanations, add the relevant official documentation section.

Keyword groups found: 3/5.

Keyword-group coverage:
- shared_buffers: no configured terms found
- work_mem: work_mem
- other memory settings: maintenance_work_mem
- resource consumption context: no configured terms found
- connection/operation implications: per query

Evidence candidates:
- **postgresql-baseline-200-75** (postgresql-19-A4.pdf, page 71) — TOC/outline suspect
  - Matched groups: work_mem, other memory settings
  - Snippet: ............................................................................ 537 14.4.4. Remove Foreign Key Constraints ....................................................................... 537 14.4.5. Increase maintenance_work_mem ................................................................. 538 14.4.6. Increase max_wal_size ................................................................................ 538 14.4.7. Disable WAL Archival and Streaming Replication ................................................ 538 14.4.8. Run ANALYZE Afterwards ................................................................................ 538 14.4.9. Some Notes about pg_dump ........................…
- **postgresql-baseline-200-230** (postgresql-19-A4.pdf, page 144–145) — mention only / uncertain
  - Matched groups: connection/operation implications
  - Snippet: T INTO measurement_y2006m03 VALUES (NEW.*); ... ELSIF ( NEW.logdate >= DATE '2008-01-01' AND NEW.logdate < DATE '2008-02-01' ) THEN INSERT INTO measurement_y2008m01 VALUES (NEW.*); ELSE RAISE EXCEPTION 'Date out of range. Fix the measurement_insert_trigger() function!'; END IF; RETURN NULL; END; $$ LANGUAGE plpgsql; The trigger definition is the same as before. Note that each IF test must exactly match the CHECK constraint for its child table. While this function is more complex than the single-month case, it doesn't need to be updated as often, since branches can be added in advance of being needed. Note In practice, it might be best to check the newest child first, if most inserts go into …
- **postgresql-baseline-200-231** (postgresql-19-A4.pdf, page 145) — mention only / uncertain
  - Matched groups: connection/operation implications
  - Snippet: ogdate < DATE '2008-02-01' ) DO INSTEAD INSERT INTO measurement_y2008m01 VALUES (NEW.*); A rule has significantly more overhead than a trigger, but the overhead is paid once per query rather than once per row, so this method might be advantageous for bulk-insert situations. In most cases, however, the trigger method will offer better performance. Be aware that COPY ignores rules. If you want to use COPY to insert data, you'll need to copy into the correct child table rather than directly into the root. COPY does fire triggers, so you can use it normally if you use the trigger approach. Another disadvantage of the rule approach is that there is no simple way to force an error if the set of ru…

## Interpretation notes

- `already_covered`: the heuristic found multiple chunks that appear to have substantive content. Check if they actually answer the test question.
- `weakly_represented`: at least one chunk mentions the topic, but strong evidence is sparse or may be outline-only.
- `missing`: none of the configured keywords were found. This can also mean the topic uses different wording.
- This report only audits the local baseline corpus JSON. It does not query Pinecone or make changes to the index.

