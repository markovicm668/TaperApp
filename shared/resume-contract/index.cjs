function createSchema(parser) {
  return {
    parse(input) {
      return parser(input);
    },
    safeParse(input) {
      try {
        return { success: true, data: parser(input) };
      } catch (error) {
        return { success: false, error };
      }
    },
  };
}

class SchemaError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'SchemaError';
    this.path = path;
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isObject(value)) throw new SchemaError('Expected object', path);
  return value;
}

function asString(value, path, options = {}) {
  const { optional = false, minLength = 0 } = options;
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new SchemaError('Expected string', path);
  }
  if (typeof value !== 'string') throw new SchemaError('Expected string', path);
  if (value.length < minLength) {
    throw new SchemaError(`Expected string length >= ${minLength}`, path);
  }
  return value;
}

function asBoolean(value, path, options = {}) {
  const { optional = false } = options;
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new SchemaError('Expected boolean', path);
  }
  if (typeof value !== 'boolean') throw new SchemaError('Expected boolean', path);
  return value;
}

function asNumber(value, path, options = {}) {
  const { optional = false } = options;
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new SchemaError('Expected number', path);
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new SchemaError('Expected number', path);
  }
  return value;
}

function asEnum(value, values, path, options = {}) {
  const { optional = false } = options;
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new SchemaError(`Expected one of: ${values.join(', ')}`, path);
  }
  if (!values.includes(value)) {
    throw new SchemaError(`Expected one of: ${values.join(', ')}`, path);
  }
  return value;
}

function asArray(value, path, parser, defaultValue = []) {
  if (value === undefined || value === null) return defaultValue;
  if (!Array.isArray(value)) throw new SchemaError('Expected array', path);
  return value.map((item, index) => parser(item, `${path}[${index}]`, index));
}

function sanitizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function toCategoryKey(label, fallbackIndex) {
  const normalized = sanitizeKey(label).replace(/-/g, '');
  if (normalized) return normalized;
  return `category${fallbackIndex + 1}`;
}

const LIST_PREFIX_RE = /^\s*(?:[-*•●▪◦–—−]|\(?\d{1,3}[.)])\s+/u;

function normalizeString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function stripListPrefix(value) {
  const text = normalizeString(String(value || ''));
  if (!text) return undefined;
  return normalizeString(text.replace(LIST_PREFIX_RE, ''));
}

function splitInlineList(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function parseStringList(value, path) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') return splitInlineList(value);
  if (!Array.isArray(value)) throw new SchemaError('Expected array', path);
  return value.map((item, index) => {
    if (typeof item !== 'string' && typeof item !== 'number') {
      throw new SchemaError('Expected string', `${path}[${index}]`);
    }
    return normalizeString(String(item));
  }).filter(Boolean);
}

function parseStringMap(value, path) {
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return dedupeSkills(
      value.flatMap((item, index) => {
        const parsed = parseResumeSkillItemV2(item, `${path}[${index}]`, index);
        return Array.isArray(parsed) ? parsed : [parsed];
      }).filter(Boolean)
    );
  }

  const obj = assertObject(value, path);

  const out = [];
  Object.entries(obj).forEach(([key, raw], index) => {
    const categoryLabel = titleCaseWords(key) || `Category ${index + 1}`;
    if (Array.isArray(raw)) {
      const entries = raw
        .map((item, itemIndex) => asString(item, `${path}.${key}[${itemIndex}]`))
        .map((item) => item.trim())
        .filter(Boolean);
      entries.forEach((name, itemIndex) => {
        out.push({
          id: createId(`skill-${toCategoryKey(key, index)}-${itemIndex + 1}`),
          name,
          category: categoryLabel,
        });
      });
      return;
    }

    if (typeof raw === 'string') {
      const entries = raw
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean);
      entries.forEach((name, itemIndex) => {
        out.push({
          id: createId(`skill-${toCategoryKey(key, index)}-${itemIndex + 1}`),
          name,
          category: categoryLabel,
        });
      });
      return;
    }

    throw new SchemaError('Expected string[] map value', `${path}.${key}`);
  });

  return dedupeSkills(out);
}

function parseResumeProfile(value, path) {
  if (typeof value === 'string') {
    const url = normalizeString(value);
    if (!url) throw new SchemaError('Expected non-empty string', path);
    return {
      id: createId('profile'),
      url,
    };
  }

  const obj = assertObject(value, path);
  const id = asString(obj.id, `${path}.id`, { optional: true });
  const network = asString(obj.network, `${path}.network`, { optional: true });
  const username = asString(obj.username, `${path}.username`, { optional: true });
  const url = asString(obj.url, `${path}.url`, { optional: true });

  const hasAny = Boolean(network || username || url);
  if (!hasAny) throw new SchemaError('Expected profile with at least one field', path);

  return {
    id,
    network,
    username,
    url,
  };
}

