const test = require('node:test');
const assert = require('node:assert/strict');

const { generateResumeHtml, validateResume } = require('../services/resumeTemplate');

test('generateResumeHtml omits empty summary section', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    summary: '',
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    skills: {
      technical: ['JavaScript', 'TypeScript'],
    },
    education: [],
    projects: [],
    awards: [],
    languages: [],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h2>Summary</h2>'), false);
  assert.equal(html.includes('<h2>Professional Experience</h2>'), true);
  assert.equal(html.includes('section-work'), true);
});

test('generateResumeHtml uses modern layout styling with embedded fonts', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    summary: 'Product-minded engineer.',
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('font-family: "DM Sans", "Helvetica Neue", Arial, sans-serif;'), true);
  assert.equal(html.includes("font-family: 'Space Grotesk';"), true);
  assert.equal(html.includes('data:font/woff2;base64,'), true);
  assert.equal(html.includes('class="resume-header"'), true);
  assert.equal(html.includes('class="header-gradient"'), true);
  assert.equal(html.includes('text-transform: uppercase;'), true);
});

test('generateResumeHtml renders the classic template when requested', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    summary: 'Product-minded engineer.',
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
  };

  const html = generateResumeHtml(resume, { template: 'classic' });
  assert.equal(html.includes('font-family: "Times New Roman", Times, serif;'), true);
  assert.equal(html.includes('class="header-gradient"'), false);
  assert.equal(html.includes('data:font/woff2;base64,'), false);
  assert.equal(html.includes('class="resume-header"'), true);

  // Unknown template ids fall back to modern.
  const fallbackHtml = generateResumeHtml(resume, { template: 'bogus' });
  assert.equal(fallbackHtml.includes('font-family: "DM Sans", "Helvetica Neue", Arial, sans-serif;'), true);
});

test('generateResumeHtml renders projects/awards/languages from canonical data', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
    },
    summary: 'Summary text',
    work: [],
    education: [],
    projects: [
      {
        name: 'Portfolio Tracker',
        technologies: ['React', 'Node.js'],
        highlights: ['Built dashboard'],
      },
    ],
    awards: [{ title: '1st place', summary: 'Hackathon' }],
    skills: {},
    languages: [{ language: 'English', fluency: 'Fluent' }],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h2>Projects</h2>'), true);
  assert.equal(html.includes('<h2>Achievements</h2>'), true);
  assert.equal(html.includes('<h2>Languages</h2>'), true);
});

test('generateResumeHtml respects selected dynamic sections and renders custom/projects blocks', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    projects: [
      {
        name: 'Portfolio Tracker',
        technologies: ['React'],
        highlights: ['Built a portfolio app'],
      },
    ],
    education: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'canonical-projects',
        title: 'Personal Projects',
        kind: 'projects',
        lines: ['- Built a portfolio app'],
      },
    ],
    sectionOrder: ['canonical-header', 'canonical-projects'],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h2>Personal Projects</h2>'), true);
  assert.equal(html.includes('Built a portfolio app'), true);
  assert.equal(html.includes('<h2>Professional Experience</h2>'), false);
});

test('generateResumeHtml de-duplicates duplicate canonical project sections', () => {
  const resume = {
    basics: {
      name: 'Luka Petrovic',
      email: 'luka.petrovic.ba@gmail.com',
    },
    work: [],
    education: [],
    awards: [],
    skills: {},
    languages: [],
    projects: [
      {
        name: 'FinTech LAB Student project (Process Analysis Project)',
        technologies: [],
        highlights: ['Process modelling using BPMN diagrams'],
      },
      {
        name: 'Portfolio reporting dashboard',
        technologies: ['Excel'],
        highlights: ['Automated trade reconciliation checks'],
      },
    ],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Luka Petrovic'] },
      {
        id: 'sec_uni_projects',
        title: 'UNIVERSITY PROJECT EXPERIENCE',
        kind: 'projects',
        lines: ['FinTech LAB Student project (Process Analysis Project)'],
      },
      {
        id: 'sec_add_projects',
        title: 'ADDITIONAL PROJECT',
        kind: 'projects',
        lines: ['Portfolio reporting dashboard (Excel based)'],
      },
    ],
    sectionOrder: ['canonical-header', 'sec_uni_projects', 'sec_add_projects'],
  };

  const html = generateResumeHtml(resume);
  const projectsSectionCount = (html.match(/class="section section-projects"/g) || []).length;

  assert.equal(projectsSectionCount, 1);
  assert.equal(html.includes('<h2>UNIVERSITY PROJECT EXPERIENCE</h2>'), true);
  assert.equal(html.includes('<h2>ADDITIONAL PROJECT</h2>'), false);
  assert.equal(
    (html.match(/FinTech LAB Student project \(Process Analysis Project\)/g) || []).length,
    1
  );
  assert.equal((html.match(/Portfolio reporting dashboard/g) || []).length, 1);
});

