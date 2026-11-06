import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Radio from '@mui/material/Radio';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import type { Scenario, Weights, Workflow } from '../types';
import {
  changeWeight,
  DEFAULT_WEIGHTS,
  euro,
  normalizeWeights,
  number,
  validWeights,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
} from '../logic';
import { EmptyState, SectionHeading, StatusPill } from './Common';

function WeightEditor({
  initial,
  pending,
  enabled,
  onRescore,
}: {
  initial: Weights;
  pending: boolean;
  enabled: boolean;
  onRescore: (weights: Weights) => Promise<boolean>;
}) {
  const [weights, setWeights] = useState(initial);
  const valid = validWeights(weights);
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  return (
    <div className="weight-editor">
      <div className="weight-title">
        <div>
          <h3>Votre stratégie. Vos priorités.</h3>
          <p>
            Les sliders normalisent les cinq critères à 100 %. Le score est calculé côté serveur.
          </p>
        </div>
        <span className={`weight-total ${valid ? '' : 'invalid'}`} aria-live="polite">
          {number(total)} / 100 %
        </span>
      </div>
      <div className="weights-grid">
        {WEIGHT_KEYS.map((key) => (
          <div className={`weight-control weight-${key}`} key={key}>
            <label id={`label-${key}`}>{WEIGHT_LABELS[key]}</label>
            <Slider
              value={Number.isFinite(weights[key]) ? weights[key] : 0}
              min={0}
              max={100}
              step={1}
              aria-labelledby={`label-${key}`}
              getAriaValueText={(value) => `${value} pour cent`}
              disabled={pending || !enabled}
              onChange={(_, value) =>
                setWeights((current) => changeWeight(current, key, value as number))
              }
              onChangeCommitted={(_, value) => {
                const next = changeWeight(weights, key, value as number);
                setWeights(next);
                if (enabled && !pending) void onRescore(next);
              }}
            />
            <TextField
              type="number"
              value={weights[key]}
              disabled={pending || !enabled}
              slotProps={{
                htmlInput: {
                  min: 0,
                  max: 100,
                  step: 1,
                  'aria-label': `Poids ${WEIGHT_LABELS[key]}`,
                },
              }}
              onChange={(event) =>
                setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))
              }
              size="small"
            />
          </div>
        ))}
      </div>
      <div className="weight-actions">
        <Button
          size="small"
          onClick={() => setWeights(normalizeWeights(weights))}
          disabled={pending || !enabled}
        >
          Normaliser à 100 %
        </Button>
        <Button
          variant="contained"
          startIcon={<RefreshRounded />}
          disabled={!valid || pending || !enabled}
          onClick={() => {
            void onRescore(weights);
          }}
        >
          Recalculer les scénarios
        </Button>
      </div>
      {!valid && (
        <Alert severity="warning">
          Cinq entiers entre 0 et 100, total de 100 % requis. Aucun calcul n’est envoyé tant que ces
          règles ne sont pas respectées.
        </Alert>
      )}
    </div>
  );
}

