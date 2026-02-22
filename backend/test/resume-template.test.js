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

test('generateResumeHtml uses classic layout styling', () => {
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
  assert.equal(html.includes('font-family: "Times New Roman", Times, serif;'), true);
  assert.equal(html.includes('class="resume-header"'), true);
  assert.equal(html.includes('text-transform: uppercase;'), true);
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