function parseResumeLocation(value, path) {
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parts = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        city: parts[0],
        country: parts.slice(1).join(', '),
      };
    }
    return {
      city: trimmed,
    };
  }

  const obj = assertObject(value, path);
  const location = {
    address: asString(obj.address, `${path}.address`, { optional: true }),
    postalCode: asString(obj.postalCode, `${path}.postalCode`, { optional: true }),
    city: asString(obj.city, `${path}.city`, { optional: true }),
    region: asString(obj.region || obj.state, `${path}.region`, { optional: true }),
    country: asString(obj.country, `${path}.country`, { optional: true }),
    countryCode: asString(obj.countryCode, `${path}.countryCode`, { optional: true }),
  };

  const hasAny = Object.values(location).some((item) => Boolean(item));
  return hasAny ? location : undefined;
}

function parseResumeMetadataV2(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = assertObject(value, path);
  const metadata = {
    importedAt: asString(obj.importedAt, `${path}.importedAt`, { optional: true }),
    lastModified: asString(obj.lastModified, `${path}.lastModified`, { optional: true }),
    lastAnalyzed: asString(obj.lastAnalyzed, `${path}.lastAnalyzed`, { optional: true }),
    templateUsed: asString(obj.templateUsed, `${path}.templateUsed`, { optional: true }),
    atsScore: asNumber(obj.atsScore, `${path}.atsScore`, { optional: true }),
  };

  const hasAny = Object.values(metadata).some((item) => item !== undefined);
  return hasAny ? metadata : undefined;
}

function parseResumeBasicsV2(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = assertObject(value, path);

  const profiles = asArray(obj.profiles || obj.links, `${path}.profiles`, parseResumeProfile, []);
  const title = asString(obj.title || obj.label, `${path}.title`, { optional: true });

  const basics = {
    id: asString(obj.id, `${path}.id`, { optional: true }),
    name: asString(obj.name, `${path}.name`, { optional: true }),
    title,
    label: title,
    email: asString(obj.email, `${path}.email`, { optional: true }),
    phone: asString(obj.phone, `${path}.phone`, { optional: true }),
    url: asString(obj.url || obj.website, `${path}.url`, { optional: true }),
    location: parseResumeLocation(obj.location, `${path}.location`),
    profiles: profiles.length ? profiles : undefined,
  };

  const hasAny =
    Boolean(basics.name) ||
    Boolean(basics.title) ||
    Boolean(basics.email) ||
    Boolean(basics.phone) ||
    Boolean(basics.url) ||
    Boolean(basics.location) ||
    Boolean(basics.profiles && basics.profiles.length);
  return hasAny ? basics : undefined;
}

function parseResumeHighlightV2(value, path, fallbackIdPrefix = 'highlight') {
  if (typeof value === 'string') {
    const text = stripListPrefix(value);
    if (!text) throw new SchemaError('Expected non-empty highlight text', path);
    return {
      id: createId(fallbackIdPrefix),
      text,
      originalText: text,
      source: 'user',
      locked: false,
      aiTags: [],
      keywordMatches: [],
    };
  }

  const obj = assertObject(value, path);
  const rawText =
    asString(obj.text, `${path}.text`, { optional: true }) ||
    asString(obj.improved, `${path}.improved`, { optional: true }) ||
    asString(obj.original, `${path}.original`, { optional: true });
  const text = stripListPrefix(rawText || '');
  if (!text) throw new SchemaError('Expected non-empty highlight text', `${path}.text`);

  const originalTextRaw = asString(obj.originalText, `${path}.originalText`, { optional: true });
  const originalText = stripListPrefix(originalTextRaw || '') || text;
  const source = asString(obj.source, `${path}.source`, { optional: true }) || 'user';

  const aiTags = parseStringList(obj.aiTags, `${path}.aiTags`);
  const keywordMatches = parseStringList(obj.keywordMatches, `${path}.keywordMatches`);

  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId(fallbackIdPrefix),
    text,
    originalText,
    source,
    locked: asBoolean(obj.locked, `${path}.locked`, { optional: true }) || false,
    aiTags,
    keywordMatches,
  };
}

