function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isNonEmptyText(value) {
  return toText(value).length > 0;
}

function escapeHtml(value) {
  return toText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueText(values) {
  return Array.from(
    new Set(
      values
        .map((value) => toText(value))
        .filter((value) => value.length > 0)
    )
  );
}

function stripBullet(text) {
  return toText(text).replace(/^\s*(?:[-*•●▪◦–—−]|\(?\d{1,3}[.)])\s+/, '');
}

function toBulletArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return stripBullet(item);
        if (item && typeof item === 'object') {
          const text = pickText(item.text, item.improved, item.originalText, item.original);
          return stripBullet(text);
        }
        return '';
      })
      .filter(isNonEmptyText);
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map(stripBullet)
      .filter(isNonEmptyText);
  }
  return [];
}

function formatLocation(location) {
  if (!location) return '';
  if (typeof location === 'string') return toText(location);
  if (typeof location === 'object') {
    const parts = [
      location.city,
      location.region,
      location.state,
      location.country,
      location.countryCode,
      location.address,
    ]
      .map(toText)
      .filter(isNonEmptyText);
    return parts.join(', ');
  }
  return '';
}

function formatDateRange(startDate, endDate, isCurrent) {
  const start = toText(startDate);
  const end = toText(endDate);
  if (!start && !end && !isCurrent) return '';
  if (!end && isCurrent) return start ? `${start} - Present` : 'Present';
  if (!start) return end;
  if (!end) return start;
  return `${start} - ${end}`;
}

function pickText(...values) {
  for (const value of values) {
    if (isNonEmptyText(value)) return toText(value);
  }
  return '';
}

function splitKeyWords(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
}

function titleCaseWords(value) {
  return splitKeyWords(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');
}

function normalizeSectionKind(kind, title) {
  const normalizedKind = toText(kind).toLowerCase();
  if (normalizedKind === 'experience') return 'work';

  if (
    [
      'header',
      'summary',
      'work',
      'projects',
      'skills',
      'education',
      'awards',
      'languages',
      'custom',
    ].includes(normalizedKind)
  ) {
    return normalizedKind;
  }

  const normalizedTitle = toText(title).toLowerCase();
  if (/summary|profile|about|objective/.test(normalizedTitle)) return 'summary';
  if (/experience|employment|work history/.test(normalizedTitle)) return 'work';
  if (/project/.test(normalizedTitle)) return 'projects';
  if (/skill|competenc|tools/.test(normalizedTitle)) return 'skills';
  if (/education|academic/.test(normalizedTitle)) return 'education';
  if (/award|achievement|honor/.test(normalizedTitle)) return 'awards';
  if (/language/.test(normalizedTitle)) return 'languages';
  if (/header/.test(normalizedTitle)) return 'header';
  return 'custom';
}

function titleFromKind(kind) {
  switch (kind) {
    case 'header':
      return 'Header';
    case 'summary':
      return 'Summary';
    case 'work':
      return 'Professional Experience';
    case 'projects':
      return 'Projects';
    case 'skills':
      return 'Skills';
    case 'education':
      return 'Education';
    case 'awards':
      return 'Achievements';
    case 'languages':
      return 'Languages';
    default:
      return 'Section';
  }
}

function normalizeDynamicSections(resume) {
  const sections = asArray(resume && resume.sections)
    .map((section, index) => {
      if (!section || typeof section !== 'object') return null;

      const id = pickText(section.id);
      const title = pickText(section.title);
      const kind = normalizeSectionKind(section.kind, title);
      const renderModeRaw = toText(section.renderMode).toLowerCase();
      const renderMode =
        renderModeRaw === 'lines' || renderModeRaw === 'canonical'
          ? renderModeRaw
          : undefined;
      const lines = asArray(section.lines)
        .map((line) => toText(line))
        .filter(isNonEmptyText);

      return {
        id: id || `${kind}-${index + 1}`,
        title: title || titleFromKind(kind),
        kind,
        lines,
        renderMode,
      };
    })
    .filter(Boolean);

  if (!sections.length) return [];

  const byId = new Map(sections.map((section) => [section.id, section]));
  const orderedIds = asArray(resume && resume.sectionOrder)
    .map((item) => toText(item))
    .filter(isNonEmptyText);

  if (!orderedIds.length) return sections;

  const ordered = [];
  const seen = new Set();

  orderedIds.forEach((id) => {
    const section = byId.get(id);
    if (!section || seen.has(section.id)) return;
    ordered.push(section);
    seen.add(section.id);
  });

  sections.forEach((section) => {
    if (seen.has(section.id)) return;
    ordered.push(section);
    seen.add(section.id);
  });

  return ordered;
}

function buildContactLines(basics) {
  const primary = [];
  const secondary = [];

  const email = pickText(basics.email, basics.emailAddress);
  const phone = pickText(basics.phone, basics.phoneNumber, basics.mobile);
  const location = formatLocation(basics.location);
  const url = pickText(basics.url, basics.website, basics.link, basics.portfolio);

  if (email) primary.push(email);
  if (phone) primary.push(phone);
  if (location) primary.push(location);
  if (url) secondary.push(url);

  const links = asArray(basics.links).concat(asArray(basics.profiles));
  links.forEach((link) => {
    if (typeof link === 'string') {
      if (isNonEmptyText(link)) secondary.push(link.trim());
      return;
    }

    if (link && typeof link === 'object') {
      const label = pickText(link.label, link.network, link.name);
      const profileUrl = pickText(link.url, link.link, link.website);
      if (profileUrl) secondary.push(profileUrl);
      else if (label) secondary.push(label);
    }
  });

  return {
    primary: uniqueText(primary),
    secondary: uniqueText(secondary),
  };
}

function normalizeWork(rawWork) {
  return asArray(rawWork)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const position = pickText(entry.position, entry.role, entry.title, entry.jobTitle);
      const company = pickText(entry.company, entry.employer, entry.organization, entry.name);
      const location = formatLocation(entry.location);
      const startDate = pickText(entry.startDate, entry.start, entry.from);
      const endDate = pickText(entry.endDate, entry.end, entry.to);
      const dateRange = formatDateRange(startDate, endDate, entry.current || entry.isCurrent);
      const highlights = toBulletArray(
        entry.highlights ||
          entry.bullets ||
          entry.achievements ||
          entry.responsibilities ||
          entry.description
      );

      return {
        position,
        company,
        location,
        dateRange,
        highlights,
      };
    })
    .filter((entry) =>
      Boolean(
        entry &&
          (entry.position || entry.company || entry.location || entry.dateRange || entry.highlights.length)
      )
    );
}

