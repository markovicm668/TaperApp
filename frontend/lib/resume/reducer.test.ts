import test from 'node:test';
import assert from 'node:assert/strict';
import { safeParseResumeWorkspace } from '@resume-scanner/resume-contract';
import type { AnalysisResult } from '../types.ts';
import { analysisResultToSnapshot } from './mappers.ts';
import { initialResumeStoreState, resumeReducer } from './reducer.ts';
import { selectEffectiveSectionViewModel } from './selectors.ts';

function sampleAnalysisResult(): AnalysisResult {
  return {
    id: 'analysis-1',
    createdAt: '2026-02-07T00:00:00.000Z',
    matchScore: 82,
    roleSeniority: 'mid',
    overallFit: 'good',
    targetRole: 'Frontend Engineer',
    company: 'Example Corp',
    status: 'completed',
    keywordGaps: [],
    bulletChanges: [
      {
        section: 'Experience',
        original: 'Built UI components',
        improved: 'Built reusable UI components for core workflows',
        type: 'modified',
      },
    ],
    rewriteSuggestions: [],
    atsChecks: [],
    riskFlags: [],
    recommendedEdits: [],
  };
}

function stateWithParsedWorkHighlight() {
  return resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Jane Doe\n\nExperience\n- Built UI components',
          importedAt: '2026-02-07T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-07T00:00:00.000Z',
        },
        resumeData: {
          work: [
            {
              company: 'Acme',
              position: 'Engineer',
              highlights: [
                {
                  text: 'Built UI components',
                  originalText: 'Built UI components',
                  source: 'user',
                },
              ],
            },
          ],
          education: [],
          projects: [],
          awards: [],
          skills: [],
          languages: [],
        },
        notes: [],
      },
    },
  });
}

test('setSourceInput stores source text and clears analysis by default', () => {
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());

  const withAnalysis = resumeReducer(initialResumeStoreState, {
    type: 'setAnalysisSnapshot',
    payload: { snapshot },
  });

  const next = resumeReducer(withAnalysis, {
    type: 'setSourceInput',
    payload: {
      inputType: 'text',
      rawText: 'Alice\n\nExperience\n- Improved API latency',
    },
  });

  assert.equal(next.workspace.source.rawText, 'Alice\n\nExperience\n- Improved API latency');
  assert.equal(next.workspace.analysis.resultId, null);
  assert.equal(next.workspace.analysis.lastAnalysisResult, null);
  assert.deepEqual(next.workspace.analysis.bulletChanges, []);
});

test('setAnalysisSnapshot stores resultId and bullet changes', () => {
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());
  const withParsed = stateWithParsedWorkHighlight();

  const next = resumeReducer(withParsed, {
    type: 'setAnalysisSnapshot',
    payload: { snapshot },
  });

  assert.equal(next.workspace.analysis.resultId, 'analysis-1');
  assert.equal(next.workspace.analysis.lastAnalysisResult?.targetRole, 'Frontend Engineer');
  assert.equal(next.workspace.analysis.bulletChanges.length, 1);
  assert.equal(
    next.workspace.resumeData.work[0]?.highlights?.[0]?.text,
    'Built reusable UI components for core workflows'
  );
  assert.equal(
    next.workspace.resumeData.work[0]?.highlights?.[0]?.originalText,
    'Built UI components'
  );
  assert.equal(next.workspace.resumeData.work[0]?.highlights?.[0]?.source, 'ai');
});

test('setBulletChanges updates editable list without mutating persisted analysis snapshot', () => {
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());
  const withParsed = stateWithParsedWorkHighlight();
  const withSnapshot = resumeReducer(withParsed, {
    type: 'setAnalysisSnapshot',
    payload: { snapshot },
  });

  const changed = resumeReducer(withSnapshot, {
    type: 'setBulletChanges',
    payload: {
      changes: [
        {
          section: 'Experience',
          original: 'Built UI components',
          improved: 'Led frontend platform modernization and component library rollout',
          type: 'modified',
        },
      ],
    },
  });

  assert.equal(changed.workspace.analysis.bulletChanges[0]?.improved.includes('modernization'), true);
  assert.equal(
    changed.workspace.analysis.lastAnalysisResult?.bulletChanges[0]?.improved.includes('modernization'),
    false
  );
  assert.equal(
    changed.workspace.resumeData.work[0]?.highlights?.[0]?.originalText,
    'Built UI components'
  );
  assert.equal(
    changed.workspace.resumeData.work[0]?.highlights?.[0]?.text,
    'Led frontend platform modernization and component library rollout'
  );
  assert.equal(changed.workspace.resumeData.work[0]?.highlights?.[0]?.source, 'user');
});