function parseResumeEducationItemV2(value, path) {
  const obj = assertObject(value, path);

  const honors = parseStringList(obj.honors, `${path}.honors`);
  const education = {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('education'),
    institution: asString(obj.institution, `${path}.institution`, { optional: true }),
    area: asString(obj.area, `${path}.area`, { optional: true }),
    degree: asString(obj.degree || obj.studyType, `${path}.degree`, { optional: true }),
    studyType: asString(obj.degree || obj.studyType, `${path}.studyType`, { optional: true }),
    startDate: asString(obj.startDate, `${path}.startDate`, { optional: true }),
    endDate: asString(obj.endDate, `${path}.endDate`, { optional: true }),
    location: parseResumeLocation(obj.location, `${path}.location`),
    gpa: asString(obj.gpa, `${path}.gpa`, { optional: true }),
    honors,
  };

  const hasAny =
    Boolean(education.institution) ||
    Boolean(education.degree) ||
    Boolean(education.area) ||
    Boolean(education.startDate) ||
    Boolean(education.endDate) ||
    Boolean(education.location) ||
    Boolean(education.gpa) ||
    education.honors.length > 0;
  if (!hasAny) throw new SchemaError('Expected education item with at least one field', path);
  return education;
}

function parseResumeWorkItemV2(value, path) {
  const obj = assertObject(value, path);

  const highlights = asArray(
    obj.highlights,
    `${path}.highlights`,
    (item, itemPath) => parseResumeHighlightV2(item, itemPath, 'work-highlight'),
    []
  );

  const isCurrent =
    asBoolean(obj.isCurrent, `${path}.isCurrent`, { optional: true }) ||
    asBoolean(obj.current, `${path}.current`, { optional: true });

  const work = {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('work'),
    company: asString(obj.company, `${path}.company`, { optional: true }),
    position: asString(obj.position, `${path}.position`, { optional: true }),
    startDate: asString(obj.startDate, `${path}.startDate`, { optional: true }),
    endDate: asString(obj.endDate, `${path}.endDate`, { optional: true }),
    isCurrent: Boolean(isCurrent),
    location: parseResumeLocation(obj.location, `${path}.location`),
    highlights,
  };

  const hasAny =
    Boolean(work.company) ||
    Boolean(work.position) ||
    Boolean(work.startDate) ||
    Boolean(work.endDate) ||
    Boolean(work.isCurrent) ||
    Boolean(work.location) ||
    work.highlights.length > 0;

  if (!hasAny) throw new SchemaError('Expected work item with at least one field', path);
  return work;
}

function parseResumeTechnologyV2(value, path, index) {
  if (typeof value === 'string') {
    const name = normalizeString(value);
    if (!name) throw new SchemaError('Expected non-empty technology name', path);
    return {
      skillRefId: undefined,
      name,
    };
  }

  const obj = assertObject(value, path);
  const name = asString(obj.name, `${path}.name`, { optional: true });
  if (!name) throw new SchemaError('Expected non-empty technology name', `${path}.name`);
  return {
    skillRefId: asString(obj.skillRefId, `${path}.skillRefId`, { optional: true }) || createId(`skill-ref-${index + 1}`),
    name: normalizeString(name) || name,
  };
}

function parseResumeProjectItemV2(value, path) {
  const obj = assertObject(value, path);
  const technologiesRaw =
    obj.technologies === undefined || obj.technologies === null
      ? []
      : Array.isArray(obj.technologies)
        ? obj.technologies
        : splitInlineList(obj.technologies);

  const technologies = asArray(
    technologiesRaw,
    `${path}.technologies`,
    (item, itemPath, index) => parseResumeTechnologyV2(item, itemPath, index),
    []
  );

  const highlights = asArray(
    obj.highlights,
    `${path}.highlights`,
    (item, itemPath) => parseResumeHighlightV2(item, itemPath, 'project-highlight'),
    []
  );

  const project = {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('project'),
    name: asString(obj.name, `${path}.name`, { optional: true }),
    role: asString(obj.role, `${path}.role`, { optional: true }),
    description: asString(obj.description, `${path}.description`, { optional: true }),
    technologies,
    startDate: asString(obj.startDate, `${path}.startDate`, { optional: true }),
    endDate: asString(obj.endDate, `${path}.endDate`, { optional: true }),
    repository: asString(obj.repository, `${path}.repository`, { optional: true }),
    url: asString(obj.url, `${path}.url`, { optional: true }),
    highlights,
  };

  const hasAny =
    Boolean(project.name) ||
    Boolean(project.role) ||
    Boolean(project.description) ||
    project.technologies.length > 0 ||
    Boolean(project.startDate) ||
    Boolean(project.endDate) ||
    Boolean(project.repository) ||
    Boolean(project.url) ||
    project.highlights.length > 0;

  if (!hasAny) throw new SchemaError('Expected project item with at least one field', path);
  return project;
}