function normalizeEducation(rawEducation) {
  return asArray(rawEducation)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const institution = pickText(entry.institution, entry.school, entry.organization, entry.name);
      const studyType = pickText(entry.degree, entry.studyType, entry.level);
      const area = pickText(entry.area, entry.field, entry.major, entry.program);
      const credential = [studyType, area].filter(isNonEmptyText).join(', ');
      const location = formatLocation(entry.location);
      const startDate = pickText(entry.startDate, entry.start, entry.from);
      const endDate = pickText(entry.endDate, entry.end, entry.to);
      const dateRange = formatDateRange(startDate, endDate, entry.current || entry.isCurrent);
      const details = toBulletArray(entry.details || entry.highlights || entry.courses || entry.honors);

      return {
        institution,
        credential,
        location,
        dateRange,
        details,
      };
    })
    .filter((entry) =>
      Boolean(
        entry &&
          (entry.institution || entry.credential || entry.location || entry.dateRange || entry.details.length)
      )
    );
}

function normalizeProjects(rawProjects) {
  return asArray(rawProjects)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;

      const name = pickText(entry.name, entry.title, entry.project);
      const description = pickText(entry.description, entry.summary);
      const technologies = asArray(entry.technologies || entry.stack || entry.tools)
        .flatMap((item) => {
          if (typeof item === 'string') return item.split(/[,|;/]/);
          if (item && typeof item === 'object') return [pickText(item.name, item.skill)];
          return [item];
        })
        .map((item) => toText(item))
        .filter(isNonEmptyText);
      const startDate = pickText(entry.startDate, entry.start, entry.from);
      const endDate = pickText(entry.endDate, entry.end, entry.to);
      const dateRange = formatDateRange(startDate, endDate, entry.current || entry.isCurrent);
      const highlights = toBulletArray(entry.highlights || entry.bullets || entry.achievements);

      return {
        name,
        description,
        technologies,
        dateRange,
        highlights,
      };
    })
    .filter((entry) => {
      return Boolean(
        entry &&
          (entry.name || entry.description || entry.technologies.length || entry.dateRange || entry.highlights.length)
      );
    });
}