test('setSectionOrder updates persisted resume section order', () => {
  const next = resumeReducer(initialResumeStoreState, {
    type: 'setSectionOrder',
    payload: {
      sectionOrder: ['canonical-header', 'canonical-work', 'canonical-skills'],
    },
  });

  assert.deepEqual(next.workspace.resumeData.sectionOrder, [
    'canonical-header',
    'canonical-work',
    'canonical-skills',
  ]);
});

test('setParsedPayload stores parsed resume payload and updates workspace source + resumeData', () => {
  const next = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Jane Doe\n\nExperience\n- Built APIs',
          importedAt: '2026-02-07T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-07T00:00:00.000Z',
        },
        resumeData: {
          work: [{ company: 'Acme', position: 'Engineer', highlights: ['Built APIs'] }],
          education: [],
          projects: [],
          awards: [],
          skills: [],
          languages: [],
        },
        notes: ['parse-note'],
        sections: [
          {
            id: 'section-work',
            title: 'Experience',
            kind: 'work',
            canonicalTarget: 'work',
            lines: ['- Built APIs'],
          },
        ],
      },
    },
  });

  assert.equal(next.workspace.analysis.ai.parsed?.version, '2');
  assert.equal(next.workspace.analysis.ai.parsed?.parser, 'gemini-section-parser-v2');
  assert.equal(next.workspace.analysis.ai.parsed?.notes[0], 'parse-note');
  assert.equal('resumeData' in (next.workspace.analysis.ai.parsed || {}), false);
  assert.equal('source' in (next.workspace.analysis.ai.parsed || {}), false);
  assert.equal(next.workspace.source.rawText, 'Jane Doe\n\nExperience\n- Built APIs');
  assert.equal(next.workspace.resumeData.work[0]?.company, 'Acme');
});

test('setParsedPayload preserves existing user section order when local order is already set', () => {
  const withCustomOrder = resumeReducer(initialResumeStoreState, {
    type: 'setSectionOrder',
    payload: {
      sectionOrder: ['canonical-header', 'canonical-skills', 'canonical-work'],
    },
  });

  const next = resumeReducer(withCustomOrder, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Jane Doe\n\nExperience\n- Built APIs',
          importedAt: '2026-02-12T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-12T00:00:00.000Z',
        },
        resumeData: {
          work: [{ company: 'Acme', position: 'Engineer', highlights: ['Built APIs'] }],
          education: [],
          projects: [],
          awards: [],
          skills: [{ name: 'TypeScript', category: 'Technical' }],
          languages: [],
          customSections: [],
          sectionOrder: [],
          versions: [],
        },
        notes: [],
      },
    },
  });

  assert.deepEqual(next.workspace.resumeData.sectionOrder, [
    'canonical-header',
    'canonical-skills',
    'canonical-work',
  ]);
});

test('setParsedPayload maps parse response into a schema-valid workspace update', () => {
  const next = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Jane Doe\n\nSkills\nJavaScript',
          importedAt: '2026-02-09T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-09T00:00:00.000Z',
        },
        resumeData: {
          education: [],
          work: [],
          projects: [],
          awards: [],
          skills: [{ name: 'JavaScript', category: 'Technical' }],
          languages: [],
          customSections: [],
          sectionOrder: [],
          versions: [],
        },
        notes: [],
      },
    },
  });

  const validated = safeParseResumeWorkspace(next.workspace);
  assert.equal(validated.success, true);
});

test('setSourceInput clears parsed payload when analysis is reset', () => {
  const withParsed = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Jane Doe\n\nExperience\n- Built APIs',
          importedAt: '2026-02-07T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-07T00:00:00.000Z',
        },
        resumeData: {
          work: [{ company: 'Acme', position: 'Engineer', highlights: ['Built APIs'] }],
          education: [],
          projects: [],
          awards: [],
          skills: [],
          languages: [],
        },
        notes: [],
      },
    },
  });

  const next = resumeReducer(withParsed, {
    type: 'setSourceInput',
    payload: {
      inputType: 'text',
      rawText: 'New resume text',
    },
  });

  assert.equal(next.workspace.analysis.ai.parsed, null);
});

