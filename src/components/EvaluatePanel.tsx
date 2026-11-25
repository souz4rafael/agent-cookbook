import { useEffect, useId, useRef, useState } from 'react'
import {
  Add20Regular, CheckmarkCircle20Regular, ChevronDown16Regular, ChevronLeft20Regular,
  ChevronRight20Regular, DocumentCheckmark20Regular,
  DocumentText16Regular, Edit20Regular, Info20Regular, Play20Regular, Save20Regular,
} from '@fluentui/react-icons'
import type { CompiledRecipe, EvaluationRun, Session, TestResponse } from '../domain/types.ts'
import { getAvailableKnowledge, getConfigurationFingerprint, isToolAvailable } from '../domain/engine.ts'
import { getEvaluationRows } from '../domain/evaluation.ts'
import { estimateResponses } from '../domain/credits.ts'
import evaluationIllustration from '../assets/evaluation-illustration.png'
import { InfoPopover } from './InfoPopover.tsx'
import { CreditEstimate } from './CreditEstimate.tsx'
import { LabResultDetails, ReviewableDraft } from './InteractiveLab.tsx'
import { useReviewCue } from './reviewCue.ts'
import './EvaluatePanel.css'

interface EvaluatePanelProps {
  recipe: CompiledRecipe
  session: Session
  onSave: (name: string) => boolean
  onRun: (name: string) => boolean
  onDocument: (id: string) => void
}

interface EvaluationDraft { name: string; dataReady: boolean }
type EvaluationScreen = 'home' | 'setup' | 'results'

const responseLabels: Record<TestResponse['kind'], string> = {
  answer: 'Grounded answer',
  'missing-knowledge': 'Knowledge missing',
  'out-of-scope': 'Outside the recipe',
  'handoff-ready': 'Handoff ready',
  'handoff-blocked': 'Handoff blocked',
}
const runDateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'medium' })

function formatRunTime(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? runDateFormat.format(date) : 'Time unavailable'
}

function validName(value: string) {
  return value.trim().length > 0 && value.length <= 100
}