function normalizeAwards(rawAwards) {
  return asArray(rawAwards)
    .map((entry) => {
      if (typeof entry === 'string') {
        const title = toText(entry);
        return title ? { title, summary: '' } : null;
      }

      if (!entry || typeof entry !== 'object') return null;

      const title = pickText(entry.title, entry.name);
      const summary = pickText(entry.summary, entry.description);
      if (!title && !summary) return null;

      return {
        title,
        summary,
      };
    })
    .filter(Boolean);
}

function normalizeLanguages(rawLanguages) {
  return asArray(rawLanguages)
    .flatMap((entry) => {
      if (typeof entry === 'string') {
        return entry
          .split(',')
          .map((part) => toText(part))
          .filter(isNonEmptyText)
          .map((part) => {
            const match = part.match(/^([^()]+?)\s*\(([^()]+)\)$/);
            if (match) {
              return {
                language: toText(match[1]),
                fluency: toText(match[2]),
              };
            }
            return { language: part, fluency: '' };
          });
      }

      if (!entry || typeof entry !== 'object') return [];

      const language = pickText(entry.language, entry.name);
      const fluency = pickText(entry.fluency, entry.level, entry.proficiency);
      if (!language && !fluency) return [];

      return [{ language, fluency }];
    })
    .filter((entry) => entry.language || entry.fluency);
}

function normalizeSkills(rawSkills) {
  if (!rawSkills) return { list: [], groups: [] };

  if (typeof rawSkills === 'string') {
    return {
      list: rawSkills
        .split(/[,|;/]/)
        .map((item) => toText(item))
        .filter(isNonEmptyText),
      groups: [],
    };
  }

  if (Array.isArray(rawSkills)) {
    const strings = rawSkills
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .flatMap((item) =>
        String(item)
          .split(/[,|;/]/)
          .map((part) => toText(part))
          .filter(isNonEmptyText)
      );

    const groups = [];
    const groupedByCategory = new Map();

    rawSkills
      .filter((item) => item && typeof item === 'object')
      .forEach((item) => {
        const groupedItems = asArray(item.items || item.keywords || item.skills)
          .map((value) => toText(value))
          .filter(isNonEmptyText);

        if (groupedItems.length) {
          const label = pickText(item.category, item.name, item.label, 'Skills');
          const existing = groupedByCategory.get(label) || [];
          groupedByCategory.set(label, Array.from(new Set([...existing, ...groupedItems])));
          return;
        }

        const name = pickText(item.name, item.skill);
        if (!name) return;
        const label = pickText(item.category, item.group, 'Skills');
        const existing = groupedByCategory.get(label) || [];
        groupedByCategory.set(label, Array.from(new Set([...existing, name])));
      });

    groupedByCategory.forEach((items, label) => {
      groups.push({ label, items });
    });

    if (groups.length && strings.length) {
      return {
        list: [],
        groups: [{ label: 'Skills', items: strings }, ...groups],
      };
    }

    if (groups.length) return { list: [], groups };
    return { list: strings, groups: [] };
  }

  if (typeof rawSkills === 'object') {
    if ('name' in rawSkills || 'category' in rawSkills) {
      const singleName = pickText(rawSkills.name, rawSkills.skill);
      if (singleName) {
        return {
          list: [],
          groups: [
            {
              label: pickText(rawSkills.category, rawSkills.group, 'Skills'),
              items: [singleName],
            },
          ],
        };
      }
    }

    const groups = Object.entries(rawSkills)
      .map(([key, value]) => {
        const items = asArray(value)
          .flatMap((entry) =>
            typeof entry === 'string' ? entry.split(/[,|;/]/) : [entry]
          )
          .map((entry) => toText(entry))
          .filter(isNonEmptyText);
        if (!items.length) return null;

        return {
          label: titleCaseWords(key),
          items,
        };
      })
      .filter(Boolean);

    return {
      list: [],
      groups,
    };
  }

  return { list: [], groups: [] };
}

function renderDashList(items) {
  const normalized = asArray(items)
    .map((item) => stripBullet(item))
    .filter(isNonEmptyText);

  if (!normalized.length) return '';

  return `<ul class="dash-list">${normalized
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join('')}</ul>`;
}

const DATE_RANGE_AT_END_RE = /^(.*?)(?:\s+\|\s+|\s{2,}|\s+)?((?:(?:\d{1,2}\/)?\d{4})\s*(?:-|–|—)\s*(?:present|current|(?:(?:\d{1,2}\/)?\d{4})))$/i;

