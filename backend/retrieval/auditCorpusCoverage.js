import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run from backend/retrieval with: node auditCorpusCoverage.js
const CORPUS_PATH = path.resolve(
  __dirname,
  '../chunking/output/baseline-200-pages.json'
);

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const JSON_OUTPUT_PATH = path.join(
  OUTPUT_DIR,
  'corpus-coverage-audit.json'
);
const MARKDOWN_OUTPUT_PATH = path.join(
  OUTPUT_DIR,
  'corpus-coverage-audit.md'
);

const PREVIEW_CHARS = 700;
const EVIDENCE_PER_TOPIC = 5;

const TOPICS = [
  {
    id: 'B1',
    name: 'Streaming replication and pg_basebackup',
    groups: [
      {
        name: 'replication concept',
        aliases: [
          'streaming replication',
          'physical replication',
          'replication protocol'
        ]
      },
      {
        name: 'base backup tool',
        aliases: ['pg_basebackup', 'base backup', 'basebackup']
      },
      {
        name: 'standby server',
        aliases: ['standby server', 'standby servers', 'standby']
      },
      {
        name: 'replication connection/config',
        aliases: [
          'primary_conninfo',
          'primary_slot_name',
          'wal_sender',
          'wal sender',
          'replication slot'
        ]
      },
      {
        name: 'standby startup/config',
        aliases: [
          'standby.signal',
          'recovery.signal',
          'pg_basebackup -r'
        ]
      }
    ],
    strongSignals: [
      'pg_basebackup',
      'primary_conninfo',
      'primary_slot_name',
      'standby.signal',
      'replication slot',
      'streaming replication'
    ],
    procedures: [
      'configure',
      'configuration',
      'command',
      'option',
      'parameter',
      'start',
      'standby',
      'replication'
    ]
  },
  {
    id: 'B2',
    name: 'pg_hba.conf and SCRAM authentication',
    groups: [
      {
        name: 'client authentication file',
        aliases: ['pg_hba.conf', 'pg_hba']
      },
      {
        name: 'SCRAM mechanism',
        aliases: ['scram-sha-256', 'scram']
      },
      {
        name: 'password storage/config',
        aliases: [
          'password_encryption',
          'password encryption',
          'encrypted password'
        ]
      },
      {
        name: 'HBA rule/method',
        aliases: [
          'authentication method',
          'auth-method',
          'hostssl',
          'hostnossl',
          'client authentication'
        ]
      },
      {
        name: 'reload/apply config',
        aliases: [
          'reload configuration',
          'pg_reload_conf',
          'reload the configuration',
          'server reload'
        ]
      }
    ],
    strongSignals: [
      'scram-sha-256',
      'password_encryption',
      'pg_reload_conf',
      'hostssl',
      'pg_hba.conf'
    ],
    procedures: [
      'set',
      'configure',
      'configuration',
      'reload',
      'password',
      'host',
      'authentication',
      'method'
    ]
  },
  {
    id: 'B3',
    name: 'WAL archiving and point-in-time recovery',
    groups: [
      {
        name: 'continuous archiving/PITR',
        aliases: [
          'continuous archiving',
          'point-in-time recovery',
          'point in time recovery',
          'pitr'
        ]
      },
      {
        name: 'archive mode/command',
        aliases: [
          'archive_mode',
          'archive_command',
          'archive_timeout'
        ]
      },
      {
        name: 'restore command',
        aliases: [
          'restore_command',
          'restore a backup',
          'restoring from archive'
        ]
      },
      {
        name: 'recovery target',
        aliases: [
          'recovery_target_time',
          'recovery_target_lsn',
          'recovery_target_name',
          'recovery_target_action'
        ]
      },
      {
        name: 'recovery process files',
        aliases: [
          'recovery.signal',
          'backup_label',
          'wal archive',
          'wal segment'
        ]
      }
    ],
    strongSignals: [
      'archive_mode',
      'archive_command',
      'restore_command',
      'recovery_target_time',
      'point-in-time recovery',
      'continuous archiving'
    ],
    procedures: [
      'configure',
      'configuration',
      'restore',
      'recovery',
      'backup',
      'archive',
      'recovery_target',
      'command'
    ]
  },
  {
    id: 'B4',
    name: 'Autovacuum tuning',
    groups: [
      {
        name: 'autovacuum itself',
        aliases: ['autovacuum', 'auto vacuum']
      },
      {
        name: 'vacuum threshold/scale factor',
        aliases: [
          'autovacuum_vacuum_threshold',
          'autovacuum_vacuum_scale_factor',
          'autovacuum_analyze_scale_factor'
        ]
      },
      {
        name: 'worker and cost settings',
        aliases: [
          'autovacuum_max_workers',
          'autovacuum_work_mem',
          'vacuum_cost_delay',
          'vacuum_cost_limit'
        ]
      },
      {
        name: 'dead tuples/table statistics',
        aliases: [
          'n_dead_tup',
          'dead tuples',
          'pg_stat_user_tables',
          'last_autovacuum'
        ]
      },
      {
        name: 'routine vacuuming',
        aliases: [
          'routine vacuuming',
          'vacuum analyze',
          'vacuuming a table'
        ]
      }
    ],
    strongSignals: [
      'autovacuum_vacuum_threshold',
      'autovacuum_vacuum_scale_factor',
      'autovacuum_max_workers',
      'autovacuum_work_mem',
      'autovacuum'
    ],
    procedures: [
      'tune',
      'tuning',
      'parameter',
      'threshold',
      'scale_factor',
      'workers',
      'vacuum',
      'analyze',
      'setting'
    ]
  },
  {
    id: 'B5',
    name: 'Logical replication, publications, and subscriptions',
    groups: [
      {
        name: 'logical replication',
        aliases: ['logical replication', 'logical decoding']
      },
      {
        name: 'publication creation/config',
        aliases: ['create publication', 'publication', 'publish via']
      },
      {
        name: 'subscription creation/config',
        aliases: ['create subscription', 'subscription', 'subscribe to']
      },
      {
        name: 'logical WAL/plugin',
        aliases: [
          'wal_level = logical',
          'wal_level',
          'pgoutput',
          'replication identity'
        ]
      },
      {
        name: 'replication synchronization/slots',
        aliases: [
          'copy_data',
          'synchronous_commit',
          'replication slot',
          'initial data synchronization'
        ]
      }
    ],
    strongSignals: [
      'create publication',
      'create subscription',
      'wal_level = logical',
      'pgoutput',
      'logical replication'
    ],
    procedures: [
      'create',
      'publication',
      'subscription',
      'replica identity',
      'replication',
      'configure',
      'wal_level'
    ]
  },
  {
    id: 'B6',
    name: 'EXPLAIN ANALYZE and query-plan troubleshooting',
    groups: [
      {
        name: 'EXPLAIN ANALYZE',
        aliases: ['explain analyze', 'explain (analyze']
      },
      {
        name: 'plan instrumentation',
        aliases: [
          'buffers',
          'actual time',
          'planning time',
          'execution time',
          'rows removed by filter'
        ]
      },
      {
        name: 'plan nodes',
        aliases: [
          'seq scan',
          'sequential scan',
          'index scan',
          'bitmap heap scan',
          'nested loop',
          'hash join'
        ]
      },
      {
        name: 'plan estimation',
        aliases: [
          'estimated rows',
          'actual rows',
          'cost=',
          'query plan',
          'planner estimates'
        ]
      },
      {
        name: 'format/settings',
        aliases: [
          'explain (',
          'analyze true',
          'verbose',
          'settings',
          'timing off'
        ]
      }
    ],
    strongSignals: [
      'explain analyze',
      'actual time',
      'planning time',
      'execution time',
      'rows removed by filter'
    ],
    procedures: [
      'explain',
      'analyze',
      'plan',
      'actual',
      'rows',
      'buffers',
      'query',
      'estimate'
    ]
  },
  {
    id: 'B7',
    name: 'shared_buffers and work_mem tuning',
    groups: [
      {
        name: 'shared_buffers',
        aliases: ['shared_buffers']
      },
      {
        name: 'work_mem',
        aliases: ['work_mem']
      },
      {
        name: 'other memory settings',
        aliases: [
          'maintenance_work_mem',
          'autovacuum_work_mem',
          'effective_cache_size',
          'huge_pages'
        ]
      },
      {
        name: 'resource consumption context',
        aliases: [
          'resource consumption',
          'memory configuration',
          'memory allocation',
          'operating system cache'
        ]
      },
      {
        name: 'connection/operation implications',
        aliases: [
          'max_connections',
          'sort operations',
          'hash operations',
          'per-operation memory',
          'per query'
        ]
      }
    ],
    strongSignals: [
      'shared_buffers',
      'work_mem',
      'effective_cache_size',
      'maintenance_work_mem'
    ],
    procedures: [
      'set',
      'setting',
      'configure',
      'memory',
      'tune',
      'tuning',
      'sort',
      'hash',
      'buffer'
    ]
  }
];

