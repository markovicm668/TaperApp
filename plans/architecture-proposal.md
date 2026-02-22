# Minimal Incremental Resume Data Architecture

This document outlines the architectural plan for a robust, incremental resume data structure that supports parsing, versioning, and granular updates.

## 1. Core Data Structures

We will define a `ResumeDocument` that serves as the single source of truth. It wraps the standard JSON Resume structure with metadata and version control capabilities.

### 1.1 Resume Document

```typescript
// Core Resume Entity
interface ResumeDocument {
  id: string;
  userId: string;
  
  // The current, active state of the resume
  content: ResumeContent; 
  
  // Analysis & Metadata
  metadata: {
    originalFileName?: string;
    importedAt: string;
    lastAnalyzedAt?: string;
    atsScore?: number;
  };

  // Version History
  versions: ResumeVersion[];
}

// The actual resume data (Normalized JSON Resume standard)
interface ResumeContent {
  basics: ResumeBasics; // Name, email, etc.
  work: WorkExperience[];
  education: Education[];
  skills: SkillGroup[];
  projects: Project[];
  // ... other sections
}

interface WorkExperience {
  id: string; // Unique ID for tracking specific blocks across edits
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  highlights: BulletPoint[]; // Structured bullets
}

interface BulletPoint {
  id: string; // Critical for tracking specific bullet history
  text: string;
  locked: boolean; // If true, AI won't auto-suggest changes
}
```

### 1.2 Versioning & Diffing

To support "Undo/Redo" and "Compare Versions", we will store immutable snapshots or deltas.

```typescript
interface ResumeVersion {
  id: string;
  timestamp: string;
  reason: 'import' | 'manual_edit' | 'ai_suggestion_applied';
  
  // We can store a full snapshot for simplicity given resume size (<100KB)
  // Or a delta if storage optimization is needed later.
  snapshot: ResumeContent; 
}
```

## 2. Parsing & Ingestion Pipeline

The pipeline converts raw input (PDF/Text) into our structured `ResumeDocument`.

1.  **Extraction Layer**:
    *   Input: PDF / DOCX / Text
    *   Output: Raw Text
    *   *Tool*: `pdf-parse` (existing) or similar.

2.  **Structuring Layer (LLM)**:
    *   Input: Raw Text
    *   Prompt: "Extract structured JSON Resume from this text..."
    *   *Optimization*: Assign UUIDs to every generic block (Experience item, Education item) and every Bullet Point during extraction.
    *   Output: `ResumeContent` with IDs.

3.  **Validation Layer**:
    *   Zod or Joi schema validation to ensure structure integrity.
    *   Fallback: If validation fails, mark as "Draft/Raw" and ask user to fix critical fields.

## 3. Bullet Rewrite Tracking

We need to track how a specific bullet evolves.

*   **Stable IDs**: Every bullet gets a `nanoid` or `uuid`.
*   **Analysis**:
    *   When sending to LLM for analysis, we send: `[{ id: "b1", text: "Managed team..." }]`.
    *   LLM response references these IDs: `[{ id: "b1", improved: "Led a cross-functional team...", rationale: "..." }]`.
*   **Application**:
    *   When user accepts a suggestion for bullet `b1`, we update `ResumeDocument.content` where `bullet.id === "b1"`.
    *   We create a new `ResumeVersion`.

## 4. Integration Strategy

### Phase 1: Backend Data Modeling
*   Define `ResumeDocument` schema in `backend/models` (or `types` if just in-memory for now).
*   Update `geminiService.js` to return *structured* resume data with IDs, not just analysis text.

### Phase 2: Frontend State Management
*   Update `AnalysisResult` to include the full `ResumeDocument`.
*   Create a React Context or Store (Zustand/Redux) to hold the `ResumeDocument`.
*   Update UI to render from `ResumeDocument.content` instead of raw text.

### Phase 3: Incremental Updates
*   Implement `applySuggestion(suggestionId)`:
    1.  Find target bullet in `ResumeDocument`.
    2.  Create new Version.
    3.  Update text.
    4.  Recalculate Score (optimistic or async re-analysis).

## 5. Next Steps

1.  Create `backend/lib/types.ts` (or similar shared types) for the new structure.
2.  Update `geminiService.js` prompt to output the strict JSON Resume schema with IDs.
3.  Refactor frontend to use the new schema.