test('generateResumeHtml preserves selected dynamic section order', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
    },
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      {
        id: 'custom-publications',
        title: 'Publications',
        kind: 'custom',
        lines: ['- Published design systems article'],
      },
      {
        id: 'custom-awards',
        title: 'Awards',
        kind: 'custom',
        lines: ['- Employee of the Year'],
      },
    ],
    sectionOrder: ['custom-awards', 'custom-publications'],
  };

  const html = generateResumeHtml(resume);
  const awardsIndex = html.indexOf('<h2>Awards</h2>');
  const publicationsIndex = html.indexOf('<h2>Publications</h2>');

  assert.equal(awardsIndex >= 0, true);
  assert.equal(publicationsIndex >= 0, true);
  assert.equal(awardsIndex < publicationsIndex, true);
});

test('validateResume accepts payloads with dynamic section content', () => {
  const resume = {
    sections: [
      {
        id: 'custom-1',
        title: 'Publications',
        kind: 'custom',
        lines: ['Published research on resume optimization'],
      },
    ],
    sectionOrder: ['custom-1'],
  };

  const validation = validateResume(resume);
  assert.equal(validation.ok, true);
});

test('generateResumeHtml uses section lines when renderMode is lines', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'canonical-work',
        title: 'Experience',
        kind: 'work',
        renderMode: 'lines',
        lines: ['Built backend APIs serving 1M+ monthly requests'],
      },
    ],
    sectionOrder: ['canonical-header', 'canonical-work'],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('Built backend APIs serving 1M+ monthly requests'), true);
  assert.equal(html.includes('Built backend APIs</li>'), false);
});

test('generateResumeHtml keeps canonical-first rendering when renderMode is omitted', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'canonical-work',
        title: 'Experience',
        kind: 'work',
        lines: ['Built backend APIs serving 1M+ monthly requests'],
      },
    ],
    sectionOrder: ['canonical-header', 'canonical-work'],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('Built backend APIs</li>'), true);
});

test('generateResumeHtml renders summary from canonical data when renderMode is omitted', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    summary: 'Clean canonical summary',
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'sec-about',
        title: 'ABOUT ME',
        kind: 'summary',
        lines: ['ABOUT ME Raw parser line'],
      },
    ],
    sectionOrder: ['canonical-header', 'sec-about'],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('<h2>ABOUT ME</h2>'), true);
  assert.equal(html.includes('Clean canonical summary'), true);
  assert.equal(html.includes('ABOUT ME Raw parser line'), false);
});

test('generateResumeHtml renders summary from section lines when renderMode is lines', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    summary: 'Clean canonical summary',
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'sec-about',
        title: 'ABOUT ME',
        kind: 'summary',
        renderMode: 'lines',
        lines: ['ABOUT ME Raw parser line'],
      },
    ],
    sectionOrder: ['canonical-header', 'sec-about'],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('<h2>ABOUT ME</h2>'), true);
  assert.equal(html.includes('ABOUT ME Raw parser line'), true);
  assert.equal(html.includes('Clean canonical summary'), false);
});

test('generateResumeHtml avoids duplicated ABOUT ME label in canonical summary mode', () => {
  const resume = {
    basics: { name: 'Aleksandar Stojanovic' },
    summary:
      'Digital Account Manager seeking to continue learning and growing through a dynamic work environment.',
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Aleksandar Stojanovic'] },
      {
        id: 'sec-about',
        title: 'ABOUT ME',
        kind: 'summary',
        lines: [
          'ABOUT ME Digital Account Manager seeking to continue learning and growing through a dynamic work environment.',
        ],
      },
    ],
    sectionOrder: ['canonical-header', 'sec-about'],
  };

  const html = generateResumeHtml(resume);
  assert.equal(html.includes('<h2>ABOUT ME</h2>'), true);
  assert.equal(
    html.includes(
      '<p>ABOUT ME Digital Account Manager seeking to continue learning and growing through a dynamic work environment.</p>'
    ),
    false
  );
  assert.equal(
    html.includes(
      '<p>Digital Account Manager seeking to continue learning and growing through a dynamic work environment.</p>'
    ),
    true
  );
});

test('generateResumeHtml renders skills added to resumeData when not in parsed sections', () => {
  const resume = {
    basics: { name: 'James Whitfield', email: 'james.whitfield@gmail.com' },
    summary: 'Retail summary',
    work: [
      {
        position: 'Retail Assistant',
        company: 'B&Q',
        highlights: ['Assisted customers'],
      },
    ],
    education: [
      {
        institution: 'University of Manchester',
        degree: 'MEng Electrical and Electronic Engineering',
      },
    ],
    skills: [
      { name: 'MS Office Proficiency', category: 'Tools' },
      { name: 'POS Systems', category: 'Tools' },
      { name: 'Visual Merchandising', category: 'Operations' },
    ],
    projects: [],
    awards: [],
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['James Whitfield'] },
      { id: 'canonical-summary', title: 'Personal Summary', kind: 'summary', lines: ['Retail summary'] },
      {
        id: 'canonical-work',
        title: 'Work Experience',
        kind: 'work',
        lines: ['Retail Assistant — B&Q'],
      },
      {
        id: 'canonical-education',
        title: 'Education',
        kind: 'education',
        lines: ['University of Manchester'],
      },
    ],
    sectionOrder: [
      'canonical-header',
      'canonical-summary',
      'canonical-work',
      'canonical-education',
    ],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h2>Skills</h2>'), true);
  assert.equal(html.includes('MS Office Proficiency'), true);
  assert.equal(html.includes('POS Systems'), true);
  assert.equal(html.includes('Visual Merchandising'), true);
});