function renderLinesAsBlock(lines) {
  const normalizedLines = asArray(lines)
    .map((line) => toText(line))
    .filter(isNonEmptyText);

  if (!normalizedLines.length) return '';

  const fragments = [];
  let pendingBullets = [];

  const flushBullets = () => {
    if (!pendingBullets.length) return;
    fragments.push(renderDashList(pendingBullets));
    pendingBullets = [];
  };

  normalizedLines.forEach((line) => {
    if (/^\s*(?:[-*•●▪◦–—−]|\(?\d{1,3}[.)])/.test(line)) {
      pendingBullets.push(line);
      return;
    }

    flushBullets();

    const dateMatch = line.match(DATE_RANGE_AT_END_RE);
    if (dateMatch && dateMatch[1] && dateMatch[2]) {
      fragments.push(
        `<div class="row"><div class="row-left">${escapeHtml(
          toText(dateMatch[1])
        )}</div><div class="row-right">${escapeHtml(toText(dateMatch[2]))}</div></div>`
      );
      return;
    }

    fragments.push(`<p>${escapeHtml(line)}</p>`);
  });

  flushBullets();

  return fragments.join('');
}

function renderParagraphs(text) {
  const paragraphs = toText(text)
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(isNonEmptyText);

  if (!paragraphs.length) return '';
  return paragraphs.map((part) => `<p>${escapeHtml(part)}</p>`).join('');
}

function withTrailingColon(label) {
  const normalized = toText(label);
  if (!normalized) return '';
  return normalized.endsWith(':') ? normalized : `${normalized}:`;
}

function renderCanonicalSection(kind, title, contentHtml) {
  return `<section class="section section-${kind}"><h2>${escapeHtml(title)}</h2>${contentHtml}</section>`;
}

function renderWorkContent(work) {
  return work
    .map((entry) => {
      const roleCompany = [entry.position, entry.company].filter(isNonEmptyText).join(', ');
      return `<div class="experience-item">
        <div class="row">
          <div class="row-left">${escapeHtml(roleCompany)}</div>
          ${entry.dateRange ? `<div class="row-right">${escapeHtml(entry.dateRange)}</div>` : ''}
        </div>
        ${
          entry.location
            ? `<div class="sub-row"><div class="sub-left">${escapeHtml(entry.location)}</div></div>`
            : ''
        }
        ${renderDashList(entry.highlights)}
      </div>`;
    })
    .join('');
}

function renderEducationContent(education) {
  return education
    .map((entry) => {
      const headline = entry.institution || entry.credential;
      const subLeft = entry.institution && entry.credential ? entry.credential : '';
      const hasSubRow = Boolean(subLeft || entry.location);

      return `<div class="education-item">
        <div class="row">
          <div class="row-left">${escapeHtml(headline)}</div>
          ${entry.dateRange ? `<div class="row-right">${escapeHtml(entry.dateRange)}</div>` : ''}
        </div>
        ${
          hasSubRow
            ? `<div class="sub-row">${
                subLeft
                  ? `<div class="sub-left">${escapeHtml(subLeft)}</div>`
                  : '<div class="sub-left"></div>'
              }${entry.location ? `<div class="sub-right">${escapeHtml(entry.location)}</div>` : ''}</div>`
            : ''
        }
        ${renderDashList(entry.details)}
      </div>`;
    })
    .join('');
}

function renderProjectContent(projects) {
  return projects
    .map((entry) => {
      const techLine = entry.technologies.length ? entry.technologies.join(', ') : '';
      const heading = [entry.name, techLine].filter(isNonEmptyText).join(' | ');

      return `<div class="experience-item">
        <div class="row">
          <div class="row-left">${escapeHtml(heading || entry.name || 'Project')}</div>
          ${entry.dateRange ? `<div class="row-right">${escapeHtml(entry.dateRange)}</div>` : ''}
        </div>
        ${entry.description ? `<div class="sub-row"><div class="sub-left">${escapeHtml(entry.description)}</div></div>` : ''}
        ${renderDashList(entry.highlights)}
      </div>`;
    })
    .join('');
}

function renderAwardContent(awards) {
  return awards
    .map((entry) => {
      if (entry.summary) {
        return `<p><strong>${escapeHtml(entry.title)}</strong> — ${escapeHtml(entry.summary)}</p>`;
      }
      return `<p>${escapeHtml(entry.title)}</p>`;
    })
    .join('');
}

function renderLanguageContent(languages) {
  const line = languages
    .map((entry) =>
      entry.fluency
        ? `${escapeHtml(entry.language)} (${escapeHtml(entry.fluency)})`
        : escapeHtml(entry.language)
    )
    .join(', ');

  return line ? `<p>${line}</p>` : '';
}

