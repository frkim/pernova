import { useState } from 'react';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import type { Agent, KnowledgeDocument, Workflow } from '../types';
import { dateTime, duration, euro, number } from '../logic';
import { EmptyState, SectionHeading, StatusPill } from './Common';

export function AgentGraph({ agents, workflow }: { agents: Agent[]; workflow: Workflow | null }) {
  const supervisor = agents.find(
    (agent) => agent.id === 'supervisor' || agent.role === 'Orchestrator',
  );
  const topology = ['intake', 'demand', 'inventory', 'logistics', 'scenario', 'execution'];
  const specialists = agents
    .filter((agent) => agent.id !== supervisor?.id)
    .sort((a, b) => {
      const position = (id: string) =>
        topology.includes(id) ? topology.indexOf(id) : topology.length;
      return position(a.id) - position(b.id);
    });
  return (
    <section className="surface graph-card" aria-label="Graphe d’exécution des agents">
      <SectionHeading
        eyebrow="ORCHESTRATION"
        title="L’intelligence collective, visible."
        aside={
          <Chip
            size="small"
            icon={<AccountTreeRounded />}
            label={`${agents.length} agents · ${specialists.length} spécialisés`}
          />
        }
      />
      <p className="section-subtitle">
        Qualification → analyses parallèles → simulation → décision encadrée.
      </p>
      {supervisor && (
        <div className="supervisor-bar">
          <AccountTreeRounded fontSize="small" />
          <div>
            <strong>{supervisor.name}</strong>
            <span>Supervision déterministe · {supervisor.model}</span>
          </div>
          <StatusPill
            status={
              workflow?.agents.find((agent) => agent.agent_id === supervisor.id)?.status ??
              supervisor.status
            }
          />
        </div>
      )}
      <div className="agent-graph">
        <svg
          className="graph-lines"
          viewBox="0 0 1000 210"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="graph-stroke">
              <stop stopColor="#9b83eb" />
              <stop offset="1" stopColor="#62b7bd" />
            </linearGradient>
          </defs>
          <g fill="none" stroke="url(#graph-stroke)" strokeWidth="2">
            <path d="M160 105H215V35H290M215 105H290M215 105V175H290M470 35H525V105H590M470 105H590M470 175H525V105M770 105H830" />
          </g>
        </svg>
        {specialists.map((agent, index) => {
          const execution = workflow?.agents.find((item) => item.agent_id === agent.id);
          const state =
            execution?.status ?? (agent.status === 'suspended' ? 'suspended' : 'pending');
          return (
            <article className={`agent-node node-${index} state-${state}`} key={agent.id}>
              <div className="agent-node-top">
                <span className="agent-number">0{index + 1}</span>
                <StatusPill status={state} />
              </div>
              <h3>{agent.name.replace(/ Agent$/, '')}</h3>
              <p>{execution?.summary || agent.description}</p>
              <div className="agent-node-bottom">
                <span>{execution ? `${number(execution.tool_calls)} appels` : agent.role}</span>
                <span>{execution ? duration(execution.duration_ms) : agent.model}</span>
              </div>
            </article>
          );
        })}
      </div>
      {!workflow && (
        <p className="fine-print">
          Inventaire réel du backend. Aucun agent n’a encore été exécuté dans cette vue.
        </p>
      )}
    </section>
  );
}