function parseResumeAwardItemV2(value, path) {
  const obj = assertObject(value, path);
  const award = {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('award'),
    title: asString(obj.title, `${path}.title`, { optional: true }),
    issuer: asString(obj.issuer, `${path}.issuer`, { optional: true }),
    date: asString(obj.date, `${path}.date`, { optional: true }),
    summary: asString(obj.summary, `${path}.summary`, { optional: true }),
  };

  const hasAny = Boolean(award.title || award.issuer || award.date || award.summary);
  if (!hasAny) throw new SchemaError('Expected award item with at least one field', path);
  return award;
}

function parseResumeLanguageItemV2(value, path) {
  const obj = assertObject(value, path);
  const language = {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('language'),
    language: asString(obj.language, `${path}.language`, { optional: true }),
    fluency: asString(obj.fluency, `${path}.fluency`, { optional: true }),
  };

  const hasAny = Object.values(language).some((item) => Boolean(item));
  if (!hasAny) throw new SchemaError('Expected language item with at least one field', path);
  return language;
}

function parseResumeSkillItemV2(value, path, index = 0, forcedCategory) {
  if (typeof value === 'string') {
    const name = normalizeString(value);
    if (!name) throw new SchemaError('Expected non-empty skill', path);
    return {
      id: createId(`skill-${index + 1}`),
      name,
      category: forcedCategory || 'General',
    };
  }

  const obj = assertObject(value, path);
  const groupedItems = parseStringList(
    obj.items || obj.skills || obj.keywords,
    `${path}.items`
  );
  if (groupedItems.length) {
    return groupedItems.map((name, itemIndex) => ({
      id: createId(`skill-${index + 1}-${itemIndex + 1}`),
      name,
      category:
        forcedCategory ||
        asString(obj.category || obj.name || obj.label, `${path}.category`, { optional: true }) ||
        'General',
    }));
  }

  const name = asString(obj.name || obj.skill || obj.keyword, `${path}.name`, { optional: true });
  if (!name) throw new SchemaError('Expected non-empty skill name', `${path}.name`);

  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId(`skill-${index + 1}`),
    name,
    category:
      forcedCategory ||
      asString(obj.category, `${path}.category`, { optional: true }) ||
      'General',
  };
}

function parseResumeSkillsV2(value, path) {
  if (value === undefined || value === null) return [];

  if (typeof value === 'string') {
    return dedupeSkills(
      splitInlineList(value).map((name, index) => ({
        id: createId(`skill-${index + 1}`),
        name,
        category: 'General',
      }))
    );
  }

  if (Array.isArray(value)) {
    const parsed = [];
    value.forEach((item, index) => {
      const normalized = parseResumeSkillItemV2(item, `${path}[${index}]`, index);
      if (Array.isArray(normalized)) {
        parsed.push(...normalized);
        return;
      }
      parsed.push(normalized);
    });
    return dedupeSkills(parsed);
  }

  return parseStringMap(value, path);
}