function renderSkillsContent(skills) {
  if (skills.groups.length) {
    return `<div class="skills-groups">${skills.groups
      .map((group) => {
        const items = group.items.join(', ');
        return `<p class="skill-row"><span class="skill-label">${escapeHtml(
          withTrailingColon(group.label || 'Skills')
        )}</span> <span>${escapeHtml(items)}</span></p>`;
      })
      .join('')}</div>`;
  }

  return skills.list.length ? `<p>${escapeHtml(skills.list.join(', '))}</p>` : '';
}

function validateResume(resume) {
  if (!resume || typeof resume !== 'object' || Array.isArray(resume)) {
    return { ok: false, message: 'resume must be a JSON object.' };
  }

  const basics = resume.basics || resume.header || resume;
  const name = pickText(basics.name, basics.fullName, resume.name, resume.fullName);
  const summary = pickText(resume.summary, resume.basics && resume.basics.summary);
  const work = normalizeWork(resume.work || resume.experience);
  const education = normalizeEducation(resume.education);
  const projects = normalizeProjects(resume.projects);
  const awards = normalizeAwards(resume.awards);
  const languages = normalizeLanguages(resume.languages);
  const skills = normalizeSkills(resume.skills);
  const dynamicSections = normalizeDynamicSections(resume);
  const hasDynamicContent = dynamicSections.some((section) => section.lines.length > 0);

  const hasContent =
    isNonEmptyText(name) ||
    isNonEmptyText(summary) ||
    work.length > 0 ||
    education.length > 0 ||
    projects.length > 0 ||
    awards.length > 0 ||
    languages.length > 0 ||
    skills.list.length > 0 ||
    skills.groups.length > 0 ||
    hasDynamicContent;

  if (!hasContent) {
    return { ok: false, message: 'resume must include at least one populated section.' };
  }

  return { ok: true };
}

