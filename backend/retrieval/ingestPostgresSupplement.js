import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const INDEX_NAME = 'techdocs-ai';
const NAMESPACE = 'postgresql-200-baseline';

const CORPUS_PATH = path.resolve(
  __dirname,
  '../chunking/output/baseline-200-pages.json'
);

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const SUPPLEMENT_PATH = path.join(
  OUTPUT_DIR,
  'supplemental-postgresql-19.json'
);
const EXPANDED_PATH = path.join(
  OUTPUT_DIR,
  'expanded-postgresql-200-pages.json'
);

const TARGET_CHARS = 1500;
const OVERLAP_CHARS = 200;
const BATCH_SIZE = 50;

const DOCS = [
  {
    topic: 'streaming-replication',
    title: 'Warm standby servers and streaming replication',
    url: 'https://www.postgresql.org/docs/19/warm-standby.html'
  },
  {
    topic: 'streaming-replication',
    title: 'pg_basebackup',
    url: 'https://www.postgresql.org/docs/19/app-pgbasebackup.html'
  },
  {
    topic: 'scram-authentication',
    title: 'The pg_hba.conf file',
    url: 'https://www.postgresql.org/docs/19/auth-pg-hba-conf.html'
  },
  {
    topic: 'scram-authentication',
    title: 'Password authentication',
    url: 'https://www.postgresql.org/docs/19/auth-password.html'
  },
  {
    topic: 'scram-authentication',
    title: 'Connection and authentication configuration',
    url: 'https://www.postgresql.org/docs/19/runtime-config-connection.html'
  },
  {
    topic: 'wal-pitr',
    title: 'Continuous archiving and point-in-time recovery',
    url: 'https://www.postgresql.org/docs/19/continuous-archiving.html'
  },
  {
    topic: 'autovacuum',
    title: 'Vacuuming configuration',
    url: 'https://www.postgresql.org/docs/19/runtime-config-vacuum.html'
  },
  {
    topic: 'autovacuum',
    title: 'Routine vacuuming',
    url: 'https://www.postgresql.org/docs/19/routine-vacuuming.html'
  },
  {
    topic: 'logical-replication',
    title: 'Logical replication',
    url: 'https://www.postgresql.org/docs/19/logical-replication.html'
  },
  {
    topic: 'logical-replication',
    title: 'Logical replication publications',
    url: 'https://www.postgresql.org/docs/19/logical-replication-publication.html'
  },
  {
    topic: 'logical-replication',
    title: 'Logical replication subscriptions',
    url: 'https://www.postgresql.org/docs/19/logical-replication-subscription.html'
  },
  {
    topic: 'explain-analyze',
    title: 'EXPLAIN',
    url: 'https://www.postgresql.org/docs/19/sql-explain.html'
  },
  {
    topic: 'memory-tuning',
    title: 'Resource consumption',
    url: 'https://www.postgresql.org/docs/19/runtime-config-resource.html'
  }
];

function decodeHtml(text) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    ndash: '–',
    mdash: '—',
    hellip: '…',
    lsquo: '‘',
    rsquo: '’',
    ldquo: '“',
    rdquo: '”',
    copy: '©',
    reg: '®',
    trade: '™',
    times: '×'
  };

  return text
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCodePoint(Number(n))
    )
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&([a-z]+);/gi, (whole, key) =>
      named[key.toLowerCase()] ?? whole
    );
}

function extractArticle(html) {
  const startMatch = html.match(
    /<div\b[^>]*class=["'][^"']*\b(?:sect1|refentry)\b[^"']*["'][^>]*>/i
  );

  let article = startMatch
    ? html.slice(startMatch.index)
    : html;

  const footerPos = article.search(
    /<div\b[^>]*class=["'][^"']*\bnavfooter\b/i
  );

  if (footerPos >= 0) {
    article = article.slice(0, footerPos);
  }

  article = article
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<h([1-6])\b[^>]*>/gi, '\n\n## ')
    .replace(/<\/(?:h[1-6])\s*>/gi, '\n\n')
    .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
    .replace(/<pre\b[^>]*>/gi, '\n```sql\n')
    .replace(/<\/pre\s*>/gi, '\n```\n')
    .replace(
      /<\/(?:p|div|li|blockquote|tr|dt|dd|table|ul|ol|section|article)\s*>/gi,
      '\n'
    )
    .replace(/<code\b[^>]*>/gi, '`')
    .replace(/<\/code\s*>/gi, '`')
    .replace(/<[^>]+>/g, ' ');

  let text = decodeHtml(article)
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/`\s*`/g, '')
    .trim();

  text = text
    .replace(
      /\n\s*(?:Previous|Next|Home|Up)\s*\n(?:Previous|Next|Home|Up)?\s*$/i,
      ''
    )
    .trim();

  if (text.length < 500) {
    throw new Error(
      `Only extracted ${text.length} characters from page; HTML structure may have changed.`
    );
  }

  return text;
}