test('setSourceInput clears stale parse source metadata and fileName', () => {
  const withParsed = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'file',
          rawText: 'Legacy text',
          fileName: 'resume.pdf',
          importedAt: '2026-02-07T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-07T00:00:00.000Z',
        },
        resumeData: {
          work: [{ company: 'Acme', position: 'Engineer', highlights: ['Built APIs'] }],
          education: [],
          projects: [],
          awards: [],
          skills: [],
          languages: [],
        },
        notes: [],
      },
    },
  });

  const next = resumeReducer(withParsed, {
    type: 'setSourceInput',
    payload: {
      inputType: 'text',
      rawText: 'Fresh text input',
    },
  });

  assert.equal(next.workspace.source.fileName, undefined);
  assert.equal(next.workspace.source.parser, undefined);
  assert.equal(next.workspace.source.parsedAt, undefined);
});

test('setAnalysisSnapshot does not overwrite canonical parse source raw text', () => {
  const withParsed = stateWithParsedWorkHighlight();
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());

  const next = resumeReducer(withParsed, {
    type: 'setAnalysisSnapshot',
    payload: { snapshot },
  });

  assert.equal(next.workspace.source.rawText, 'Jane Doe\n\nExperience\n- Built UI components');
});

test('resetWorkspace clears resume and analysis state', () => {
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());
  const withSnapshot = resumeReducer(initialResumeStoreState, {
    type: 'setAnalysisSnapshot',
    payload: { snapshot },
  });

  const reset = resumeReducer(withSnapshot, { type: 'resetWorkspace' });

  assert.equal(reset.workspace.analysis.resultId, null);
  assert.equal(reset.workspace.analysis.lastAnalysisResult, null);
  assert.equal(reset.workspace.analysis.bulletChanges.length, 0);
  assert.equal(reset.workspace.source.rawText, '');
});

test('selectEffectiveSectionViewModel includes canonical header fallback when parsed header is missing', () => {
  const state = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Experience\n- Built APIs',
          importedAt: '2026-02-11T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-11T00:00:00.000Z',
        },
        resumeData: {
          basics: {
            name: 'Luka Petrovic',
            title: 'Junior Business Analyst',
            email: 'luka@example.com',
            location: {
              city: 'Belgrade',
              country: 'Serbia',
            },
          },
          summary: 'Business analyst summary',
          work: [{ company: 'Acme', position: 'Intern', highlights: ['Built APIs'] }],
          education: [],
          projects: [],
          awards: [],
          skills: [],
          languages: [],
          customSections: [],
          sectionOrder: [],
          versions: [],
        },
        notes: [],
        sections: [
          {
            id: 'section-work',
            title: 'Professional Experience',
            kind: 'work',
            canonicalTarget: 'work',
            lines: ['- Built APIs'],
          },
        ],
      },
    },
  });

  const rows = selectEffectiveSectionViewModel(state);
  const header = rows.find(row => row.key === 'canonical-header');
  assert.ok(header);
  assert.equal(header?.originalValue.includes('Luka Petrovic'), true);
  assert.equal(header?.originalValue.includes('Junior Business Analyst'), true);
  assert.equal(header?.originalValue.includes('Belgrade, Serbia'), true);
});

