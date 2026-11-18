import { useId, useState } from 'react'
import { CoinStack16Regular, Info16Regular } from '@fluentui/react-icons'
import {
  creditModel, creditProfiles, formatCreditRange, projectCredits,
} from '../domain/credits.ts'
import type { CreditEstimate as Estimate } from '../domain/credits.ts'
import { Modal } from './Modal.tsx'
import './CreditEstimate.css'

export function CreditEstimateInfo({ estimate, scope, monthlyResponses, basisNote }: {
  estimate: Estimate
  scope: string
  monthlyResponses?: number
  basisNote?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const projected = monthlyResponses === undefined || !estimate.count ? undefined : projectCredits(estimate, monthlyResponses)
  const range = projected ?? estimate.range
  return <>
    <button className="icon-button info-button" type="button" aria-label={`How estimated credits consumption is calculated: ${scope}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(true)}>
      <Info16Regular aria-hidden="true" />
    </button>
    {open && <Modal title="Estimated credits consumption" eyebrow={scope} onClose={() => setOpen(false)} wide className="credit-estimate-dialog">
      <div className="modal-body" id={id}>
        <div className="credit-estimate-total"><span>{monthlyResponses === undefined ? scope : `${monthlyResponses.toLocaleString('en-US')} responses per month`}</span><strong>{estimate.count ? `${formatCreditRange(range)} credits` : 'Not estimated yet'}</strong></div>
        <p>A planning range for the <strong>Microsoft Copilot harness</strong>. The credit bands come from Microsoft's estimator; assigning a response to a band is a Cookbook teaching assumption, not an official per-response tariff or measured token usage.</p>
        {basisNote && <p>{basisNote}</p>}
        {estimate.reason && <p><strong>This response:</strong> {estimate.reason}</p>}
        {estimate.count > 0 ? <>
          <div className="credit-estimate-table-scroll" role="region" aria-label="Credit calculation" tabIndex={0}>
            <table className="credit-estimate-table">
              <caption className="sr-only">Range calculation for the {estimate.count} baseline responses</caption>
              <thead><tr><th scope="col">Response profile</th><th scope="col">Count</th><th scope="col">Credits / response</th><th scope="col">Subtotal</th></tr></thead>
              <tbody>{estimate.groups.filter(group => group.count > 0).map(group => <tr key={group.profile}>
                <th scope="row">{creditProfiles[group.profile].label}</th><td>{group.count}</td>
                <td>{formatCreditRange(creditProfiles[group.profile].range)}</td><td>{formatCreditRange(group.range)}</td>
              </tr>)}</tbody>
              <tfoot><tr><th scope="row">Baseline total</th><td>{estimate.count}</td><td></td><td>{formatCreditRange(estimate.range)}</td></tr></tfoot>
            </table>
          </div>
          <div className="credit-estimate-formula">
            Lower estimate = sum of (response count x lower range).<br />
            Upper estimate = sum of (response count x upper range). If any response is Heavy, no finite upper estimate is available; the total is shown as a minimum with a + sign.
            {monthlyResponses !== undefined && <p>Monthly projection = ({formatCreditRange(estimate.range)} / {estimate.count}) x {monthlyResponses.toLocaleString('en-US')} = <strong>{formatCreditRange(range)} credits</strong>.</p>}
          </div>
        </> : <p>Run a recipe example or send a question to obtain a response-based estimate. No work has been counted in this view yet.</p>}
        <h3>How a response gets its range</h3>
        <ul className="credit-estimate-assumptions">{Object.values(creditProfiles).map(profile => <li key={profile.label}>
          <strong>{profile.label}: {formatCreditRange(profile.range)} credits.</strong> {profile.description}
        </li>)}</ul>
        <h3>What this estimate covers</h3>
        <p>{creditModel.basis}</p>
        <p>One completed user request and its recorded agent response are treated as one interaction. Greetings, status messages, confirmation receipts and internal tool steps are not extra interactions. A conversation adds its retained responses; an evaluation adds its case responses. A proposed tool or reviewable draft is not an executed action.</p>
        <p>External tool execution after confirmation, agent authoring, data-set generation, AI judging, retries and long-running autonomous work are not included. They may consume additional credits. Missing knowledge or a blocked request can still require a model response.</p>
        <p>Actual consumption depends on the model, tokens, context, tools, harness activity and retries. The upper estimate is not a spending cap or a statistical confidence interval. Displayed bounds are rounded outwards.</p>
        {monthlyResponses !== undefined && <p>This projection repeats the baseline response mix at the volume you choose. It counts responses, not users or conversations, and excludes separate development and evaluation workloads.</p>}
        <h3>Sources and calculators</h3>
        <div className="credit-estimate-links">
          <a href={creditModel.billingUrl} target="_blank" rel="noreferrer">Microsoft Copilot harness billing and estimated task ranges</a>
          <a href={creditModel.estimatorUrl} target="_blank" rel="noreferrer">Copilot Credits estimator linked by Microsoft Learn</a>
          <a href={creditModel.githubEstimatorUrl} target="_blank" rel="noreferrer">Microsoft calculator on GitHub Pages (standard harness)</a>
        </div>
        <p>The GitHub Pages calculator's custom-agent calculation uses standard-harness billing categories. Those rates are not used here; in the Microsoft Learn-linked estimator, choose Microsoft Copilot Harness.</p>
        <p className="fine-print">Model {creditModel.version}. Sources reviewed {creditModel.reviewedAt}. Revisit these assumptions when Microsoft updates its guidance.</p>
      </div>
      <div className="modal-footer"><span className="fine-print">Directional credit estimates, not a billing quotation.</span><button className="button secondary" type="button" onClick={() => setOpen(false)}>Close</button></div>
    </Modal>}
  </>
}

export function CreditEstimate({ estimate, scope, monthlyResponses, basisNote, className = '' }: {
  estimate: Estimate
  scope: string
  monthlyResponses?: number
  basisNote?: string
  className?: string
}) {
  const range = monthlyResponses === undefined || !estimate.count ? estimate.range : projectCredits(estimate, monthlyResponses)
  return <div className={`credit-estimate ${className}`}>
    <CoinStack16Regular aria-hidden="true" />
    <div className="credit-estimate-copy"><span>Estimated credits consumption</span><strong>{estimate.count ? `${formatCreditRange(range)} credits` : 'Not estimated yet'}</strong><span className="credit-estimate-context">{scope}</span></div>
    <CreditEstimateInfo estimate={estimate} scope={scope} monthlyResponses={monthlyResponses} basisNote={basisNote} />
  </div>
}
