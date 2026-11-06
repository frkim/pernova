import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import DataUsageRounded from '@mui/icons-material/DataUsageRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { api } from '../api';
import type { Bootstrap, KnowledgeDocument, Workflow } from '../types';
import { dateTime, duration, euro, number } from '../logic';
import { EmptyState, Metric, SectionHeading } from './Common';

export function Knowledge({
  documents,
  focusedId,
  onError,
}: {
  documents: KnowledgeDocument[];
  focusedId: string;
  onError: (error: unknown) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(documents);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(focusedId);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const selected =
    results.find((document) => document.id === selectedId) ??
    documents.find((document) => document.id === selectedId);
  async function search() {
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    setLoading(true);
    try {
      const response = await api.search(query.trim(), signal);
      if (!signal.aborted) setResults(response.items);
    } catch (error) {
      if (!signal.aborted) onError(error);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }
  return (
    <div className="page-stack">
      <div className="page-intro">
        <p className="eyebrow">CURATED KNOWLEDGE</p>
        <h1>
          La bonne décision commence
          <br />
          <span>par une source fiable.</span>
        </h1>
        <p>
          Corpus synthétique curaté, recherche lexicale bornée et citations traçables. Aucune
          recherche web opaque.
        </p>
      </div>
      <section className="surface knowledge-search">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <TextField
            label="Rechercher dans la base de connaissances"
            placeholder="Stock de sécurité, transfert, politique…"
            value={query}
            fullWidth
            slotProps={{
              htmlInput: { maxLength: 300 },
              input: { startAdornment: <SearchRounded sx={{ mr: 1, color: 'text.secondary' }} /> },
            }}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button variant="contained" type="submit" disabled={loading || !query.trim()}>
            Rechercher
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              setQuery('');
              setResults(documents);
            }}
          >
            Tout afficher
          </Button>
        </form>
        {loading && <LinearProgress aria-label="Recherche en cours" />}
      </section>
      {focusedId && !selected && (
        <Alert severity="info">
          La citation « {focusedId} » n’est pas présente dans le corpus chargé. Recherchez son
          identifiant ou sa source ci-dessus.
        </Alert>
      )}
      {selected && (
        <section
          className="surface document-detail"
          aria-label={`Document ${selected.title}`}
          tabIndex={-1}
          id={`document-${selected.id}`}
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">SOURCE · {selected.id}</p>
              <h2>{selected.title}</h2>
            </div>
            <Button onClick={() => setSelectedId('')}>Fermer le document</Button>
          </div>
          <div className="document-meta">
            <Chip label={selected.classification} size="small" />
            <span>Version {selected.version}</span>
            <span>{selected.owner}</span>
            <span>{dateTime(selected.updated_at)}</span>
          </div>
          <div className="document-content">{selected.content}</div>
          <p className="source-reference">
            <strong>Source :</strong>{' '}
            {/^https?:\/\//i.test(selected.source) ? (
              <a href={selected.source} target="_blank" rel="noopener noreferrer">
                {selected.source} ↗
              </a>
            ) : (
              <code>{selected.source}</code>
            )}
          </p>
        </section>
      )}
      <section aria-label="Documents de référence">
        <SectionHeading
          title="Des preuves à portée de main."
          aside={
            <Chip
              icon={<AutoStoriesOutlined />}
              label={`${results.length} documents`}
              size="small"
            />
          }
        />
        <div className="knowledge-grid">
          {results.map((document) => (
            <article key={document.id} className="surface knowledge-card">
              <div className="knowledge-card-top">
                <AutoStoriesOutlined />
                <Chip label={document.classification} size="small" />
              </div>
              <h3>{document.title}</h3>
              <p>
                {document.content.slice(0, 220)}
                {document.content.length > 220 ? '…' : ''}
              </p>
              <div className="knowledge-card-meta">
                <span>{document.owner}</span>
                <span>v{document.version}</span>
              </div>
              <Button
                endIcon={<ArrowForwardRounded />}
                onClick={() => {
                  setSelectedId(document.id);
                  window.scrollTo({
                    top: 200,
                    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                      ? 'instant'
                      : 'smooth',
                  });
                }}
              >
                Lire le document
              </Button>
            </article>
          ))}
        </div>
        {!loading && results.length === 0 && (
          <EmptyState title="Aucune source correspondante">
            Essayez un autre terme. Le corpus est curaté et la recherche ne génère pas de faux
            documents.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

export function FinOps({
  bootstrap,
  workflow,
}: {
  bootstrap: Bootstrap;
  workflow: Workflow | null;
}) {
  const cost = workflow?.metrics.cost_eur ?? 0;
  const budget = bootstrap.policy.max_cost_eur;
  const ratio = budget > 0 ? Math.min(1, cost / budget) : 0;
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const maxAgentCost = Math.max(...(workflow?.agents.map((agent) => agent.cost_eur) ?? [0]), 0.01);
  return (
    <div className="page-stack">
      <div className="page-intro">
        <p className="eyebrow">FINOPS · COÛTS SYNTHÉTIQUES</p>
        <h1>
          La performance a un coût.
          <br />
          <span>La maîtrise a une valeur.</span>
        </h1>
        <p>
          Budgets IA de démonstration, consommation par agent et visibilité sur les appels. Ce ne
          sont pas des factures Azure.
        </p>
      </div>
      <Alert severity="info">
        Tous les montants IA sont synthétiques. Les coûts logistiques des scénarios sont des coûts
        métier distincts ; ils ne sont pas agrégés au budget IA.
      </Alert>
      <div className="metrics-grid finops-metrics">
        <Metric
          icon={<DataUsageRounded />}
          label="Coût IA cumulé"
          value={euro(bootstrap.metrics.total_cost_eur)}
          note="Historique backend · synthétique"
        />
        <Metric
          icon={<DataUsageRounded />}
          label="Tokens cumulés"
          value={number(bootstrap.metrics.total_tokens)}
          note={`${number(bootstrap.metrics.workflows)} workflows enregistrés`}
        />
        <Metric
          icon={<DataUsageRounded />}
          label="Appels bloqués"
          value={number(bootstrap.metrics.blocked_calls)}
          note="Décisions du moteur de politiques"
        />
      </div>
      <div className="finops-layout">
        <section className="surface budget-card">
          <SectionHeading
            eyebrow="WORKFLOW SÉLECTIONNÉ"
            title="Une enveloppe, pas un angle mort."
          />
          {workflow ? (
            <>
              <div className="budget-chart">
                <svg
                  viewBox="0 0 220 220"
                  role="img"
                  aria-label={`Budget IA utilisé : ${euro(cost)} sur ${euro(budget)} synthétiques`}
                >
                  <defs>
                    <linearGradient id="budget-gradient">
                      <stop stopColor="#8060e7" />
                      <stop offset="1" stopColor="#23b4b4" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx="110"
                    cy="110"
                    r={radius}
                    stroke="#edf0f8"
                    strokeWidth="18"
                    fill="none"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r={radius}
                    stroke="url(#budget-gradient)"
                    strokeWidth="18"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${circumference * ratio} ${circumference}`}
                    transform="rotate(-90 110 110)"
                  />
                </svg>
                <div className="budget-center">
                  <strong>{euro(cost)}</strong>
                  <span>sur {euro(budget)}</span>
                  <small>budget politique actuel</small>
                </div>
              </div>
              <div className="budget-summary">
                <span>Consommation</span>
                <strong>{number(Math.round((cost / (budget || 1)) * 100))} %</strong>
              </div>
              <div className="budget-summary">
                <span>Latence totale</span>
                <strong>{duration(workflow.metrics.duration_ms)}</strong>
              </div>
              <div className="budget-summary">
                <span>Appels d’outils</span>
                <strong>{number(workflow.metrics.tool_calls)}</strong>
              </div>
              <p className="fine-print">
                Workflow politique r{workflow.policy_revision} · budget courant r
                {bootstrap.policy.revision}. Coût agrégé publié par le backend.
              </p>
            </>
          ) : (
            <EmptyState title="Prêt à mesurer">
              Sélectionnez ou lancez un workflow pour voir son budget.
            </EmptyState>
          )}
        </section>
        <section className="surface cost-breakdown">
          <SectionHeading eyebrow="ATTRIBUTION" title="Chaque agent rend des comptes." />
          {workflow?.agents.length ? (
            <>
              <div
                className="cost-bars"
                role="img"
                aria-label="Répartition des coûts synthétiques par agent"
              >
                {workflow.agents.map((execution, index) => (
                  <div className="cost-bar-row" key={execution.agent_id}>
                    <div>
                      <span>
                        {bootstrap.agents.find((agent) => agent.id === execution.agent_id)?.name ??
                          execution.agent_id}
                      </span>
                      <strong>{euro(execution.cost_eur)}</strong>
                    </div>
                    <div className="cost-track">
                      <span
                        style={{
                          width: `${(execution.cost_eur / maxAgentCost) * 100}%`,
                          background:
                            index % 2
                              ? 'linear-gradient(90deg, #259f9e, #62cec4)'
                              : 'linear-gradient(90deg, #6952d8, #a68def)',
                        }}
                      />
                    </div>
                    <small>
                      {number(execution.tokens)} tokens · {number(execution.tool_calls)} appels ·{' '}
                      {duration(execution.duration_ms)}
                    </small>
                  </div>
                ))}
              </div>
              <div className="table-scroll">
                <table className="cost-table">
                  <caption className="sr-only">Coûts détaillés des agents</caption>
                  <thead>
                    <tr>
                      <th>Agent</th>
                      <th>Tokens</th>
                      <th>Appels</th>
                      <th>Coût IA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workflow.agents.map((agent) => (
                      <tr key={agent.agent_id}>
                        <th scope="row">
                          {bootstrap.agents.find((item) => item.id === agent.agent_id)?.name ??
                            agent.agent_id}
                        </th>
                        <td>{number(agent.tokens)}</td>
                        <td>{number(agent.tool_calls)}</td>
                        <td>{euro(agent.cost_eur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <EmptyState title="Sans exécution, pas d’estimation inventée">
              La répartition est alimentée exclusivement par les métriques de l’API.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