function ResultTable({ run, onDocument }: { run: EvaluationRun; onDocument: (id: string) => void }) {
  const expectedChecks = run.rows.some(row => row.assertions)
  return (
    <div className="eval-table-scroll" role="region" aria-label="Evaluation results table" tabIndex={0}>
      <table className={`eval-results-table${expectedChecks ? ' with-expectations' : ''}`}>
        <caption className="sr-only">Response types and sources for the recipe questions, in recipe order. Results are a snapshot of the last run.</caption>
        <thead><tr><th scope="col">Example / question</th>{expectedChecks && <th scope="col">Expected result</th>}<th scope="col">Response type</th><th scope="col">Sources</th></tr></thead>
        <tbody>{run.rows.map((row, index) => (
          <tr key={`${index}-${row.question}`}>
            <td>
              <span className="eval-result-question">{row.question}</span>
              <details className="eval-response-details">
                <summary>Inspect response <ChevronDown16Regular aria-hidden="true" /></summary>
                <p>{row.response.text}</p>
                {row.assertions && <ul className="evaluation-assertions">{row.assertions.map((assertion, assertionIndex) => <li key={`${assertion.label}-${assertionIndex}`} className={assertion.passed ? 'eval-check-pass' : 'eval-check-fail'}><strong>{assertion.passed ? 'Pass' : 'Fail'}: {assertion.label}</strong><div>Expected: {assertion.expected}</div><div>Actual: {assertion.actual}</div></li>)}</ul>}
                <LabResultDetails response={row.response} />
                <ReviewableDraft response={row.response} />
                <CreditEstimate estimate={estimateResponses([row.response])} scope="This evaluation response" />
                {row.response.citations.length > 0 && <div className="eval-citations">
                  {row.response.citations.map((citation, citationIndex) => (
                    <button className="citation" type="button" key={`${citation.documentId}-${citationIndex}`}
                      onClick={() => onDocument(citation.documentId)}>
                      <DocumentText16Regular aria-hidden="true" />{citation.title}
                    </button>
                  ))}
                </div>}
              </details>
            </td>
            {expectedChecks && <td className={row.assertions?.every(item => item.passed) ? 'eval-check-pass' : 'eval-check-fail'}>{row.assertions?.every(item => item.passed) ? 'Pass' : 'Fail'}</td>}
            <td><span className={`eval-response-kind${row.response.kind === 'answer' ? ' is-grounded' : ''}`}>{row.response.kind === 'answer' && row.response.lab && !row.response.citations.length ? 'Rule-based result' : responseLabels[row.response.kind]}</span></td>
            <td className="eval-source-count">{row.response.citations.length}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function EvaluationWorkspace({ recipe, session, onSave, onRun, onDocument }: EvaluatePanelProps) {
  const evaluation = session.evaluation
  const [screen, setScreen] = useState<EvaluationScreen>(() => evaluation?.lastRun ? 'results' : 'home')
  const [draft, setDraft] = useState<EvaluationDraft | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const heading = useRef<HTMLHeadingElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const dataHeading = useRef<HTMLHeadingElement>(null)
  const pendingFocus = useRef<'heading' | 'name' | 'data' | null>(null)
  const id = useId()
  const questions = recipe.lab?.cases.map(item => item.title) ?? recipe.test.suggestedQuestions
  const questionCount = questions.length
  const evaluationTarget = useReviewCue()?.type === 'evaluation-passed' && questionCount > 0
  const lastRun = evaluation?.lastRun
  const effectiveScreen = screen === 'results' && !lastRun ? 'home' : screen
  const stale = !!lastRun && lastRun.fingerprint !== getConfigurationFingerprint(session)
  const ready = !!draft?.dataReady && validName(draft.name) && questionCount > 0
  const creditEstimate = estimateResponses((effectiveScreen === 'results' && lastRun ? lastRun.rows : getEvaluationRows(recipe, session)).map(row => row.response))
  const creditScope = effectiveScreen === 'results' ? 'Last run responses' : 'One evaluation run with current settings'

  useEffect(() => {
    const target = pendingFocus.current === 'name' ? nameInput.current
      : pendingFocus.current === 'data' ? dataHeading.current
        : pendingFocus.current === 'heading' ? heading.current : null
    target?.focus()
    pendingFocus.current = null
  }, [effectiveScreen, draft?.dataReady, lastRun])

  function openSetup() {
    setDraft({ name: evaluation?.name ?? `${recipe.title} evaluation`.slice(0, 100), dataReady: !!evaluation })
    setAnnouncement('')
    pendingFocus.current = 'name'
    setScreen('setup')
  }

  function goHome() {
    setDraft(null)
    setAnnouncement('')
    pendingFocus.current = 'heading'
    setScreen('home')
  }

  function openResults() {
    setAnnouncement('')
    pendingFocus.current = 'heading'
    setScreen('results')
  }

  function save() {
    if (!draft || !ready) return
    setAnnouncement('')
    if (!onSave(draft.name.trim())) return
    setDraft(null)
    setAnnouncement('Evaluation configured.')
    pendingFocus.current = 'heading'
    setScreen('home')
  }

  function run(name: string) {
    if (!validName(name) || questionCount === 0) return
    setAnnouncement('')
    if (!onRun(name.trim())) return
    setDraft(null)
    pendingFocus.current = 'heading'
    setScreen('results')
  }

  if (effectiveScreen === 'home' && !evaluation) {
    return (
      <section className="eval-panel eval-empty-screen" aria-labelledby={`${id}-title`}>
        <div className="eval-welcome">
          <img className="eval-illustration" src={evaluationIllustration} width="180" height="180" alt="" />
          <h1 id={`${id}-title`} ref={heading} tabIndex={-1}>Evaluate your agent with confidence</h1>
          <p className="eval-welcome-description">Measure quality, catch issues early, and track improvements over time.</p>
          <div className="eval-welcome-note"><span>Preconfigured recipe checks compare results with expectations.</span>
            <InfoPopover title="Recipe evaluations"><p>This guided exercise uses {questionCount} declared {recipe.lab ? 'input cases with expected outcomes, tools and policy sources' : 'questions'}. It does not measure AI quality or use an AI judge.</p><p>You can configure one evaluation, inspect its results, and rerun it after changing your agent settings. Evaluations do not replace the required hands-on Preview cases.</p></InfoPopover>
          </div>
          <div className="eval-welcome-estimate"><CreditEstimate estimate={creditEstimate} scope={creditScope} /></div>
          <button className="button primary eval-create-button" type="button" onClick={openSetup} disabled={questionCount === 0} data-review-cue={evaluationTarget || undefined}>
            <Add20Regular aria-hidden="true" />Create your first evaluation
          </button>
          {questionCount === 0 && <p className="eval-empty-reason">This recipe does not contain evaluation questions.</p>}
        </div>
      </section>
    )
  }

  if (effectiveScreen === 'setup' && draft) {
    const sourceCount = getAvailableKnowledge(recipe, session).length
    const toolCount = recipe.tools.filter(tool => isToolAvailable(recipe, session, tool.id)).length
    return (
      <section className="eval-panel eval-setup" aria-labelledby={`${id}-title`}>
        <h1 className="sr-only" id={`${id}-title`}>Configure evaluation</h1>
        <div className="eval-editor-toolbar">
          <div className="eval-name-group">
            <button type="button" className="icon-button eval-back" aria-label="Back to evaluations; discard unsaved changes" onClick={goHome}><ChevronLeft20Regular aria-hidden="true" /></button>
            <label className="sr-only" htmlFor={`${id}-name`}>Evaluation name</label>
            <input id={`${id}-name`} ref={nameInput} className="eval-name-input" type="text" placeholder="Enter the evaluation name"
              data-review-cue={(evaluationTarget && draft.dataReady && !validName(draft.name)) || undefined}
              maxLength={100} value={draft.name} aria-invalid={!validName(draft.name)} aria-describedby={`${id}-name-help`}
              onChange={event => setDraft({ ...draft, name: event.target.value })} />
          </div>
          <div className="eval-editor-actions">
            <button type="button" className="button secondary" onClick={save} disabled={!ready}><Save20Regular aria-hidden="true" />Save</button>
            <button type="button" className="button primary" onClick={() => run(draft.name)} disabled={!ready} data-review-cue={(evaluationTarget && ready) || undefined}><Play20Regular aria-hidden="true" />Run</button>
            <CreditEstimate estimate={creditEstimate} scope={creditScope} />
          </div>
        </div>
        <p id={`${id}-name-help`} className={validName(draft.name) ? 'sr-only' : 'eval-name-error'}>
          {validName(draft.name) ? 'Up to 100 characters. Load the recipe data set to enable Save and Run.' : 'Enter an evaluation name to save or run these checks.'}
        </p>

        <section className={`eval-step${draft.dataReady ? ' eval-data-ready' : ''}`} aria-labelledby={`${id}-data-title`}>
          <div className="eval-step-heading">
            <span className="eval-step-number" aria-hidden="true">1</span>
            <h2 id={`${id}-data-title`} ref={dataHeading} tabIndex={-1}>{draft.dataReady ? 'Review data set' : 'Create or select a data set'}</h2>
            <InfoPopover title="Recipe data set">
              <p>Generate data set loads exactly the {questionCount} declared {recipe.lab ? 'cases with their input values and expected results' : 'questions'}, in their original order. No AI generates or changes them.</p>
              {recipe.lab && <p>Negative cases may explicitly remove named sources or tools in an isolated copy. They never alter your saved configuration.</p>}
              <p>Import, custom questions, conversations, and generation options are unavailable in this guided exercise.</p>
            </InfoPopover>
            {draft.dataReady && <button className="button quiet eval-add-question" type="button" disabled title="This recipe uses a fixed data set."><Add20Regular aria-hidden="true" />Add</button>}
          </div>
          {draft.dataReady ? <>
            <div className="eval-question-table-wrap">
              <table className="eval-question-table">
                <caption className="sr-only">{questionCount} read-only questions from {recipe.title}</caption>
                <thead><tr><th scope="col">Question</th></tr></thead>
                <tbody>{questions.map((question, index) => <tr key={`${index}-${question}`}><td>{question}{recipe.lab && <details className="eval-response-details"><summary>Inputs and expectations</summary><pre>{JSON.stringify(recipe.lab.cases[index].inputs, null, 2)}</pre><p>Expected: {recipe.lab.cases[index].expected.outcomeId} · {recipe.lab.cases[index].expected.kind} · tool: {recipe.lab.cases[index].expected.toolId ?? 'none'}</p><p>Sources: {recipe.lab.cases[index].expected.documentIds.join(', ') || 'none'}</p>{!!recipe.lab.cases[index].disabledKnowledge?.length && <p>Remove for this case only: {recipe.lab.cases[index].disabledKnowledge?.join(', ')}</p>}{!!recipe.lab.cases[index].disabledTools?.length && <p>Disable for this case only: {recipe.lab.cases[index].disabledTools?.join(', ')}</p>}</details>}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="eval-data-footer"><span role="status">{questionCount ? `1–${questionCount} of ${questionCount}` : '0 questions'}</span><div aria-label="Data set pagination">
              <button type="button" className="icon-button" disabled aria-label="Previous page"><ChevronLeft20Regular aria-hidden="true" /></button>
              <span aria-current="page">1</span>
              <button type="button" className="icon-button" disabled aria-label="Next page"><ChevronRight20Regular aria-hidden="true" /></button>
            </div></div>
          </> : <div className="eval-data-builder">
            <div className="eval-data-tabs">
              <div className="eval-source-tabs" role="tablist" aria-label="Data set source">
                <button type="button" role="tab" className="eval-data-tab" aria-selected="true" id={`${id}-generate-tab`} aria-controls={`${id}-generate-panel`}>Generate</button>
                <button type="button" role="tab" className="eval-data-tab" aria-selected="false" disabled title="Import is not available for this fixed recipe data set.">Import</button>
              </div>
              <button type="button" className="eval-write-questions" disabled title="Questions are defined by the recipe.">Or, write some questions yourself</button>
            </div>
            <div id={`${id}-generate-panel`} role="tabpanel" aria-labelledby={`${id}-generate-tab`}>
              <fieldset className="eval-data-types">
                <legend>Select data type</legend>
                <p>Check single messages your users might ask the agent, or conversations with several messages back and forth.</p>
                <label><input type="radio" name={`${id}-data-type`} value="single" checked readOnly /><span>Single responses</span></label>
                <label className="eval-disabled-choice"><input type="radio" name={`${id}-data-type`} value="conversation" checked={false} readOnly disabled /><span>Conversations</span></label>
              </fieldset>
              <div className="eval-generation-options"><label htmlFor={`${id}-options`}>Show all generation options</label><input id={`${id}-options`} className="eval-fixed-switch" type="checkbox" role="switch" checked={false} readOnly disabled /></div>
              <div className="eval-generate-row">
                <button className="button secondary" type="button" disabled={questionCount === 0} data-review-cue={evaluationTarget || undefined} onClick={() => {
                  pendingFocus.current = 'data'
                  setDraft({ ...draft, dataReady: true })
                }}>Generate data set</button>
                <span>{questionCount} preconfigured recipe {questionCount === 1 ? 'question' : 'questions'}</span>
              </div>
            </div>
          </div>}
        </section>

        <section className={`eval-step${draft.dataReady ? '' : ' is-unavailable'}`} aria-labelledby={`${id}-methods-title`} aria-disabled={!draft.dataReady}>
          <div className="eval-step-heading">
            <span className="eval-step-number" aria-hidden="true">2</span><h2 id={`${id}-methods-title`}>Select test methods</h2>
            {draft.dataReady && <InfoPopover title="Test methods"><p>Each case runs the same rules as Preview. Interactive recipes assert the expected outcome, response type, exact tool, sources and required explanation.</p><p>Blocked responses pass only when explicitly expected by a case. No AI judge is used.</p></InfoPopover>}
          </div>
          {draft.dataReady && <div className="eval-step-content">
            <p>Check how your current configuration responds to each recipe question.</p>
            <div className="eval-methods">
              <div className="eval-method-pill"><CheckmarkCircle20Regular aria-hidden="true" /><span>{recipe.lab ? 'Expected outcomes, tools and sources' : 'Response type and sources'}</span><span className="eval-fixed-label">Fixed</span></div>
              <button className="button quiet" type="button" disabled><Add20Regular aria-hidden="true" />Add test method</button>
            </div>
          </div>}
        </section>

        <section className={`eval-step${draft.dataReady ? '' : ' is-unavailable'}`} aria-labelledby={`${id}-config-title`} aria-disabled={!draft.dataReady}>
          <div className="eval-step-heading">
            <span className="eval-step-number" aria-hidden="true">3</span><h2 id={`${id}-config-title`}>Additional configuration</h2>
            {draft.dataReady && <InfoPopover title="Evaluation configuration"><p>Run uses your current profile, connections, selected knowledge, and enabled tools. Each declared case supplies isolated fictional inputs.</p><p>Passing all cases completes only an evaluation step. It never creates requests, opens citations or substitutes for the hands-on Preview steps.</p></InfoPopover>}
          </div>
          {draft.dataReady && <div className="eval-step-content">
            <p>Uses your current agent settings. No additional configuration is needed.</p>
            <dl className="eval-current-config">
              <div><dt>Knowledge</dt><dd>{sourceCount} active {sourceCount === 1 ? 'source' : 'sources'}</dd></div>
              <div><dt>Tools</dt><dd>{toolCount} enabled</dd></div>
              <div><dt>Tone</dt><dd>{session.profile.tone === 'formal' ? 'Formal' : 'Friendly'}</dd></div>
              <div><dt>Response detail</dt><dd>{session.profile.detail === 'detailed' ? 'Detailed' : 'Concise'}</dd></div>
            </dl>
          </div>}
        </section>
        <div className="eval-setup-footer"><button type="button" className="button secondary" onClick={goHome}>Cancel</button><span>Changes are applied only when you Save or Run.</span></div>
      </section>
    )
  }

  if (effectiveScreen === 'results' && evaluation && lastRun) {
    return (
      <section className="eval-panel eval-results" aria-labelledby={`${id}-title`}>
        <div className="eval-editor-toolbar">
          <div className="eval-results-title">
            <button type="button" className="icon-button eval-back" onClick={goHome} aria-label="Back to evaluations"><ChevronLeft20Regular aria-hidden="true" /></button>
            <div><h1 ref={heading} tabIndex={-1} id={`${id}-title`}>{evaluation.name}</h1><p>Evaluation results</p></div>
          </div>
          <div className="eval-editor-actions">
            <button type="button" className="button secondary" onClick={openSetup}><Edit20Regular aria-hidden="true" />Edit setup</button>
            <button type="button" className="button primary" onClick={() => run(evaluation.name)} disabled={questionCount === 0} data-review-cue={evaluationTarget || undefined}><Play20Regular aria-hidden="true" />Run again</button>
            <CreditEstimate estimate={creditEstimate} scope={creditScope} />
          </div>
        </div>
        {stale && <div className="eval-stale-notice" role="status"><Info20Regular aria-hidden="true" /><p>Your configuration has changed. These results are from the previous settings. Run again to refresh.</p></div>}
        <div className="eval-results-summary">
          <div><h2>{recipe.lab ? `${lastRun.rows.filter(row => row.assertions?.every(item => item.passed)).length} of ${lastRun.rows.length} checks passed` : `${lastRun.rows.length} local checks completed`}</h2>
            <InfoPopover title="Evaluation results"><p>These are the recorded responses from the last run, in recipe question order. Inspect a response to read its text and open its cited sources.</p><p>A blocked or unanswered question is not automatically a failed test. Response types are classifications, not quality scores.</p></InfoPopover>
          </div>
          <p role="status">Last run <time dateTime={lastRun.ranAt}>{formatRunTime(lastRun.ranAt)}</time></p>
        </div>
        <ResultTable run={lastRun} onDocument={onDocument} />
        <p className="eval-results-note">{recipe.lab ? 'Pass/fail compares deterministic behavior with the declared expectations, not AI quality. Configuration changes require a new run.' : 'Response types describe behavior, not quality scores.'} Times use your local time zone.</p>
      </section>
    )
  }

  return (
    <section className="eval-panel eval-list" aria-labelledby={`${id}-title`}>
      <div className="eval-list-heading"><div><h1 ref={heading} tabIndex={-1} id={`${id}-title`}>Evaluations</h1><p>Configure and rerun your recipe’s preconfigured checks.</p></div><CreditEstimate estimate={creditEstimate} scope={creditScope} /></div>
      {announcement && <p className="eval-status-message" role="status"><CheckmarkCircle20Regular aria-hidden="true" />{announcement}</p>}
      {evaluation && <article className="eval-saved-card">
        <div className="eval-saved-heading">
          <span className="eval-saved-icon"><DocumentCheckmark20Regular aria-hidden="true" /></span>
          <div><h2><button className="eval-name-link" type="button" onClick={lastRun ? openResults : openSetup}>{evaluation.name}</button></h2><span className="eval-ready-label">{lastRun ? stale ? 'Configuration changed' : 'Results available' : 'Ready to run'}</span></div>
          <div className="eval-saved-actions">
            <button className="button secondary" type="button" onClick={openSetup}><Edit20Regular aria-hidden="true" />Edit setup</button>
            <button className="button primary" type="button" onClick={() => run(evaluation.name)} disabled={questionCount === 0} data-review-cue={evaluationTarget || undefined}><Play20Regular aria-hidden="true" />{lastRun ? 'Run again' : 'Run'}</button>
          </div>
        </div>
        <dl className="eval-saved-details">
          <div><dt>Data set</dt><dd>{questionCount} recipe {questionCount === 1 ? 'question' : 'questions'}</dd></div>
          <div><dt>Test method</dt><dd>{recipe.lab ? 'Expected outcomes, tools and sources' : 'Response type and sources'}</dd></div>
          <div><dt>Last run</dt><dd>{lastRun ? <time dateTime={lastRun.ranAt}>{formatRunTime(lastRun.ranAt)}</time> : 'Not run yet'}</dd></div>
        </dl>
        {lastRun && <button className="eval-view-results" type="button" onClick={openResults}>View results<ChevronRight20Regular aria-hidden="true" /></button>}
      </article>}
      <p className="eval-list-note">One evaluation is available for this recipe. Edit its name or rerun the same questions as you adjust your agent.</p>
    </section>
  )
}

export function EvaluatePanel(props: EvaluatePanelProps) {
  return <EvaluationWorkspace key={`${props.recipe.id}:${props.recipe.revision}`} {...props} />
}