test('generateResumeHtml does not duplicate skills when parsed skills section exists', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    work: [],
    education: [],
    projects: [],
    awards: [],
    languages: [],
    skills: [{ name: 'Python', category: 'Languages' }],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'canonical-skills',
        title: 'Skills',
        kind: 'skills',
        lines: [],
      },
    ],
    sectionOrder: ['canonical-header', 'canonical-skills'],
  };

  const html = generateResumeHtml(resume);
  const skillsSectionCount = (html.match(/class="section section-skills"/g) || []).length;
  assert.equal(skillsSectionCount, 1);
  assert.equal((html.match(/Python/g) || []).length, 1);
});

test('generateResumeHtml renders header from basics when sections exist but contain no header entry', () => {
  const resume = {
    basics: {
      name: 'Jane Doe',
      email: 'jane@example.com',
    },
    work: [
      {
        position: 'Engineer',
        company: 'Example Corp',
        highlights: ['Built backend APIs'],
      },
    ],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    // sections array exists but does NOT include a kind:'header' entry
    sections: [
      {
        id: 'canonical-work',
        title: 'Professional Experience',
        kind: 'work',
        lines: ['Built backend APIs'],
        renderMode: 'canonical',
      },
    ],
    sectionOrder: ['canonical-work'],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h1 class="resume-name">Jane Doe</h1>'), true);
  assert.equal(html.includes('jane@example.com'), true);
});

test('generateResumeHtml renders a date-bearing custom section as structured entries', () => {
  const resume = {
    basics: { name: 'Fatma Ahmed Hassan' },
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Fatma Ahmed Hassan'] },
      {
        id: 'sec-training',
        title: 'Training',
        kind: 'custom',
        // Raw PDF-extraction order: each entry's date is stranded on its own
        // line after that entry's bullets.
        lines: [
          'Route Academy',
          '9-month Diploma in Full Stack Web Development.',
          '• Acquired expertise in frontend development using JavaScript.',
          '07/2021 – 03/2022',
          '• Acquired expertise in Backend development using PHP.',
          'Resala Organization',
          'Web Design Training.',
          '•HTML, HTML 5, CSS, CSS3, Bootstrap 5 .',
          '10/2020 – 03/2021',
        ],
      },
    ],
    sectionOrder: ['canonical-header', 'sec-training'],
  };

  const html = generateResumeHtml(resume);

  // Section renders structurally (education-style entry markup), not flat lines.
  assert.equal(html.includes('<h2>Training</h2>'), true);
  assert.equal((html.match(/class="education-item"/g) || []).length >= 2, true);
  // Each entry's date is re-associated to its heading and right-aligned.
  assert.equal(html.includes('<div class="row-right">07/2021 – 03/2022</div>'), true);
  assert.equal(html.includes('<div class="row-right">10/2020 – 03/2021</div>'), true);
  assert.equal(html.includes('>Route Academy</div>'), true);
  assert.equal(html.includes('>Resala Organization</div>'), true);
  // Bullets (including the no-space "•HTML" marker) render as list items.
  assert.equal(html.includes('<ul class="dash-list">'), true);
  assert.equal(html.includes('HTML, HTML 5, CSS, CSS3, Bootstrap 5 .</li>'), true);
  // The stranded date lines must not leak as their own paragraphs.
  assert.equal(html.includes('<p>07/2021 – 03/2022</p>'), false);
});

test('generateResumeHtml keeps a dateless custom section as flat lines', () => {
  const resume = {
    basics: { name: 'Jane Doe' },
    work: [],
    education: [],
    projects: [],
    awards: [],
    skills: {},
    languages: [],
    sections: [
      { id: 'canonical-header', title: 'Header', kind: 'header', lines: ['Jane Doe'] },
      {
        id: 'sec-interests',
        title: 'Interests',
        kind: 'custom',
        lines: ['Photography', 'Open-source contribution', 'Trail running'],
      },
    ],
    sectionOrder: ['canonical-header', 'sec-interests'],
  };

  const html = generateResumeHtml(resume);

  assert.equal(html.includes('<h2>Interests</h2>'), true);
  // No dates -> stays on the flat renderer, no structured entry markup.
  assert.equal(html.includes('class="education-item"'), false);
  assert.equal(html.includes('<p>Photography</p>'), true);
});