function getText(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';

  if (Array.isArray(value)) {
    return value.map(getText).filter(Boolean).join('\n');
  }

  if (typeof value === 'object') {
    const preferred = [
      'text',
      'pageContent',
      'content',
      'chunkText',
      'chunk',
      'body',
      'markdown',
      'documentText'
    ];

    for (const key of preferred) {
      if (typeof value[key] === 'string' && value[key].trim()) {
        return value[key];
      }
    }

    return Object.values(value)
      .filter(v => typeof v === 'string')
      .join('\n');
  }

  return '';
}

function findChunks(root) {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== 'object') return [];

  for (const key of [
    'chunks',
    'records',
    'documents',
    'data',
    'items',
    'pages'
  ]) {
    if (Array.isArray(root[key])) return root[key];
  }

  const vals = Object.values(root);

  if (
    vals.length &&
    vals.some(v => v && typeof v === 'object' && !Array.isArray(v))
  ) {
    return vals;
  }

  return [];
}

function getMeta(chunk, index) {
  const metadata = chunk?.metadata ?? chunk?.meta ?? {};

  const read = (...keys) => {
    for (const key of keys) {
      const value = chunk?.[key] ?? metadata?.[key];

      if (value !== undefined && value !== null && value !== '') {
        return value;
      }
    }

    return null;
  };

  return {
    id: String(
      read('id', '_id', 'chunkId', 'chunk_id', 'recordId') ??
      `chunk-${index}`
    ),
    source: read('source', 'file', 'filename', 'sourceFile', 'source_file'),
    pageStart: read('pageStart', 'page_start', 'page', 'pageNumber', 'page_number'),
    pageEnd: read('pageEnd', 'page_end'),
    section: read('section', 'heading', 'title')
  };
}

