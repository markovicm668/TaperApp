const {
  createEmptyResumeData,
  createEmptySourceMeta,
} = require('@resume-scanner/resume-contract');

const ALLOWED_INPUT_TYPES = new Set(['file', 'text', 'linkedin']);

const RESUME_SECTION_KINDS = new Set([
  'header',
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
  'custom',
]);

const SECTION_CANONICAL_TARGETS = new Set([
  'summary',
  'work',
  'projects',
  'skills',
  'education',
  'awards',
  'languages',
  'none',
]);

const LIST_PREFIX_RE = /^\s*(?:[-*•●▪◦–—−]|(?:\(?\d{1,3}[.)]))\s+/u;

function sanitizeString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function sanitizeUnknownString(value) {
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number') return sanitizeString(String(value));
  return undefined;
}

function extractTextValue(value, preferredKeys = ['text', 'name', 'label', 'value']) {
  const direct = sanitizeUnknownString(value);
  if (direct) return direct;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  for (const key of preferredKeys) {
    const candidate = sanitizeUnknownString(value[key]);
    if (candidate) return candidate;
  }

  return undefined;
}

function normalizeListItem(value) {
  const normalized = sanitizeString(value);
  if (!normalized) return undefined;
  return sanitizeString(normalized.replace(LIST_PREFIX_RE, ''));
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => extractTextValue(value))
    .filter(Boolean);
}

function normalizeBulletArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) =>
      normalizeListItem(
        extractTextValue(value, ['text', 'originalText', 'improved', 'original', 'value', 'name']) || ''
      )
    )
    .filter(Boolean);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toCategoryKey(value, fallbackIndex) {
  const normalized = String(value || '')
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  if (!normalized) return `category${fallbackIndex + 1}`;

  const parts = normalized.split(/\s+/);
  const [first, ...rest] = parts;
  const tail = rest.map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`);
  return `${first.toLowerCase()}${tail.join('')}`;
}

function titleCaseWords(value) {
  return String(value || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function splitInlineList(value) {
  return String(value || '')
    .split(/[,;|]/)
    .map((item) => sanitizeString(item))
    .filter(Boolean);
}

function normalizeLocationObject(locationCandidate) {
  if (!locationCandidate) return undefined;

  if (typeof locationCandidate === 'string') {
    const locationText = sanitizeString(locationCandidate);
    if (!locationText) return undefined;

    const parts = locationText.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        city: parts[0],
        country: parts.slice(1).join(', '),
      };
    }

    return {
      city: locationText,
    };
  }

  if (typeof locationCandidate !== 'object' || Array.isArray(locationCandidate)) return undefined;

  const location = {
    address: sanitizeString(locationCandidate.address),
    postalCode: sanitizeString(locationCandidate.postalCode),
    city: sanitizeString(locationCandidate.city),
    region: sanitizeString(locationCandidate.region || locationCandidate.state),
    country: sanitizeString(locationCandidate.country),
    countryCode: sanitizeString(locationCandidate.countryCode),
  };

  const hasAny = Object.values(location).some((value) => value !== undefined);
  return hasAny ? location : undefined;
}

function normalizeBasics(basicsCandidate) {
  if (!basicsCandidate || typeof basicsCandidate !== 'object' || Array.isArray(basicsCandidate)) {
    return undefined;
  }

  const profiles = [];

  ensureArray(basicsCandidate.profiles || basicsCandidate.links).forEach((profile) => {
    if (typeof profile === 'string') {
      const url = sanitizeString(profile);
      if (!url) return;
      profiles.push({ url });
      return;
    }

    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return;

    const network = sanitizeString(profile.network || profile.label || profile.name);
    const username = sanitizeString(profile.username);
    const url = sanitizeString(profile.url || profile.link || profile.website);
    if (!network && !username && !url) return;

    profiles.push({
      ...(network ? { network } : {}),
      ...(username ? { username } : {}),
      ...(url ? { url } : {}),
    });
  });

  const title = sanitizeString(basicsCandidate.title || basicsCandidate.label);
  const normalized = {
    id: sanitizeString(basicsCandidate.id),
    name: sanitizeString(basicsCandidate.name || basicsCandidate.fullName),
    title,
    label: title,
    email: sanitizeString(basicsCandidate.email || basicsCandidate.emailAddress),
    phone: sanitizeString(basicsCandidate.phone || basicsCandidate.phoneNumber || basicsCandidate.mobile),
    url: sanitizeString(basicsCandidate.url || basicsCandidate.website || basicsCandidate.link),
    location: normalizeLocationObject(basicsCandidate.location),
    ...(profiles.length ? { profiles } : {}),
  };

  const hasAny = Object.values(normalized).some((value) => value !== undefined);
  return hasAny ? normalized : undefined;
}

function normalizeHighlights(highlightsCandidate, prefix = 'highlight') {
  const bulletLines = normalizeBulletArray(ensureArray(highlightsCandidate));
  return bulletLines.map((text, index) => ({
    id: `${prefix}-${index + 1}`,
    text,
    originalText: text,
    source: 'user',
    locked: false,
    aiTags: [],
    keywordMatches: [],
  }));
}

function normalizeTechnologies(technologiesCandidate) {
  const rawItems = Array.isArray(technologiesCandidate)
    ? technologiesCandidate
    : splitInlineList(technologiesCandidate);

  return rawItems
    .map((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const name = extractTextValue(item, ['name', 'skill', 'technology', 'tool', 'value']);
        if (!name) return undefined;
        return {
          skillRefId: sanitizeString(item.skillRefId) || `skill-ref-${index + 1}`,
          name,
        };
      }

      const name = extractTextValue(item);
      if (!name) return undefined;
      return {
        skillRefId: `skill-ref-${index + 1}`,
        name,
      };
    })
    .filter(Boolean);
}

function normalizeWork(workCandidate) {
  return ensureArray(workCandidate)
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;

      const startDate = sanitizeString(item.startDate || item.start || item.from);
      const endDateRaw = sanitizeString(item.endDate || item.end || item.to);
      const endDate = endDateRaw || (item.current === true ? 'Present' : undefined);

      const highlights = normalizeHighlights(
        item.highlights ||
          item.bullets ||
          item.achievements ||
          item.responsibilities ||
          item.points,
        `work-${index + 1}-highlight`
      );

      const normalized = {
        id: sanitizeString(item.id) || `work-${index + 1}`,
        company: sanitizeString(item.company || item.employer || item.organization || item.name),
        position: sanitizeString(item.position || item.role || item.title || item.jobTitle),
        startDate,
        endDate,
        isCurrent: item.current === true || item.isCurrent === true,
        location: normalizeLocationObject(item.location),
        highlights,
      };

      const hasAny =
        Boolean(normalized.company) ||
        Boolean(normalized.position) ||
        Boolean(normalized.startDate) ||
        Boolean(normalized.endDate) ||
        Boolean(normalized.location) ||
        normalized.highlights.length > 0;

      return hasAny ? normalized : undefined;
    })
    .filter(Boolean);
}

function normalizeEducation(educationCandidate) {
  return ensureArray(educationCandidate)
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;

      const normalized = {
        id: sanitizeString(item.id) || `education-${index + 1}`,
        institution: sanitizeString(item.institution || item.school || item.university || item.organization),
        area: sanitizeString(item.area || item.field || item.major || item.program),
        degree: sanitizeString(item.degree || item.studyType || item.level),
        studyType: sanitizeString(item.degree || item.studyType || item.level),
        startDate: sanitizeString(item.startDate || item.start || item.from),
        endDate: sanitizeString(item.endDate || item.end || item.to),
        location: normalizeLocationObject(item.location),
        gpa: sanitizeString(item.gpa),
        honors: normalizeStringArray(item.honors),
      };

      const hasAny =
        Boolean(normalized.institution) ||
        Boolean(normalized.area) ||
        Boolean(normalized.degree) ||
        Boolean(normalized.startDate) ||
        Boolean(normalized.endDate) ||
        Boolean(normalized.location) ||
        Boolean(normalized.gpa) ||
        normalized.honors.length > 0;
      return hasAny ? normalized : undefined;
    })
    .filter(Boolean);
}

function normalizeProjects(projectsCandidate) {
  return ensureArray(projectsCandidate)
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;

      const technologies = normalizeTechnologies(
        item.technologies || item.stack || item.tech || item.tools
      );

      const highlights = normalizeHighlights(
        item.highlights || item.bullets || item.achievements,
        `project-${index + 1}-highlight`
      );

      const normalized = {
        id: sanitizeString(item.id) || `project-${index + 1}`,
        name: sanitizeString(item.name || item.title || item.project),
        role: sanitizeString(item.role),
        description: sanitizeString(item.description || item.summary),
        technologies,
        startDate: sanitizeString(item.startDate || item.start || item.from),
        endDate: sanitizeString(item.endDate || item.end || item.to),
        repository: sanitizeString(item.repository),
        url: sanitizeString(item.url || item.link),
        highlights,
      };

      const hasAny =
        Boolean(normalized.name) ||
        Boolean(normalized.role) ||
        Boolean(normalized.description) ||
        normalized.technologies.length > 0 ||
        Boolean(normalized.startDate) ||
        Boolean(normalized.endDate) ||
        Boolean(normalized.repository) ||
        Boolean(normalized.url) ||
        normalized.highlights.length > 0;

      return hasAny ? normalized : undefined;
    })
    .filter(Boolean);
}

function normalizeAwards(awardsCandidate) {
  return ensureArray(awardsCandidate)
    .map((item, index) => {
      if (typeof item === 'string') {
        const title = sanitizeString(item);
        return title
          ? {
              id: `award-${index + 1}`,
              title,
            }
          : undefined;
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;

      const normalized = {
        id: sanitizeString(item.id) || `award-${index + 1}`,
        title: sanitizeString(item.title || item.name),
        issuer: sanitizeString(item.issuer),
        date: sanitizeString(item.date),
        summary: sanitizeString(item.summary || item.description),
      };

      const hasAny = Boolean(normalized.title || normalized.issuer || normalized.date || normalized.summary);
      return hasAny ? normalized : undefined;
    })
    .filter(Boolean);
}

function parseLanguageString(value) {
  const line = sanitizeString(value);
  if (!line) return undefined;

  const match = line.match(/^([^()]+?)\s*\(([^()]+)\)$/);
  if (match) {
    return {
      language: sanitizeString(match[1]),
      fluency: sanitizeString(match[2]),
    };
  }

  return {
    language: line,
  };
}

function normalizeLanguages(languagesCandidate) {
  return ensureArray(languagesCandidate)
    .flatMap((item, index) => {
      if (typeof item === 'string') {
        const parsed = parseLanguageString(item);
        return parsed
          ? [
              {
                id: `language-${index + 1}`,
                ...parsed,
              },
            ]
          : [];
      }

      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

      const normalized = {
        id: sanitizeString(item.id) || `language-${index + 1}`,
        language: sanitizeString(item.language || item.name),
        fluency: sanitizeString(item.fluency || item.level || item.proficiency),
      };

      const hasAny = Object.values(normalized).some((value) => value !== undefined);
      return hasAny ? [normalized] : [];
    })
    .filter(Boolean);
}

function normalizeSkills(skillsCandidate) {
  if (!skillsCandidate) return [];

  if (typeof skillsCandidate === 'string') {
    const items = splitInlineList(skillsCandidate);
    return items.map((name, index) => ({
      id: `skill-${index + 1}`,
      name,
      category: 'General',
    }));
  }

  if (Array.isArray(skillsCandidate)) {
    const result = [];

    skillsCandidate.forEach((entry, index) => {
      if (typeof entry === 'string') {
        const items = splitInlineList(entry);
        if (!items.length) return;

        items.forEach((name, itemIndex) => {
          result.push({
            id: `skill-${index + 1}-${itemIndex + 1}`,
            name,
            category: 'General',
          });
        });
        return;
      }

      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;

      const category = sanitizeString(entry.category || entry.name || `Category ${index + 1}`) || 'General';
      const items = Array.isArray(entry.items)
        ? normalizeStringArray(entry.items)
        : splitInlineList(entry.items || entry.skills || entry.keywords);

      if (items.length) {
        items.forEach((name, itemIndex) => {
          result.push({
            id: `skill-${index + 1}-${itemIndex + 1}`,
            name,
            category,
          });
        });
        return;
      }

      const directName = sanitizeString(entry.name || entry.skill || entry.keyword || entry.value);
      if (!directName) return;

      result.push({
        id: sanitizeString(entry.id) || `skill-${index + 1}`,
        name: directName,
        category: sanitizeString(entry.category) || 'General',
      });
    });

    return dedupeSkills(result);
  }

  if (typeof skillsCandidate !== 'object') return [];

  const result = [];

  Object.entries(skillsCandidate).forEach(([rawKey, rawValue], index) => {
    const category = titleCaseWords(rawKey) || `Category ${index + 1}`;

    const items = Array.isArray(rawValue)
      ? normalizeStringArray(rawValue)
      : typeof rawValue === 'string'
        ? splitInlineList(rawValue)
        : rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? Array.isArray(rawValue.items)
            ? normalizeStringArray(rawValue.items)
            : splitInlineList(rawValue.items || rawValue.skills || rawValue.keywords)
          : [];

    if (items.length) {
      items.forEach((name, itemIndex) => {
        result.push({
          id: `skill-${index + 1}-${itemIndex + 1}`,
          name,
          category,
        });
      });
      return;
    }

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      const directName = sanitizeString(rawValue.name || rawValue.skill || rawValue.keyword || rawValue.value);
      if (!directName) return;
      result.push({
        id: sanitizeString(rawValue.id) || `skill-${toCategoryKey(rawKey, index)}-1`,
        name: directName,
        category,
      });
    }
  });

  return dedupeSkills(result);
}

function dedupeSkills(skills) {
  const seen = new Set();
  return skills.filter((item) => {
    const key = `${item.category || 'General'}::${item.name || ''}`.toLowerCase();
    if (!item.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeResumeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return {
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
  }

  const basics = normalizeBasics(candidate.basics || candidate.header || candidate.contact);
  const summary = sanitizeString(candidate.summary);
  const education = normalizeEducation(candidate.education);
  const work = normalizeWork(candidate.work || candidate.experience);
  const projects = normalizeProjects(candidate.projects);
  const awards = normalizeAwards(candidate.awards || candidate.achievements);
  const skills = normalizeSkills(candidate.skills);
  const languages = normalizeLanguages(candidate.languages);

  return {
    id: sanitizeString(candidate.id),
    metadata: candidate.metadata && typeof candidate.metadata === 'object' ? candidate.metadata : undefined,
    basics,
    summary,
    education,
    work,
    projects,
    awards,
    skills,
    languages,
    customSections: ensureArray(candidate.customSections),
    sectionOrder: normalizeStringArray(candidate.sectionOrder),
    versions: ensureArray(candidate.versions),
  };
}

function inferSectionKind(kindCandidate, title) {
  const directKind = sanitizeString(kindCandidate)?.toLowerCase();
  if (directKind === 'experience') return 'work';
  if (directKind && RESUME_SECTION_KINDS.has(directKind)) {
    return directKind;
  }

  const normalizedTitle = (title || '').toLowerCase();
  if (/^header$/.test(normalizedTitle)) return 'header';
  if (/summary|profile|about|objective/.test(normalizedTitle)) return 'summary';
  if (/experience|employment|work history|professional background/.test(normalizedTitle)) return 'work';
  if (/skills|competenc|tool/.test(normalizedTitle)) return 'skills';
  if (/education|academic|qualification/.test(normalizedTitle)) return 'education';
  if (/project/.test(normalizedTitle)) return 'projects';
  if (/award|achievement|honor/.test(normalizedTitle)) return 'awards';
  if (/language/.test(normalizedTitle)) return 'languages';
  return 'custom';
}

function inferCanonicalTarget(targetCandidate, kind) {
  const directTarget = sanitizeString(targetCandidate)?.toLowerCase();
  const mappedDirectTarget = directTarget === 'experience' ? 'work' : directTarget;

  if (mappedDirectTarget && SECTION_CANONICAL_TARGETS.has(mappedDirectTarget)) {
    return mappedDirectTarget;
  }

  switch (kind) {
    case 'summary':
      return 'summary';
    case 'work':
      return 'work';
    case 'projects':
      return 'projects';
    case 'skills':
      return 'skills';
    case 'education':
      return 'education';
    case 'awards':
      return 'awards';
    case 'languages':
      return 'languages';
    default:
      return 'none';
  }
}

function normalizeSectionBlocks(candidateSections) {
  return ensureArray(candidateSections)
    .map((section, index) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return undefined;

      const title = sanitizeString(section.title) || `Section ${index + 1}`;
      const kind = inferSectionKind(section.kind, title);
      const canonicalTarget = inferCanonicalTarget(section.canonicalTarget, kind);

      const lines = Array.isArray(section.lines)
        ? normalizeStringArray(section.lines)
        : typeof section.content === 'string'
          ? section.content
              .split(/\r?\n/)
              .map((line) => sanitizeString(line))
              .filter(Boolean)
          : [];

      if (!lines.length) return undefined;

      return {
        id: sanitizeString(section.id) || `section-${index + 1}`,
        title,
        kind,
        lines,
        canonicalTarget,
      };
    })
    .filter(Boolean);
}

function deriveSectionPresence(sections, normalizedResume) {
  const hasSectionTarget = (target) =>
    sections.some((section) => section.canonicalTarget === target && section.lines.length > 0);

  return {
    summary: Boolean(normalizedResume.summary || hasSectionTarget('summary')),
    work: Boolean((normalizedResume.work && normalizedResume.work.length) || hasSectionTarget('work')),
    projects: Boolean(
      (normalizedResume.projects && normalizedResume.projects.length) || hasSectionTarget('projects')
    ),
    skills: Boolean(
      (normalizedResume.skills && normalizedResume.skills.length) || hasSectionTarget('skills')
    ),
    education: Boolean(
      (normalizedResume.education && normalizedResume.education.length) || hasSectionTarget('education')
    ),
    awards: Boolean(
      (normalizedResume.awards && normalizedResume.awards.length) || hasSectionTarget('awards')
    ),
    languages: Boolean(
      (normalizedResume.languages && normalizedResume.languages.length) || hasSectionTarget('languages')
    ),
  };
}

function deriveCustomSections(sections) {
  return sections.filter(
    (section) =>
      section.canonicalTarget === 'none' &&
      section.kind !== 'header' &&
      section.lines.length > 0
  );
}

function buildParsedPayload({
  resumeCandidate,
  sectionBlocks,
  resumeText,
  inputType,
  fileName,
  parserName,
  notes = [],
}) {
  const normalizedResume = normalizeResumeCandidate(resumeCandidate);
  const normalizedSections = normalizeSectionBlocks(
    sectionBlocks || (resumeCandidate && resumeCandidate.sections)
  );
  const sectionPresence = deriveSectionPresence(normalizedSections, normalizedResume);
  const customSections = deriveCustomSections(normalizedSections);
  const now = new Date().toISOString();
  const safeInputType = ALLOWED_INPUT_TYPES.has(inputType) ? inputType : 'text';

  const source = createEmptySourceMeta({
    inputType: safeInputType,
    rawText: resumeText,
    importedAt: now,
    parsedAt: now,
    parser: parserName,
    ...(fileName ? { fileName } : {}),
  });

  const resumeData = createEmptyResumeData({
    ...(normalizedResume.id ? { id: normalizedResume.id } : {}),
    ...(normalizedResume.metadata ? { metadata: normalizedResume.metadata } : {}),
    ...(normalizedResume.basics ? { basics: normalizedResume.basics } : {}),
    ...(normalizedResume.summary ? { summary: normalizedResume.summary } : {}),
    education: normalizedResume.education || [],
    work: normalizedResume.work || [],
    projects: normalizedResume.projects || [],
    awards: normalizedResume.awards || [],
    skills: normalizedResume.skills || [],
    languages: normalizedResume.languages || [],
    customSections: [],
    sectionOrder: [],
    versions: [],
  });

  return {
    version: '2',
    resumeData,
    source,
    notes: normalizeStringArray(notes),
    ...(normalizedSections.length ? { sections: normalizedSections } : {}),
    ...(normalizedSections.length ? { sectionPresence } : {}),
    ...(normalizedSections.length ? { customSections } : {}),
  };
}

module.exports = {
  buildParsedPayload,
  normalizeResumeCandidate,
  normalizeSectionBlocks,
  normalizeStringArray,
};