function generateResumeHtml(resume) {
  const basics = resume.basics || resume.header || resume;
  const name = pickText(basics.name, basics.fullName, resume.name, resume.fullName) || 'Resume';
  const label = pickText(basics.label, basics.title, basics.headline, resume.title);
  const contact = buildContactLines(basics);

  const summary = pickText(resume.summary, resume.basics && resume.basics.summary);
  const work = normalizeWork(resume.work || resume.experience);
  const education = normalizeEducation(resume.education);
  const projects = normalizeProjects(resume.projects);
  const awards = normalizeAwards(resume.awards);
  const languages = normalizeLanguages(resume.languages);
  const skills = normalizeSkills(resume.skills);

  const dynamicSections = normalizeDynamicSections(resume);
  const hasDynamicSelection = dynamicSections.length > 0;
  const includeHeader = hasDynamicSelection
    ? dynamicSections.some((section) => section.kind === 'header')
    : true;

  const renderContactLine = (items) =>
    items
      .map((item) => `<span>${escapeHtml(item)}</span>`)
      .join('<span class="contact-sep">|</span>');

  const contactHtml =
    contact.primary.length || contact.secondary.length
      ? `<div class="contact">${
          contact.primary.length ? `<div class="contact-line">${renderContactLine(contact.primary)}</div>` : ''
        }${
          contact.secondary.length
            ? `<div class="contact-line">${renderContactLine(contact.secondary)}</div>`
            : ''
        }</div>`
      : '';

  const summaryHtml = renderParagraphs(summary);
  const workHtml = renderWorkContent(work);
  const projectsHtml = renderProjectContent(projects);
  const skillsHtml = renderSkillsContent(skills);
  const educationHtml = renderEducationContent(education);
  const awardsHtml = renderAwardContent(awards);
  const languagesHtml = renderLanguageContent(languages);

  const sections = [];

  if (hasDynamicSelection) {
    const renderedCanonicalKinds = new Set();

    dynamicSections.forEach((section) => {
      if (section.kind === 'header') return;
      if (section.kind !== 'custom' && renderedCanonicalKinds.has(section.kind)) return;

      let contentHtml = '';
      const linesHtml = renderLinesAsBlock(section.lines);
      const preferLines = section.renderMode === 'lines' && section.lines.length > 0;

      if (section.kind === 'summary') {
        contentHtml = preferLines
          ? linesHtml
          : section.lines.length
            ? linesHtml
            : summaryHtml;
      } else if (section.kind === 'work') {
        contentHtml = preferLines ? linesHtml : workHtml || linesHtml;
      } else if (section.kind === 'projects') {
        contentHtml = preferLines ? linesHtml : projectsHtml || linesHtml;
      } else if (section.kind === 'skills') {
        contentHtml = preferLines ? linesHtml : skillsHtml || linesHtml;
      } else if (section.kind === 'education') {
        contentHtml = preferLines ? linesHtml : educationHtml || linesHtml;
      } else if (section.kind === 'awards') {
        contentHtml = preferLines ? linesHtml : awardsHtml || linesHtml;
      } else if (section.kind === 'languages') {
        contentHtml = preferLines ? linesHtml : languagesHtml || linesHtml;
      } else {
        contentHtml = linesHtml;
      }

      if (!isNonEmptyText(contentHtml)) return;

      sections.push(renderCanonicalSection(section.kind, section.title || titleFromKind(section.kind), contentHtml));
      if (section.kind !== 'custom') renderedCanonicalKinds.add(section.kind);
    });
  } else {
    if (isNonEmptyText(summaryHtml)) {
      sections.push(renderCanonicalSection('summary', 'Summary', summaryHtml));
    }
    if (isNonEmptyText(workHtml)) {
      sections.push(renderCanonicalSection('work', 'Professional Experience', workHtml));
    }
    if (isNonEmptyText(projectsHtml)) {
      sections.push(renderCanonicalSection('projects', 'Projects', projectsHtml));
    }
    if (isNonEmptyText(skillsHtml)) {
      sections.push(renderCanonicalSection('skills', 'Skills', skillsHtml));
    }
    if (isNonEmptyText(educationHtml)) {
      sections.push(renderCanonicalSection('education', 'Education', educationHtml));
    }
    if (isNonEmptyText(awardsHtml)) {
      sections.push(renderCanonicalSection('awards', 'Achievements', awardsHtml));
    }
    if (isNonEmptyText(languagesHtml)) {
      sections.push(renderCanonicalSection('languages', 'Languages', languagesHtml));
    }
  }

  const sectionsHtml = sections.join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(name)} - Resume</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Times New Roman", Times, serif;
        color: #1f1f1f;
        font-size: 12px;
        line-height: 1.24;
      }
      .page {
        padding: 0;
      }
      .resume-header {
        text-align: center;
        margin-bottom: 10px;
      }
      .resume-name {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .resume-title {
        margin: 2px 0 0;
        font-size: 12px;
        font-style: italic;
      }
      .contact {
        margin-top: 2px;
      }
      .contact-line {
        font-size: 11px;
        line-height: 1.2;
      }
      .contact-sep {
        margin: 0 4px;
        color: #666666;
      }
      .section {
        margin-top: 9px;
      }
      .section:first-of-type {
        margin-top: 0;
      }
      .section h2 {
        margin: 0 0 5px;
        padding-bottom: 2px;
        border-bottom: 1px solid #8f8f8f;
        font-size: 11.5px;
        font-weight: 700;
        text-transform: uppercase;
        font-variant: small-caps;
        letter-spacing: 0.03em;
      }
      p {
        margin: 0 0 3px;
      }
      p:last-child {
        margin-bottom: 0;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .row-left {
        flex: 1;
        font-weight: 700;
      }
      .row-right {
        white-space: nowrap;
        font-size: 11px;
      }
      .sub-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-top: 1px;
        font-size: 11px;
        font-style: italic;
      }
      .sub-left {
        flex: 1;
      }
      .sub-right {
        white-space: nowrap;
      }
      .experience-item,
      .education-item {
        margin-bottom: 6px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .experience-item:last-child,
      .education-item:last-child {
        margin-bottom: 0;
      }
      .dash-list {
        margin: 2px 0 0;
        padding: 0;
        list-style: none;
      }
      .dash-list li {
        position: relative;
        margin: 1px 0;
        padding-left: 12px;
      }
      .dash-list li::before {
        content: "-";
        position: absolute;
        left: 0;
        color: #666666;
      }
      .skills-groups {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .skill-row {
        margin: 0;
      }
      .skill-label {
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="page">
      ${
        includeHeader
          ? `<header class="resume-header">
        <h1 class="resume-name">${escapeHtml(name)}</h1>
        ${label ? `<div class="resume-title">${escapeHtml(label)}</div>` : ''}
        ${contactHtml}
      </header>`
          : ''
      }

      ${sectionsHtml}
    </div>
  </body>
</html>`;
}

module.exports = {
  generateResumeHtml,
  validateResume,
};