function isTocLike(text) {
  const lower = text.toLowerCase();

  const explicitToc =
    /table of contents|contents\s*\n|\.\s*\.\s*\.\s*\d{1,3}|\.{3,}\s*\d{1,3}/i.test(
      text
    );

  const sectionRefs =
    (lower.match(/\b(?:chapter|section)\s+\d+(?:\.\d+)*\b/g) ?? []).length;

  const headings =
    (
      lower.match(
        /\b(?:configuration|overview|introduction|setup|replication|authentication|recovery|performance|resource consumption)\b/g
      ) ?? []
    ).length;

  const shortAndListLike =
    text.length < 900 && sectionRefs >= 3 && headings >= 3;

  return explicitToc || shortAndListLike;
}

function evaluateChunk(topic, chunk, index) {
  const text = getText(chunk);
  const lower = text.toLowerCase();

  const foundGroups = [];
  const foundTerms = [];

  for (const group of topic.groups) {
    const matches = group.aliases.filter(alias =>
      lower.includes(alias.toLowerCase())
    );

    if (matches.length) {
      foundGroups.push(group.name);
      foundTerms.push(...matches);
    }
  }

  const uniqueTerms = [...new Set(foundTerms)];

  const strongSignalHits = topic.strongSignals.filter(term =>
    lower.includes(term.toLowerCase())
  );

  const procedureHits = topic.procedures.filter(term =>
    lower.includes(term.toLowerCase())
  );

  const tocLike = isTocLike(text);
  const relevantLength = text.trim().length >= 300;

  const substantive =
    !tocLike &&
    relevantLength &&
    (
      (
        strongSignalHits.length >= 1 &&
        foundGroups.length >= 2 &&
        procedureHits.length >= 1
      ) ||
      (
        foundGroups.length >= 3 &&
        procedureHits.length >= 2
      )
    );

  const score =
    foundGroups.length * 3 +
    strongSignalHits.length * 2 +
    Math.min(procedureHits.length, 4) -
    (tocLike ? 5 : 0);

  return {
    index,
    meta: getMeta(chunk, index),
    text,
    foundGroups,
    foundTerms: uniqueTerms,
    strongSignalHits,
    procedureHits,
    tocLike,
    substantive,
    score
  };
}

function makePreview(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();

  return cleaned.length > PREVIEW_CHARS
    ? `${cleaned.slice(0, PREVIEW_CHARS)}…`
    : cleaned;
}