export function TraceTimeline({
  workflow,
  exporting,
  onExport,
  onCitation,
  knowledge,
}: {
  workflow: Workflow | null;
  exporting: boolean;
  onExport: () => void;
  onCitation: (id: string) => void;
  knowledge: KnowledgeDocument[];
}) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'events' | 'spans'>('events');
  const matches = (value: string) =>
    value.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr'));
  const events =
    workflow?.events.filter((event) =>
      matches(`${event.message} ${event.kind} ${event.decision} ${event.agent_id ?? ''}`),
    ) ?? [];
  const spans =
    workflow?.spans.filter((span) =>
      matches(`${span.name} ${span.agent_id ?? ''} ${JSON.stringify(span.attributes)}`),
    ) ?? [];
  return (
    <section className="surface trace-card">
      <SectionHeading
        eyebrow="AUDIT DE BOUT EN BOUT"
        title="Chaque décision a une histoire."
        aside={
          <Button
            variant="outlined"
            size="small"
            startIcon={<DownloadRounded />}
            disabled={!workflow || exporting}
            onClick={onExport}
          >
            Exporter la preuve JSON
          </Button>
        }
      />
      {workflow ? (
        <>
          <div className="trace-meta">
            <TerminalRounded fontSize="small" />
            <code>{workflow.trace_id}</code>
            <Chip size="small" label={`Politique r${workflow.policy_revision}`} />
          </div>
          <div className="trace-toolbar">
            <div className="segmented" role="group" aria-label="Type de trace">
              <Button aria-pressed={view === 'events'} onClick={() => setView('events')}>
                Événements ({workflow.events.length})
              </Button>
              <Button aria-pressed={view === 'spans'} onClick={() => setView('spans')}>
                Spans ({workflow.spans.length})
              </Button>
            </div>
            <TextField
              label="Filtrer la trace"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {view === 'events' ? (
            <ol className="timeline" aria-label="Journal des décisions">
              {events.map((event) => (
                <li key={event.id}>
                  <span
                    className={`timeline-dot ${event.decision === 'deny' || event.decision === 'blocked' ? 'denied' : ''}`}
                    aria-hidden="true"
                  />
                  <div className="timeline-top">
                    <span className="mono">{dateTime(event.timestamp)}</span>
                    <Chip size="small" label={event.kind} />
                    <StatusPill status={event.decision || 'recorded'} />
                  </div>
                  <p>{event.message}</p>
                  <small>
                    {event.agent_id ?? 'Superviseur'} · <code>{event.id}</code>
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <div className="spans-list">
              {spans.map((span) => (
                <details key={span.span_id} className={span.parent_span_id ? 'child-span' : ''}>
                  <summary>
                    <span className="span-name">{span.name}</span>
                    <span>{duration(span.duration_ms)}</span>
                    <StatusPill status={span.status} />
                  </summary>
                  <div className="span-detail">
                    <p>
                      <strong>Début</strong> {dateTime(span.started_at)}
                    </p>
                    <p>
                      <strong>Agent</strong> {span.agent_id ?? 'Superviseur'}
                    </p>
                    <p>
                      <strong>Span</strong> <code>{span.span_id}</code>
                    </p>
                    <p>
                      <strong>Parent</strong> <code>{span.parent_span_id ?? 'Racine'}</code>
                    </p>
                    <dl>
                      {Object.entries(span.attributes).map(([key, value]) => (
                        <div key={key}>
                          <dt>{key}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </details>
              ))}
            </div>
          )}
          {(view === 'events' ? events.length : spans.length) === 0 && (
            <EmptyState title="Aucune trace correspondante">
              Les événements apparaissent au fil de l’exécution. Modifiez le filtre si nécessaire.
            </EmptyState>
          )}
          {workflow.citations.length > 0 && (
            <div className="citation-row">
              <span>Sources utilisées</span>
              {workflow.citations.map((id) => (
                <Button key={id} size="small" onClick={() => onCitation(id)}>
                  {knowledge.find((doc) => doc.id === id)?.title ?? id} ↗
                </Button>
              ))}
            </div>
          )}
          <div className="trace-totals">
            <span>{number(workflow.metrics.tokens)} tokens</span>
            <span>{number(workflow.metrics.tool_calls)} appels outils</span>
            <span>{number(workflow.metrics.blocked_calls)} appels bloqués</span>
            <span>{euro(workflow.metrics.cost_eur)} synthétiques</span>
            <span>{duration(workflow.metrics.duration_ms)}</span>
          </div>
        </>
      ) : (
        <EmptyState title="Une traçabilité qui ne s’invente pas">
          Lancez une analyse : appels d’outils, décisions, citations et approbation partageront le
          même trace_id.
        </EmptyState>
      )}
    </section>
  );
}