async function fetchDocument(doc) {
  const response = await fetch(doc.url, {
    headers: {
      'User-Agent':
        'TechDocsAI-learning-project/1.0 (documentation ingestion)'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${doc.url}`);
  }

  const html = await response.text();
  const text = extractArticle(html);

  return {
    ...doc,
    text,
    fetchedAt: new Date().toISOString()
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function splitIntoChunks(text, doc) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = '';
  let section = doc.title;

  const createChunk = body => {
    const idSeed = `${doc.url}|${chunks.length}|${body}`;

    const shortHash = crypto
      .createHash('sha1')
      .update(idSeed)
      .digest('hex')
      .slice(0, 10);

    chunks.push({
      id: `pg19-supp-${slugify(doc.topic)}-${chunks.length}-${shortHash}`,
      text: body,
      source: doc.url,
      sourceUrl: doc.url,
      sourceTitle: doc.title,
      topic: doc.topic,
      strategy: 'section-aware-supplement-v1',
      chunkIndex: chunks.length,
      section
    });
  };

  const pushBuffer = () => {
    const body = buffer.trim();

    if (!body || body.length < 80) return;

    createChunk(body);
  };

  for (const paragraph of paragraphs) {
    if (/^##\s+/.test(paragraph)) {
      section = paragraph.replace(/^##\s+/, '').trim();
    }

    if (paragraph.length > TARGET_CHARS) {
      if (buffer) pushBuffer();

      buffer = '';

      for (
        let start = 0;
        start < paragraph.length;
      ) {
        const end = Math.min(
          start + TARGET_CHARS,
          paragraph.length
        );

        const body = paragraph.slice(start, end).trim();

        if (body.length >= 80) {
          createChunk(`${section}\n\n${body}`);
        }

        if (end >= paragraph.length) break;

        start = Math.max(
          start + 1,
          end - OVERLAP_CHARS
        );
      }

      continue;
    }

    if (
      buffer &&
      buffer.length + paragraph.length + 2 > TARGET_CHARS
    ) {
      const previous = buffer;

      pushBuffer();

      const overlap = previous.slice(-OVERLAP_CHARS);

      buffer = `${overlap}\n\n${paragraph}`;
    } else {
      buffer = buffer
        ? `${buffer}\n\n${paragraph}`
        : paragraph;
    }
  }

  pushBuffer();

  return chunks;
}

function getChunkText(chunk) {
  if (typeof chunk === 'string') return chunk;

  for (const key of [
    'text',
    'pageContent',
    'content',
    'chunkText',
    'chunk',
    'body',
    'markdown',
    'documentText'
  ]) {
    if (
      typeof chunk?.[key] === 'string' &&
      chunk[key].trim()
    ) {
      return chunk[key];
    }
  }

  return '';
}

function locateChunkCollection(root) {
  if (Array.isArray(root)) {
    return {
      kind: 'array',
      key: null,
      chunks: root
    };
  }

  if (!root || typeof root !== 'object') {
    throw new Error(
      'Baseline corpus must be an array or object.'
    );
  }

  for (const key of [
    'chunks',
    'records',
    'documents',
    'data',
    'items'
  ]) {
    if (
      Array.isArray(root[key]) &&
      (
        root[key].length === 0 ||
        root[key].some(item => getChunkText(item))
      )
    ) {
      return {
        kind: 'object',
        key,
        chunks: root[key]
      };
    }
  }

  throw new Error(
    'Could not find the baseline chunk array. Expected an array or one of: chunks, records, documents, data, items.'
  );
}

async function prepareCorpus({ refresh }) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!fs.existsSync(CORPUS_PATH)) {
    throw new Error(
      `Baseline corpus not found: ${CORPUS_PATH}`
    );
  }

  let docs;

  if (!refresh && fs.existsSync(SUPPLEMENT_PATH)) {
    console.log(`Using prepared supplement: ${SUPPLEMENT_PATH}`);

    docs = JSON.parse(
      fs.readFileSync(SUPPLEMENT_PATH, 'utf8')
    );
  } else {
    docs = [];

    for (let i = 0; i < DOCS.length; i++) {
      const doc = DOCS[i];

      console.log(
        `[${i + 1}/${DOCS.length}] Fetching ${doc.title}`
      );

      try {
        const fetched = await fetchDocument(doc);

        const chunks = splitIntoChunks(
          fetched.text,
          fetched
        );

        docs.push({
          ...fetched,
          chunks
        });

        console.log(
          `  extracted ${fetched.text.length.toLocaleString()} chars -> ${chunks.length} chunks`
        );
      } catch (error) {
        console.error(`  WARNING: ${error.message}`);

        docs.push({
          ...doc,
          text: '',
          chunks: [],
          fetchError: error.message,
          fetchedAt: new Date().toISOString()
        });
      }
    }

    fs.writeFileSync(
      SUPPLEMENT_PATH,
      `${JSON.stringify(docs, null, 2)}\n`,
      'utf8'
    );
  }

  const supplementChunks = docs.flatMap(
    doc => doc.chunks ?? []
  );

  if (!supplementChunks.length) {
    throw new Error(
      'No supplemental chunks were created. Check network access and documentation extraction.'
    );
  }

  const baseline = JSON.parse(
    fs.readFileSync(CORPUS_PATH, 'utf8')
  );

  const collection = locateChunkCollection(baseline);
  const originalChunks = collection.chunks;

  const originalIds = new Set(
    originalChunks.map((chunk, i) =>
      String(
        chunk?.id ??
        chunk?._id ??
        chunk?.chunkId ??
        `baseline-${i}`
      )
    )
  );

  const existingSupplementIds = new Set(
    originalChunks.map(chunk =>
      String(chunk?.id ?? chunk?._id ?? '')
    )
  );

  const appendable = supplementChunks.filter(
    chunk => !existingSupplementIds.has(chunk.id)
  );

  const merged = [
    ...originalChunks,
    ...appendable
  ];

  const expanded =
    collection.kind === 'array'
      ? merged
      : {
          ...baseline,
          [collection.key]: merged
        };

  fs.writeFileSync(
    EXPANDED_PATH,
    `${JSON.stringify(expanded, null, 2)}\n`,
    'utf8'
  );

  const report = {
    generatedAt: new Date().toISOString(),
    baselinePath: CORPUS_PATH,
    supplementalPath: SUPPLEMENT_PATH,
    expandedPath: EXPANDED_PATH,
    baselineChunks: originalChunks.length,
    supplementalChunks: supplementChunks.length,
    expandedChunks: merged.length,
    fetchedPages: docs.filter(
      doc => doc.chunks?.length
    ).length,
    failedPages: docs
      .filter(doc => !doc.chunks?.length)
      .map(doc => ({
        title: doc.title,
        url: doc.url,
        error: doc.fetchError ?? 'No chunks extracted'
      })),
    idCollisionsAgainstBaseline: supplementChunks
      .filter(chunk => originalIds.has(chunk.id))
      .map(chunk => chunk.id),
    pages: docs.map(doc => ({
      topic: doc.topic,
      title: doc.title,
      url: doc.url,
      chars: doc.text?.length ?? 0,
      chunks: doc.chunks?.length ?? 0,
      error: doc.fetchError ?? null
    }))
  };

  fs.writeFileSync(
    path.join(
      OUTPUT_DIR,
      'supplement-ingestion-report.json'
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );

  console.log('\nSupplement prepared');
  console.log('===================');
  console.log(`Pages fetched: ${report.fetchedPages}/${DOCS.length}`);
  console.log(`Baseline chunks: ${report.baselineChunks}`);
  console.log(`Supplement chunks: ${report.supplementalChunks}`);
  console.log(`Expanded chunks: ${report.expandedChunks}`);
  console.log(`Supplement JSON: ${SUPPLEMENT_PATH}`);
  console.log(`Expanded corpus: ${EXPANDED_PATH}`);
  console.log(
    `Report: ${path.join(OUTPUT_DIR, 'supplement-ingestion-report.json')}`
  );

  return {
    docs,
    supplementChunks,
    report
  };
}

async function upsertSupplement(supplementChunks) {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error(
      'PINECONE_API_KEY missing. Check backend/.env'
    );
  }

  const { Pinecone } = await import(
    '@pinecone-database/pinecone'
  );

  const pc = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY
  });

  const namespace = pc
    .index(INDEX_NAME)
    .namespace(NAMESPACE);

  const records = supplementChunks.map(chunk => ({
    _id: chunk.id,
    text: chunk.text,
    source: chunk.source,
    sourceUrl: chunk.sourceUrl,
    sourceTitle: chunk.sourceTitle,
    topic: chunk.topic,
    strategy: chunk.strategy,
    chunkIndex: chunk.chunkIndex,
    section: chunk.section
  }));

  for (
    let i = 0;
    i < records.length;
    i += BATCH_SIZE
  ) {
    const batch = records.slice(
      i,
      i + BATCH_SIZE
    );

    await namespace.upsertRecords({
      records: batch
    });

    console.log(
      `Pinecone upsert: ${Math.min(
        i + batch.length,
        records.length
      )}/${records.length}`
    );
  }

  console.log(
    `\nUpserted ${records.length} supplemental records to ${INDEX_NAME}/${NAMESPACE}.`
  );

  console.log(
    'The operation is repeatable: IDs are deterministic, so rerunning updates these same records rather than duplicating them.'
  );
}

async function main() {
  const refresh = process.argv.includes('--refresh');
  const upsert = process.argv.includes('--upsert');

  try {
    const { supplementChunks } = await prepareCorpus({
      refresh
    });

    if (upsert) {
      await upsertSupplement(supplementChunks);
    } else {
      console.log(
        '\nPinecone was not changed. When ready, run: node ingestPostgresSupplement.js --upsert'
      );
    }
  } catch (error) {
    console.error(
      `\nIngestion failed: ${error.message}`
    );

    process.exitCode = 1;
  }
}

main();