function dedupeSkills(skills) {
  const seen = new Set();
  const deduped = [];
  skills.forEach((item, index) => {
    if (!item || !item.name) return;
    const key = `${item.category || 'General'}::${item.name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push({
      id: item.id || createId(`skill-${index + 1}`),
      name: item.name,
      category: item.category || 'General',
    });
  });
  return deduped;
}

function parseResumeCustomSectionItemV2(value, path, index) {
  if (typeof value === 'string') {
    const text = stripListPrefix(value);
    if (!text) throw new SchemaError('Expected non-empty custom section item', path);
    return {
      id: createId(`custom-item-${index + 1}`),
      text,
    };
  }

  const obj = assertObject(value, path);
  const text = stripListPrefix(asString(obj.text, `${path}.text`, { optional: true }) || '');
  if (!text) throw new SchemaError('Expected non-empty custom section item', `${path}.text`);
  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId(`custom-item-${index + 1}`),
    text,
  };
}

function parseResumeCustomSectionV2(value, path, index) {
  const obj = assertObject(value, path);
  const title = asString(obj.title, `${path}.title`, { optional: true });
  const items = asArray(
    obj.items || obj.lines,
    `${path}.items`,
    (item, itemPath, itemIndex) => parseResumeCustomSectionItemV2(item, itemPath, itemIndex),
    []
  );

  const hasAny = Boolean(title) || items.length > 0;
  if (!hasAny) throw new SchemaError('Expected custom section with content', path);

  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId(`custom-section-${index + 1}`),
    title: title || `Custom Section ${index + 1}`,
    items,
  };
}

function parseResumeVersionSnapshotV2(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      work: [],
      projects: [],
      education: [],
      skills: [],
    };
  }

  return {
    work: asArray(value.work, `${path}.work`, parseResumeWorkItemV2, []),
    projects: asArray(value.projects, `${path}.projects`, parseResumeProjectItemV2, []),
    education: asArray(value.education, `${path}.education`, parseResumeEducationItemV2, []),
    skills: parseResumeSkillsV2(value.skills, `${path}.skills`),
  };
}

function parseResumeVersionEntryV2(value, path, index) {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId(`version-${index + 1}`),
    timestamp: asString(obj.timestamp, `${path}.timestamp`, { optional: true }),
    reason: asString(obj.reason, `${path}.reason`, { optional: true }),
    snapshot: parseResumeVersionSnapshotV2(obj.snapshot, `${path}.snapshot`),
  };
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function parseResumeDataV2(value, path = 'resumeData') {
  const obj = assertObject(value, path);

  const skills = parseResumeSkillsV2(obj.skills, `${path}.skills`);
  const customSections = asArray(
    obj.customSections,
    `${path}.customSections`,
    (item, itemPath, index) => parseResumeCustomSectionV2(item, itemPath, index),
    []
  );
  const sectionOrder = asArray(
    obj.sectionOrder,
    `${path}.sectionOrder`,
    (item, itemPath) => asString(item, itemPath),
    []
  );
  const versions = asArray(
    obj.versions,
    `${path}.versions`,
    (item, itemPath, index) => parseResumeVersionEntryV2(item, itemPath, index),
    []
  );

  return {
    id: asString(obj.id, `${path}.id`, { optional: true }) || createId('resume'),
    metadata: parseResumeMetadataV2(obj.metadata, `${path}.metadata`),
    basics: parseResumeBasicsV2(obj.basics, `${path}.basics`),
    summary: asString(obj.summary, `${path}.summary`, { optional: true }),
    education: asArray(obj.education, `${path}.education`, parseResumeEducationItemV2, []),
    work: asArray(obj.work, `${path}.work`, parseResumeWorkItemV2, []),
    projects: asArray(obj.projects, `${path}.projects`, parseResumeProjectItemV2, []),
    awards: asArray(obj.awards, `${path}.awards`, parseResumeAwardItemV2, []),
    skills,
    languages: asArray(obj.languages, `${path}.languages`, parseResumeLanguageItemV2, []),
    customSections,
    sectionOrder,
    versions,
  };
}

function parseResumeSourceMetaV2(value, path = 'resumeSource') {
  const obj = assertObject(value, path);
  return {
    inputType: asEnum(obj.inputType, ['file', 'text', 'linkedin'], `${path}.inputType`),
    rawText: asString(obj.rawText, `${path}.rawText`),
    fileName: asString(obj.fileName, `${path}.fileName`, { optional: true }),
    importedAt: asString(obj.importedAt, `${path}.importedAt`),
    parsedAt: asString(obj.parsedAt, `${path}.parsedAt`, { optional: true }),
    parser: asString(obj.parser, `${path}.parser`, { optional: true }),
  };
}

const RESUME_SECTION_KINDS_V2 = [
  'header',
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
  'custom',
];

const RESUME_SECTION_CANONICAL_TARGETS_V2 = [
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
  'none',
];

function normalizeSectionKindV2(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'experience') return 'work';
  if (RESUME_SECTION_KINDS_V2.includes(normalized)) return normalized;
  return undefined;
}

function normalizeCanonicalTargetV2(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'experience') return 'work';
  if (RESUME_SECTION_CANONICAL_TARGETS_V2.includes(normalized)) return normalized;
  return undefined;
}

function parseResumeSectionBlockV2(value, path) {
  const obj = assertObject(value, path);
  const resolvedKind = normalizeSectionKindV2(obj.kind);
  if (!resolvedKind) {
    throw new SchemaError(`Expected one of: ${RESUME_SECTION_KINDS_V2.join(', ')}`, `${path}.kind`);
  }

  const canonicalTarget = normalizeCanonicalTargetV2(obj.canonicalTarget);

  return {
    id: asString(obj.id, `${path}.id`, { minLength: 1 }),
    title: asString(obj.title, `${path}.title`, { minLength: 1 }),
    kind: resolvedKind,
    lines: asArray(obj.lines, `${path}.lines`, (item, itemPath) => asString(item, itemPath), []),
    canonicalTarget: canonicalTarget,
  };
}

function parseResumeSectionPresenceV2(value, path) {
  if (value === undefined || value === null) return undefined;
  const obj = assertObject(value, path);

  return {
    summary: asBoolean(obj.summary, `${path}.summary`),
    work: asBoolean(obj.work, `${path}.work`),
    projects: asBoolean(obj.projects, `${path}.projects`),
    skills: asBoolean(obj.skills, `${path}.skills`),
    education: asBoolean(obj.education, `${path}.education`),
    awards: asBoolean(obj.awards, `${path}.awards`),
    languages: asBoolean(obj.languages, `${path}.languages`),
  };
}

function parseKeywordGap(value, path) {
  const obj = assertObject(value, path);
  return {
    keyword: asString(obj.keyword, `${path}.keyword`),
    importance: asEnum(obj.importance, ['high', 'medium', 'low'], `${path}.importance`),
    suggestedPhrases: asArray(
      obj.suggestedPhrases,
      `${path}.suggestedPhrases`,
      (item, itemPath) => asString(item, itemPath),
      []
    ),
    category: asString(obj.category, `${path}.category`),
  };
}

function parseBulletChange(value, path = 'bulletChange') {
  const obj = assertObject(value, path);
  return {
    section: asString(obj.section, `${path}.section`),
    original: asString(obj.original, `${path}.original`),
    improved: asString(obj.improved, `${path}.improved`),
    type: asEnum(obj.type, ['added', 'removed', 'modified'], `${path}.type`),
  };
}

function parseRewriteSuggestion(value, path) {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`),
    section: asEnum(
      obj.section,
      ['experience', 'projects', 'skills', 'summary'],
      `${path}.section`
    ),
    originalText: asString(obj.originalText, `${path}.originalText`),
    improvedText: asString(obj.improvedText, `${path}.improvedText`),
    rationale: asString(obj.rationale, `${path}.rationale`),
    atsNotes: asString(obj.atsNotes, `${path}.atsNotes`),
  };
}