export function ScenarioComparison({
  workflow,
  selectedId,
  onSelect,
  pending,
  onRescore,
}: {
  workflow: Workflow | null;
  selectedId: string;
  onSelect: (id: string) => void;
  pending: boolean;
  onRescore: (weights: Weights) => Promise<boolean>;
}) {
  return (
    <section className="surface scenarios-card">
      <SectionHeading
        eyebrow="ARBITRAGE MULTICRITÈRE"
        title="Choisir le bon compromis."
        aside={<AutoAwesomeRounded color="primary" />}
      />
      {workflow?.scenarios.length ? (
        <div
          className="scenario-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Comparaison des scénarios, défilement horizontal disponible"
        >
          <table className="scenario-table">
            <caption className="sr-only">
              Comparaison des options de mitigation. Sélectionnez le plan à soumettre à approbation.
            </caption>
            <thead>
              <tr>
                <th scope="col">Plan de mitigation</th>
                <th scope="col">Service</th>
                <th scope="col">Coût</th>
                <th scope="col">Délai</th>
                <th scope="col">CO₂</th>
                <th scope="col">Risque</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {[...workflow.scenarios]
                .sort((a, b) => b.score - a.score)
                .map((scenario) => (
                  <tr
                    key={scenario.id}
                    className={selectedId === scenario.id ? 'selected-scenario' : ''}
                  >
                    <th scope="row">
                      <div className="scenario-name">
                        <Radio
                          checked={selectedId === scenario.id}
                          disabled={
                            pending || !scenario.eligible || workflow.status !== 'awaiting_approval'
                          }
                          onChange={() => onSelect(scenario.id)}
                          name="scenario"
                          slotProps={{ input: { 'aria-label': `Sélectionner ${scenario.name}` } }}
                        />
                        <div>
                          <strong>{scenario.name}</strong>
                          {workflow.recommended_scenario_id === scenario.id && (
                            <span className="recommendation-tag">
                              <AutoAwesomeRounded /> Recommandé
                            </span>
                          )}
                          <p>{scenario.description}</p>
                          {!scenario.eligible && (
                            <span className="constraint">
                              {scenario.constraint || 'Option non éligible'}
                            </span>
                          )}
                        </div>
                      </div>
                    </th>
                    <td>
                      <strong>{number(scenario.service_pct)} %</strong>
                      <LinearProgress
                        variant="determinate"
                        value={Math.max(0, Math.min(100, scenario.service_pct))}
                        aria-label={`Service client ${scenario.name}`}
                      />
                    </td>
                    <td>{euro(scenario.cost_eur, 0)}</td>
                    <td>{number(scenario.delay_days)} j</td>
                    <td>{number(scenario.co2_kg)} kg</td>
                    <td>{number(scenario.risk)}</td>
                    <td>
                      <span className="score-badge">{number(scenario.score)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title={
            workflow?.status === 'running'
              ? 'Les agents évaluent les options…'
              : 'Des options, pas une boîte noire.'
          }
        >
          La comparaison service, coût, délai, CO₂ et risque apparaîtra avec les résultats du moteur
          déterministe.
        </EmptyState>
      )}
      <WeightEditor
        key={workflow?.id ?? 'empty'}
        initial={workflow?.weights ?? DEFAULT_WEIGHTS}
        enabled={Boolean(workflow?.scenarios.length) && workflow?.status === 'awaiting_approval'}
        pending={pending}
        onRescore={onRescore}
      />
      {workflow?.scenarios.length ? (
        <p className="fine-print">
          Pondérations appliquées aux scores affichés :{' '}
          {WEIGHT_KEYS.map((key) => `${WEIGHT_LABELS[key]} ${workflow.weights[key]} %`).join(' · ')}
        </p>
      ) : null}
    </section>
  );
}

export function ApprovalPanel({
  workflow,
  scenario,
  pending,
  onDecide,
}: {
  workflow: Workflow | null;
  scenario?: Scenario;
  pending: boolean;
  onDecide: (
    decision: 'approve' | 'reject',
    scenarioId: string,
    reason: string,
  ) => Promise<boolean>;
}) {
  const [reason, setReason] = useState('');
  const canDecide =
    workflow?.status === 'awaiting_approval' &&
    scenario?.eligible &&
    !pending &&
    reason.trim().length > 0;
  return (
    <aside className="approval-panel surface" aria-label="Validation humaine">
      <div className="approval-icon">
        <ShieldOutlined />
      </div>
      <p className="eyebrow">HUMAN IN THE LOOP</p>
      <h2>
        Le dernier mot
        <br />
        vous appartient.
      </h2>
      <p className="section-subtitle">
        Aucune action sensible sans décision explicite. Chaque validation est liée au scénario et à
        la politique.
      </p>
      <div className="approval-state">
        <StatusPill status={workflow?.approval?.status ?? workflow?.status ?? 'pending'} />
        <span>{workflow ? `Politique r${workflow.policy_revision}` : 'Contrôle applicatif'}</span>
      </div>
      {scenario ? (
        <div className="approval-plan">
          <span className="eyebrow">PLAN SÉLECTIONNÉ</span>
          <h3>{scenario.name}</h3>
          <p>{scenario.description}</p>
          <dl>
            <div>
              <dt>Quantité</dt>
              <dd>{number(scenario.quantity)} unités</dd>
            </div>
            <div>
              <dt>Origine</dt>
              <dd>{scenario.source_country || 'Sans transfert'}</dd>
            </div>
            <div>
              <dt>Coût métier</dt>
              <dd>{euro(scenario.cost_eur, 0)}</dd>
            </div>
            <div>
              <dt>Service client</dt>
              <dd>{number(scenario.service_pct)} %</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="approval-placeholder">
          <LockOutlined />
          <p>
            {workflow?.status === 'running'
              ? 'L’analyse est en cours. Le plan apparaîtra ici.'
              : 'Sélectionnez un scénario éligible pour examiner le plan.'}
          </p>
        </div>
      )}
      {workflow?.approval?.status === 'pending' &&
        workflow.approval.scenario_id !== scenario?.id && (
          <Alert severity="info">
            Le plan sélectionné diffère de la demande initiale. Le backend revalidera ce scénario
            avant toute action.
          </Alert>
        )}
      {workflow?.approval?.status === 'approved' || workflow?.approval?.status === 'rejected' ? (
        <div className="decision-receipt">
          <CheckRounded />
          <strong>Décision enregistrée</strong>
          <p>{workflow.approval.reason}</p>
          <small>Scénario {workflow.approval.scenario_id}</small>
        </div>
      ) : (
        <>
          <TextField
            label="Motif de la décision"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={3}
            fullWidth
            disabled={pending || workflow?.status !== 'awaiting_approval'}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            helperText="Motif obligatoire et audité. Données synthétiques uniquement : aucune information personnelle ou confidentielle."
          />
          <Button
            fullWidth
            variant="contained"
            endIcon={<ArrowForwardRounded />}
            disabled={!canDecide}
            onClick={() => scenario && void onDecide('approve', scenario.id, reason.trim())}
          >
            Approuver le plan
          </Button>
          <Button
            fullWidth
            variant="outlined"
            color="error"
            disabled={!canDecide}
            onClick={() => scenario && void onDecide('reject', scenario.id, reason.trim())}
          >
            Refuser le plan
          </Button>
        </>
      )}
      {workflow?.transfer && (
        <div className="transfer-receipt">
          <span className="eyebrow">TRANSFERT SIMULÉ CRÉÉ</span>
          <strong>{workflow.transfer.id}</strong>
          <p>
            {number(workflow.transfer.quantity)} unités · {workflow.transfer.source_country} →{' '}
            {workflow.transfer.destination_country}
          </p>
          <small>Clé d’idempotence</small>
          <code>{workflow.transfer.idempotency_key}</code>
        </div>
      )}
      <p className="fine-print">
        <LockOutlined fontSize="inherit" /> Autorisation déterministe · exécution idempotente ·
        preuve JSON
      </p>
    </aside>
  );
}