function auditTopic(topic, chunks) {
  const evaluated = chunks
    .map((chunk, index) => evaluateChunk(topic, chunk, index))
    .filter(hit => hit.foundGroups.length > 0)
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length);

  const strong = evaluated.filter(hit => hit.substantive);
  const tocSuspects = evaluated.filter(hit => hit.tocLike);

  const corpusText = chunks.map(getText).join('\n').toLowerCase();

  const termCoverage = topic.groups.map(group => ({
    group: group.name,
    matchedAliases: group.aliases.filter(alias =>
      corpusText.includes(alias.toLowerCase())
    )
  }));

  const groupsPresent = termCoverage.filter(
    group => group.matchedAliases.length > 0
  ).length;

  let status;

  if (
    strong.length >= 2 ||
    (strong.length >= 1 && evaluated.length >= 3)
  ) {
    status = 'already_covered';
  } else if (evaluated.length > 0) {
    status = 'weakly_represented';
  } else {
    status = 'missing';
  }

  let recommendation;

  if (status === 'already_covered') {
    recommendation =
      'Inspect the top-ranked evidence and retrieval behavior before adding more documents; this topic has multiple chunks that look substantive under the heuristic.';
  } else if (status === 'weakly_represented') {
    recommendation =
      'Inspect the weak/TOC-like hits. If they do not contain usable procedures or explanations, add the relevant official documentation section.';
  } else {
    recommendation =
      'No configured topic keywords were found. Add the relevant official documentation, then chunk and index it.';
  }

  return {
    id: topic.id,
    topic: topic.name,
    status,
    chunkCountMentioningTopic: evaluated.length,
    likelySubstantiveChunks: strong.length,
    tocLikeOrOutlineChunks: tocSuspects.length,
    keywordGroupsFound: groupsPresent,
    keywordGroupsTotal: topic.groups.length,
    keywordCoverage: termCoverage,
    recommendation,
    evidence: evaluated.slice(0, EVIDENCE_PER_TOPIC).map(hit => ({
      chunkId: hit.meta.id,
      source: hit.meta.source,
      pageStart: hit.meta.pageStart,
      pageEnd: hit.meta.pageEnd,
      section: hit.meta.section,
      likelySubstantive: hit.substantive,
      looksLikeTableOfContents: hit.tocLike,
      matchedKeywordGroups: hit.foundGroups,
      matchedTerms: hit.foundTerms,
      strongSignals: hit.strongSignalHits,
      snippet: makePreview(hit.text)
    })),

    diagnostics: {
      totalCandidateHits: evaluated.length,
      strongEvidenceChunkIds: strong.map(hit => hit.meta.id),
      tocLikeChunkIds: tocSuspects.map(hit => hit.meta.id)
    }
  };
}