test('applyInlineEdit updates work heading/date/location and preserves analysis snapshot', () => {
  const snapshot = analysisResultToSnapshot(sampleAnalysisResult());
  const withSnapshot = resumeReducer(
    resumeReducer(initialResumeStoreState, {
      type: 'setParsedPayload',
      payload: {
        parsed: {
          version: '2',
          source: {
            inputType: 'text',
            rawText: 'Experience',
            importedAt: '2026-02-20T00:00:00.000Z',
            parser: 'gemini-section-parser-v2',
            parsedAt: '2026-02-20T00:00:00.000Z',
          },
          resumeData: {
            basics: { name: 'Jane Doe' },
            summary: 'Summary',
            work: [
              {
                id: 'work-1',
                company: 'Acme',
                position: 'Engineer',
                startDate: '2022',
                endDate: '2024',
                location: { city: 'Belgrade', country: 'Serbia' },
                highlights: [{ id: 'wh-1', text: 'Built APIs', originalText: 'Built APIs' }],
              },
            ],
            projects: [],
            education: [],
            awards: [],
            skills: [],
            languages: [],
            customSections: [],
            sectionOrder: [],
            versions: [],
          },
          notes: [],
        },
      },
    }),
    {
      type: 'setAnalysisSnapshot',
      payload: { snapshot },
    }
  );

  const afterHeading = resumeReducer(withSnapshot, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'entry-slot',
        section: 'work',
        entryItemKey: 'item:work:entry:work-1',
        slot: 'heading',
      },
      text: 'Senior Engineer - Nova',
    },
  });

  const afterDate = resumeReducer(afterHeading, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'entry-slot',
        section: 'work',
        entryItemKey: 'item:work:entry:work-1',
        slot: 'date',
      },
      text: '2023 - Present',
    },
  });

  const afterLocation = resumeReducer(afterDate, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'entry-slot',
        section: 'work',
        entryItemKey: 'item:work:entry:work-1',
        slot: 'location',
      },
      text: 'Novi Sad, Serbia',
    },
  });

  const work = afterLocation.workspace.resumeData.work[0];
  assert.equal(work?.position, 'Senior Engineer');
  assert.equal(work?.company, 'Nova');
  assert.equal(work?.startDate, '2023');
  assert.equal(work?.endDate, undefined);
  assert.equal(work?.isCurrent, true);
  assert.equal(work?.location?.city, 'Novi Sad');
  assert.equal(work?.location?.country, 'Serbia');
  assert.equal(
    afterLocation.workspace.analysis.lastAnalysisResult?.bulletChanges[0]?.improved.includes('modernization'),
    false
  );
});

test('applyInlineEdit updates project technologies, education honors, and custom parsed lines', () => {
  const state = resumeReducer(initialResumeStoreState, {
    type: 'setParsedPayload',
    payload: {
      parsed: {
        version: '2',
        source: {
          inputType: 'text',
          rawText: 'Projects',
          importedAt: '2026-02-20T00:00:00.000Z',
          parser: 'gemini-section-parser-v2',
          parsedAt: '2026-02-20T00:00:00.000Z',
        },
        resumeData: {
          basics: { name: 'Jane Doe' },
          summary: 'Summary',
          work: [],
          projects: [
            {
              id: 'proj-1',
              name: 'Project One',
              role: 'Owner',
              description: 'Desc',
              technologies: [
                { skillRefId: 's1', name: 'React' },
                { skillRefId: 's2', name: 'Node.js' },
              ],
              highlights: [],
            },
          ],
          education: [
            {
              id: 'edu-1',
              institution: 'University',
              honors: ['Dean list', 'Scholarship'],
            },
          ],
          awards: [],
          skills: [{ id: 'skill-1', name: 'TypeScript', category: 'Technical' }],
          languages: [],
          customSections: [
            {
              id: 'custom-publications',
              title: 'Publications',
              items: [{ id: 'pub-1', text: 'Paper A' }],
            },
          ],
          sectionOrder: [],
          versions: [],
        },
        notes: [],
        customSections: [
          {
            id: 'custom-publications',
            title: 'Publications',
            kind: 'custom',
            canonicalTarget: 'none',
            lines: ['Paper A'],
          },
        ],
      },
    },
  });

  const afterTech = resumeReducer(state, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'entry-slot',
        section: 'projects',
        entryItemKey: 'item:projects:entry:proj-1',
        slot: 'technologies',
      },
      text: 'Technologies: TypeScript, Next.js',
    },
  });

  const afterHonor = resumeReducer(afterTech, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'entry-slot',
        section: 'education',
        entryItemKey: 'item:education:entry:edu-1',
        slot: 'honor',
        index: 1,
      },
      text: 'Merit Scholarship',
    },
  });

  const afterCustom = resumeReducer(afterHonor, {
    type: 'applyInlineEdit',
    payload: {
      target: {
        kind: 'item',
        itemKey: 'item:custom:custom-publications:line:0',
      },
      text: 'Paper B',
    },
  });

  assert.deepEqual(
    afterCustom.workspace.resumeData.projects[0]?.technologies.map(tech => tech.name),
    ['TypeScript', 'Next.js']
  );
  assert.equal(afterCustom.workspace.resumeData.projects[0]?.technologies[0]?.skillRefId, 's1');
  assert.equal(afterCustom.workspace.resumeData.education[0]?.honors?.[1], 'Merit Scholarship');
  assert.equal(afterCustom.workspace.resumeData.customSections[0]?.items?.[0]?.text, 'Paper B');
  assert.equal(afterCustom.workspace.analysis.ai.parsed?.customSections?.[0]?.lines?.[0], 'Paper B');
});