function parseAtsCheck(value, path) {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`),
    name: asString(obj.name, `${path}.name`),
    status: asEnum(obj.status, ['pass', 'warning', 'fail'], `${path}.status`),
    message: asString(obj.message, `${path}.message`),
    tip: asString(obj.tip, `${path}.tip`, { optional: true }),
  };
}

function parseRiskFlag(value, path) {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`),
    title: asString(obj.title, `${path}.title`),
    description: asString(obj.description, `${path}.description`),
    severity: asEnum(obj.severity, ['high', 'medium', 'low'], `${path}.severity`),
  };
}

function parseRecommendedEdit(value, path) {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`),
    text: asString(obj.text, `${path}.text`),
    completed: asBoolean(obj.completed, `${path}.completed`),
  };
}

function parseAnalysisSnapshot(value, path = 'analysisSnapshot') {
  const obj = assertObject(value, path);
  return {
    id: asString(obj.id, `${path}.id`),
    createdAt: asString(obj.createdAt, `${path}.createdAt`),
    matchScore: asNumber(obj.matchScore, `${path}.matchScore`),
    roleSeniority: asEnum(
      obj.roleSeniority,
      ['junior', 'mid', 'senior', 'lead', 'executive'],
      `${path}.roleSeniority`
    ),
    overallFit: asEnum(obj.overallFit, ['poor', 'fair', 'good', 'great'], `${path}.overallFit`),
    targetRole: asString(obj.targetRole, `${path}.targetRole`),
    company: asString(obj.company, `${path}.company`, { optional: true }),
    status: asEnum(obj.status, ['completed', 'processing', 'failed'], `${path}.status`),
    keywordGaps: asArray(obj.keywordGaps, `${path}.keywordGaps`, parseKeywordGap, []),
    bulletChanges: asArray(obj.bulletChanges, `${path}.bulletChanges`, parseBulletChange, []),
    rewriteSuggestions: asArray(
      obj.rewriteSuggestions,
      `${path}.rewriteSuggestions`,
      parseRewriteSuggestion,
      []
    ),
    atsChecks: asArray(obj.atsChecks, `${path}.atsChecks`, parseAtsCheck, []),
    riskFlags: asArray(obj.riskFlags, `${path}.riskFlags`, parseRiskFlag, []),
    recommendedEdits: asArray(
      obj.recommendedEdits,
      `${path}.recommendedEdits`,
      parseRecommendedEdit,
      []
    ),
  };
}

function parseAiParsedResumePayloadV2(value, path = 'aiParsedResumePayload') {
  const obj = assertObject(value, path);
  return {
    version: asEnum(obj.version, ['2'], `${path}.version`),
    resumeData: parseResumeDataV2(obj.resumeData, `${path}.resumeData`),
    source: parseResumeSourceMetaV2(obj.source, `${path}.source`),
    notes: asArray(obj.notes, `${path}.notes`, (item, itemPath) => asString(item, itemPath), []),
    sections:
      obj.sections === undefined
        ? undefined
        : asArray(obj.sections, `${path}.sections`, parseResumeSectionBlockV2, []),
    sectionPresence: parseResumeSectionPresenceV2(obj.sectionPresence, `${path}.sectionPresence`),
    customSections:
      obj.customSections === undefined
        ? undefined
        : asArray(obj.customSections, `${path}.customSections`, parseResumeSectionBlockV2, []),
  };
}

function parseAiParsedMetaV2(value, path = 'aiParsedMeta') {
  const obj = assertObject(value, path);
  if (
    Object.prototype.hasOwnProperty.call(obj, 'resumeData') ||
    Object.prototype.hasOwnProperty.call(obj, 'source')
  ) {
    throw new SchemaError('Expected parsed metadata only', path);
  }
  return {
    version: asEnum(obj.version, ['2'], `${path}.version`),
    parser: asString(obj.parser, `${path}.parser`, { optional: true }),
    parsedAt: asString(obj.parsedAt, `${path}.parsedAt`, { optional: true }),
    notes: asArray(obj.notes, `${path}.notes`, (item, itemPath) => asString(item, itemPath), []),
    sections:
      obj.sections === undefined
        ? undefined
        : asArray(obj.sections, `${path}.sections`, parseResumeSectionBlockV2, []),
    sectionPresence: parseResumeSectionPresenceV2(obj.sectionPresence, `${path}.sectionPresence`),
    customSections:
      obj.customSections === undefined
        ? undefined
        : asArray(obj.customSections, `${path}.customSections`, parseResumeSectionBlockV2, []),
  };
}

function parseAiReasoningPayload(value, path = 'aiReasoningPayload') {
  const obj = assertObject(value, path);
  return {
    version: asEnum(obj.version, ['1'], `${path}.version`),
    summary: asString(obj.summary, `${path}.summary`, { optional: true }),
    highlights: asArray(
      obj.highlights,
      `${path}.highlights`,
      (item, itemPath) => asString(item, itemPath),
      []
    ),
    warnings: asArray(
      obj.warnings,
      `${path}.warnings`,
      (item, itemPath) => asString(item, itemPath),
      []
    ),
  };
}

function parseResumeWorkspaceV2(value, path = 'resumeWorkspace') {
  const obj = assertObject(value, path);
  const analysis = assertObject(obj.analysis, `${path}.analysis`);
  const ai = assertObject(analysis.ai, `${path}.analysis.ai`);
  const timestamps = assertObject(obj.timestamps, `${path}.timestamps`);

  const resultIdValue = analysis.resultId;
  const resultId =
    resultIdValue === null
      ? null
      : asString(resultIdValue, `${path}.analysis.resultId`);

  const lastAnalysisValue = analysis.lastAnalysisResult;
  const lastAnalysisResult =
    lastAnalysisValue === null || lastAnalysisValue === undefined
      ? null
      : parseAnalysisSnapshot(lastAnalysisValue, `${path}.analysis.lastAnalysisResult`);

  return {
    version: asEnum(obj.version, ['2'], `${path}.version`),
    source: parseResumeSourceMetaV2(obj.source, `${path}.source`),
    resumeData: parseResumeDataV2(obj.resumeData, `${path}.resumeData`),
    analysis: {
      resultId,
      lastAnalysisResult,
      bulletChanges: asArray(
        analysis.bulletChanges,
        `${path}.analysis.bulletChanges`,
        parseBulletChange,
        []
      ),
      ai: {
        parsed:
          ai.parsed === null || ai.parsed === undefined
            ? null
            : parseAiParsedMetaV2(ai.parsed, `${path}.analysis.ai.parsed`),
        reasoning:
          ai.reasoning === null || ai.reasoning === undefined
            ? null
            : parseAiReasoningPayload(ai.reasoning, `${path}.analysis.ai.reasoning`),
      },
    },
    timestamps: {
      createdAt: asString(timestamps.createdAt, `${path}.timestamps.createdAt`),
      updatedAt: asString(timestamps.updatedAt, `${path}.timestamps.updatedAt`),
    },
  };
}

const resumeDataSchema = createSchema(parseResumeDataV2);
const resumeSourceMetaSchema = createSchema(parseResumeSourceMetaV2);
const analysisSnapshotSchema = createSchema(parseAnalysisSnapshot);
const aiParsedResumePayloadSchema = createSchema(parseAiParsedResumePayloadV2);
const aiReasoningPayloadSchema = createSchema(parseAiReasoningPayload);
const resumeWorkspaceSchema = createSchema(parseResumeWorkspaceV2);

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createEmptyResumeData(overrides = {}) {
  const timestamp = nowIso();
  const base = {
    id: createId('resume'),
    metadata: {
      importedAt: timestamp,
      lastModified: timestamp,
      templateUsed: 'classic',
    },
    basics: undefined,
    summary: undefined,
    education: [],
    work: [],
    projects: [],
    awards: [],
    skills: [],
    languages: [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  };

  const merged = {
    ...base,
    ...overrides,
    metadata: {
      ...base.metadata,
      ...(overrides.metadata || {}),
    },
    education: Array.isArray(overrides.education) ? overrides.education : base.education,
    work: Array.isArray(overrides.work) ? overrides.work : base.work,
    projects: Array.isArray(overrides.projects) ? overrides.projects : base.projects,
    awards: Array.isArray(overrides.awards) ? overrides.awards : base.awards,
    skills: Array.isArray(overrides.skills) ? overrides.skills : base.skills,
    languages: Array.isArray(overrides.languages) ? overrides.languages : base.languages,
    customSections: Array.isArray(overrides.customSections)
      ? overrides.customSections
      : base.customSections,
    sectionOrder: Array.isArray(overrides.sectionOrder) ? overrides.sectionOrder : base.sectionOrder,
    versions: Array.isArray(overrides.versions) ? overrides.versions : base.versions,
  };

  return resumeDataSchema.parse(merged);
}

function createEmptySourceMeta(overrides = {}) {
  const base = {
    inputType: 'text',
    rawText: '',
    importedAt: nowIso(),
    parser: 'manual',
    parsedAt: nowIso(),
  };

  const merged = {
    ...base,
    ...overrides,
  };

  return resumeSourceMetaSchema.parse(merged);
}

function createEmptyWorkspace(overrides = {}) {
  const timestamp = nowIso();
  const base = {
    version: '2',
    source: createEmptySourceMeta(),
    resumeData: createEmptyResumeData(),
    analysis: {
      resultId: null,
      lastAnalysisResult: null,
      bulletChanges: [],
      ai: {
        parsed: null,
        reasoning: null,
      },
    },
    timestamps: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  };

  const merged = {
    ...base,
    ...overrides,
    source: {
      ...base.source,
      ...(overrides.source || {}),
    },
    resumeData: {
      ...base.resumeData,
      ...(overrides.resumeData || {}),
      metadata: {
        ...base.resumeData.metadata,
        ...(overrides.resumeData && overrides.resumeData.metadata ? overrides.resumeData.metadata : {}),
      },
      education:
        overrides.resumeData && Array.isArray(overrides.resumeData.education)
          ? overrides.resumeData.education
          : base.resumeData.education,
      work:
        overrides.resumeData && Array.isArray(overrides.resumeData.work)
          ? overrides.resumeData.work
          : base.resumeData.work,
      projects:
        overrides.resumeData && Array.isArray(overrides.resumeData.projects)
          ? overrides.resumeData.projects
          : base.resumeData.projects,
      awards:
        overrides.resumeData && Array.isArray(overrides.resumeData.awards)
          ? overrides.resumeData.awards
          : base.resumeData.awards,
      skills:
        overrides.resumeData && Array.isArray(overrides.resumeData.skills)
          ? overrides.resumeData.skills
          : base.resumeData.skills,
      languages:
        overrides.resumeData && Array.isArray(overrides.resumeData.languages)
          ? overrides.resumeData.languages
          : base.resumeData.languages,
      customSections:
        overrides.resumeData && Array.isArray(overrides.resumeData.customSections)
          ? overrides.resumeData.customSections
          : base.resumeData.customSections,
      sectionOrder:
        overrides.resumeData && Array.isArray(overrides.resumeData.sectionOrder)
          ? overrides.resumeData.sectionOrder
          : base.resumeData.sectionOrder,
      versions:
        overrides.resumeData && Array.isArray(overrides.resumeData.versions)
          ? overrides.resumeData.versions
          : base.resumeData.versions,
    },
    analysis: {
      ...base.analysis,
      ...(overrides.analysis || {}),
      ai: {
        ...base.analysis.ai,
        ...(overrides.analysis && overrides.analysis.ai ? overrides.analysis.ai : {}),
      },
    },
    timestamps: {
      ...base.timestamps,
      ...(overrides.timestamps || {}),
    },
  };

  return resumeWorkspaceSchema.parse(merged);
}

function safeParseResumeWorkspace(input) {
  return resumeWorkspaceSchema.safeParse(input);
}

module.exports = {
  resumeDataSchema,
  resumeWorkspaceSchema,
  analysisSnapshotSchema,
  aiParsedResumePayloadSchema,
  aiReasoningPayloadSchema,
  safeParseResumeWorkspace,
  createEmptyWorkspace,
  createEmptyResumeData,
  createEmptySourceMeta,
};