function toMarkdown(report) {
  const lines = [
    '# PostgreSQL Corpus Coverage Audit',
    '',
    `- Audited at: ${report.auditedAt}`,
    `- Corpus file: \`${report.corpusPath}\``,
    `- Total chunks: ${report.totalChunks}`,
    '',
    '> Heuristic audit only: keyword matches can miss synonyms, and a “likely substantive” label is not a manual quality judgment. Inspect the evidence snippets before changing the corpus.',
    '',
    '## Summary',
    '',
    '| ID | Topic | Status | Chunks mentioning | Likely substantive | TOC/outline suspects | Keyword groups |',
    '|---|---|---|---:|---:|---:|---:|'
  ];

  for (const topic of report.topics) {
    lines.push(
      `| ${topic.id} | ${topic.topic} | **${topic.status}** | ${topic.chunkCountMentioningTopic} | ${topic.likelySubstantiveChunks} | ${topic.tocLikeOrOutlineChunks} | ${topic.keywordGroupsFound}/${topic.keywordGroupsTotal} |`
    );
  }

  for (const topic of report.topics) {
    lines.push(
      '',
      `## ${topic.id}: ${topic.topic}`,
      '',
      `**Status:** ${topic.status}`,
      '',
      topic.recommendation,
      '',
      `Keyword groups found: ${topic.keywordGroupsFound}/${topic.keywordGroupsTotal}.`
    );

    if (topic.keywordCoverage.length) {
      lines.push('', 'Keyword-group coverage:');

      for (const group of topic.keywordCoverage) {
        lines.push(
          `- ${group.group}: ${
            group.matchedAliases.length
              ? group.matchedAliases.join(', ')
              : 'no configured terms found'
          }`
        );
      }
    }

    lines.push('', 'Evidence candidates:');

    if (!topic.evidence.length) {
      lines.push('- No chunks matched the configured keywords.');
    } else {
      for (const item of topic.evidence) {
        const loc = [
          item.source,
          item.pageStart != null
            ? `page ${item.pageStart}${
                item.pageEnd && item.pageEnd !== item.pageStart
                  ? `–${item.pageEnd}`
                  : ''
              }`
            : null
        ]
          .filter(Boolean)
          .join(', ');

        const label = item.likelySubstantive
          ? 'likely substantive'
          : item.looksLikeTableOfContents
            ? 'TOC/outline suspect'
            : 'mention only / uncertain';

        lines.push(
          `- **${item.chunkId}**${loc ? ` (${loc})` : ''} — ${label}`
        );

        lines.push(
          `  - Matched groups: ${
            item.matchedKeywordGroups.join(', ') || 'none'
          }`
        );

        lines.push(`  - Snippet: ${item.snippet}`);
      }
    }
  }

  lines.push(
    '',
    '## Interpretation notes',
    '',
    '- `already_covered`: the heuristic found multiple chunks that appear to have substantive content. Check if they actually answer the test question.',
    '- `weakly_represented`: at least one chunk mentions the topic, but strong evidence is sparse or may be outline-only.',
    '- `missing`: none of the configured keywords were found. This can also mean the topic uses different wording.',
    '- This report only audits the local baseline corpus JSON. It does not query Pinecone or make changes to the index.',
    ''
  );

  return lines.join('\n');
}

function main() {
  if (!fs.existsSync(CORPUS_PATH)) {
    console.error(`Corpus file not found: ${CORPUS_PATH}`);
    console.error(
      'Expected: backend/chunking/output/baseline-200-pages.json'
    );
    process.exitCode = 1;
    return;
  }

  let root;

  try {
    root = JSON.parse(fs.readFileSync(CORPUS_PATH, 'utf8'));
  } catch (error) {
    console.error(`Could not parse corpus JSON: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const chunks = findChunks(root).filter(
    chunk => getText(chunk).trim().length > 0
  );

  if (!chunks.length) {
    console.error(
      'No text chunks found. Check the JSON shape and body-field names in getText()/findChunks().'
    );
    process.exitCode = 1;
    return;
  }

  const report = {
    auditedAt: new Date().toISOString(),
    corpusPath: CORPUS_PATH,
    totalChunks: chunks.length,
    method:
      'Keyword-group coverage and heuristic substantive-vs-TOC classification; no embeddings or Pinecone calls.',
    statusCounts: {
      already_covered: 0,
      weakly_represented: 0,
      missing: 0
    },
    topics: TOPICS.map(topic => auditTopic(topic, chunks))
  };

  for (const topic of report.topics) {
    report.statusCounts[topic.status] += 1;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.writeFileSync(
    JSON_OUTPUT_PATH,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  fs.writeFileSync(
    MARKDOWN_OUTPUT_PATH,
    `${toMarkdown(report)}\n`,
    'utf8'
  );

  console.log('\nPostgreSQL Corpus Coverage Audit');
  console.log('================================');
  console.log(`Corpus: ${CORPUS_PATH}`);
  console.log(`Chunks scanned: ${chunks.length}`);
  console.log('');

  console.log(
    'ID  STATUS                 MENTIONS  STRONG  TOC/OUTLINE  GROUPS'
  );
  console.log(
    '--  ---------------------  --------  ------  -----------  ------'
  );

  for (const topic of report.topics) {
    console.log(
      `${topic.id.padEnd(3)} ${topic.status.padEnd(22)} ` +
      `${String(topic.chunkCountMentioningTopic).padStart(8)}  ` +
      `${String(topic.likelySubstantiveChunks).padStart(6)}  ` +
      `${String(topic.tocLikeOrOutlineChunks).padStart(11)}  ` +
      `${topic.keywordGroupsFound}/${topic.keywordGroupsTotal}`
    );
  }

  console.log('');
  console.log(
    'Notes: "likely substantive" is heuristic, not a correctness verdict. Review snippets in the Markdown report.'
  );

  console.log(`JSON report: ${JSON_OUTPUT_PATH}`);
  console.log(`Markdown report: ${MARKDOWN_OUTPUT_PATH}`);
}

main();