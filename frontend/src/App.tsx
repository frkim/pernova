import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Tooltip from '@mui/material/Tooltip';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import AutoStoriesOutlined from '@mui/icons-material/AutoStoriesOutlined';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import DataUsageRounded from '@mui/icons-material/DataUsageRounded';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import RadarRounded from '@mui/icons-material/RadarRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import DarkModeOutlined from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlined from '@mui/icons-material/LightModeOutlined';
import { useThemeMode } from './theme-context';
import { useControlTower } from './useControlTower';
import { authConfig, signIn, signOut } from './auth';
import type { Bootstrap, Preset } from './types';
import { dateTime, euro, number, statusLabels } from './logic';
import { EmptyState, Metric, StatusPill } from './components/Common';
import { RouteMap } from './components/RouteMap';
import { AgentGraph, TraceTimeline } from './components/AgentsTrace';
import { ApprovalPanel, ScenarioComparison } from './components/ScenariosApproval';

const Governance = lazy(() =>
  import('./components/Governance').then((module) => ({ default: module.Governance })),
);
const Knowledge = lazy(() =>
  import('./components/KnowledgeFinOps').then((module) => ({ default: module.Knowledge })),
);
const FinOps = lazy(() =>
  import('./components/KnowledgeFinOps').then((module) => ({ default: module.FinOps })),
);

type Page = 'tower' | 'agents' | 'governance' | 'knowledge' | 'finops';
const navigation = [
  { id: 'tower', label: 'Control Tower', icon: <DashboardRounded /> },
  { id: 'agents', label: 'Agents & traces', icon: <AccountTreeRounded /> },
  { id: 'governance', label: 'Gouvernance', icon: <ShieldOutlined /> },
  { id: 'knowledge', label: 'Knowledge', icon: <AutoStoriesOutlined /> },
  { id: 'finops', label: 'FinOps', icon: <DataUsageRounded /> },
] as const;

const presetLabels: Record<Preset, string> = {
  nominal: 'Nominal · perturbation logistique',
  'tool-loop': 'Tool loop · boucle d’outils',
  'prompt-injection': 'Prompt injection · défense',
  'unapproved-model': 'Unapproved model · refus',
  pii: 'PII · protection des données',
};

export default function App() {
  const { mode, toggle } = useThemeMode();
  const tower = useControlTower();
  const [page, setPage] = useState<Page>('tower');
  const [preset, setPreset] = useState<Preset>('nominal');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scenarioChoice, setScenarioChoice] = useState<{
    workflow: string;
    scenario: string;
  } | null>(null);
  const [citation, setCitation] = useState('');
  const [account, setAccount] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (menuOpen) sidebarRef.current?.querySelector<HTMLButtonElement>('nav button')?.focus();
  }, [menuOpen]);
  const { workflow, bootstrap } = tower;
  const selectedScenarioId =
    workflow?.approval && workflow.approval.status !== 'pending'
      ? workflow.approval.scenario_id
      : scenarioChoice?.workflow === workflow?.id
        ? (scenarioChoice?.scenario ?? '')
        : (workflow?.approval?.scenario_id ?? workflow?.recommended_scenario_id ?? '');
  const scenario = workflow?.scenarios.find((item) => item.id === selectedScenarioId);
  const goto = (value: Page) => {
    setPage(value);
    setMenuOpen(false);
    mainRef.current?.focus();
  };
  const openCitation = (id: string) => {
    setCitation(id);
    goto('knowledge');
  };
  const changeBootstrap = (action: () => Promise<Bootstrap>, notice: string) =>
    tower.act(async () => {
      tower.setBootstrap(await action());
    }, notice);
  const authenticate = async () => {
    setAuthPending(true);
    try {
      setAccount(await signIn());
      tower.reload();
    } catch (error) {
      tower.reportError(error);
    } finally {
      setAuthPending(false);
    }
  };
  const logout = async () => {
    setAuthPending(true);
    try {
      await signOut();
      window.location.reload();
    } catch (error) {
      tower.reportError(error);
      setAuthPending(false);
    }
  };
  const connectionLabels = {
    idle: 'Prêt à lancer',
    connecting: 'Connexion au flux…',
    live: 'Flux SSE en direct',
    reconnecting: 'Reconnexion SSE · polling actif',
    complete: 'Trace complète',
  };
  const activeAgents = bootstrap?.agents.filter((agent) => agent.status === 'active').length ?? 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Aller au contenu principal
      </a>
      {menuOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Fermer la navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside
        ref={sidebarRef}
        id="primary-sidebar"
        className={`sidebar ${menuOpen ? 'open' : ''}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            setMenuOpen(false);
            document.getElementById('mobile-nav-toggle')?.focus();
          }
        }}
      >
        <div className="brand">
          <span className="brand-mark">
            p<span>.</span>
          </span>
          <div>
            pernova<span>INTELLIGENCE IN MOTION</span>
          </div>
        </div>
        <div className="workspace-badge">
          <span className="workspace-icon">
            <RadarRounded />
          </span>
          <div>
            Supply Chain<span>Disruption Manager</span>
          </div>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navigation principale">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => goto(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.id === 'tower' && workflow?.status === 'awaiting_approval' && (
                <span className="nav-count">1</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-insight">
            <AutoAwesomeRounded />
            <strong>
              Augmented decisions.
              <br />
              Human control.
            </strong>
            <p>Une IA utile. Des décisions explicables. Un contrôle sans compromis.</p>
          </div>
          <div className="environment-badge">
            <i />
            <span>
              {bootstrap?.mode === 'connected' ? 'Mode connecté' : 'Mode démonstration'}
              <small>
                {bootstrap?.mode === 'connected'
                  ? 'Statut des intégrations à vérifier'
                  : 'Données & coûts synthétiques'}
              </small>
            </span>
          </div>
          <div className="sidebar-footer">
            <ShieldOutlined fontSize="small" /> Pas d’identité tenant simulée
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <IconButton
              className="mobile-menu"
              id="mobile-nav-toggle"
              aria-label="Ouvrir la navigation"
              aria-expanded={menuOpen}
              aria-controls="primary-sidebar"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MenuRounded />
            </IconButton>
            <span>
              Pernova / <strong>{navigation.find((item) => item.id === page)?.label}</strong>
            </span>
          </div>
          <div className="topbar-right">
            <Tooltip
              title={mode === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair'}
            >
              <IconButton
                aria-label={mode === 'light' ? 'Activer le thème sombre' : 'Activer le thème clair'}
                onClick={toggle}
                size="small"
              >
                {mode === 'light' ? (
                  <DarkModeOutlined fontSize="small" />
                ) : (
                  <LightModeOutlined fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
            {authConfig.enabled && (
              <Tooltip
                title={
                  account ||
                  'Authentification réelle du tenant Entra ; aucun rôle décidé côté client'
                }
              >
                <Button
                  size="small"
                  disabled={authPending || tower.pending}
                  onClick={() => void authenticate()}
                >
                  {authPending ? 'Connexion…' : 'Se connecter avec Entra'}
                </Button>
              </Tooltip>
            )}
            {authConfig.enabled && account && (
              <Button
                size="small"
                disabled={authPending || tower.pending}
                onClick={() => void logout()}
              >
                Se déconnecter
              </Button>
            )}
            <span className={`connection-status ${tower.connection}`} role="status">
              <i />
              {connectionLabels[tower.connection]}
            </span>
            <Chip
              size="small"
              label={
                bootstrap?.mode === 'connected'
                  ? 'Connexions à vérifier'
                  : authConfig.enabled
                    ? 'Entra SPA'
                    : 'Local demo'
              }
              variant="outlined"
            />
            <span
              className="executive-avatar"
              aria-label="Vue exécutive, sans identité authentifiée"
            >
              EX
            </span>
          </div>
        </header>
        <main id="main-content" ref={mainRef} tabIndex={-1} className="main-content">
          <div className="global-toolbar">
            <div className="toolbar-selects">
              <FormControl className="preset-select">
                <InputLabel id="preset-label">Scénario de démonstration</InputLabel>
                <Select
                  labelId="preset-label"
                  label="Scénario de démonstration"
                  value={preset}
                  disabled={tower.pending || tower.loading || !bootstrap}
                  onChange={(event) => setPreset(event.target.value as Preset)}
                >
                  {Object.entries(presetLabels).map(([id, label]) => (
                    <MenuItem key={id} value={id}>
                      {label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {tower.history.length > 0 && (
                <FormControl className="history-select">
                  <InputLabel id="workflow-label">Historique des analyses</InputLabel>
                  <Select
                    labelId="workflow-label"
                    label="Historique des analyses"
                    value={
                      tower.history.some((item) => item.id === tower.selectedId)
                        ? tower.selectedId
                        : ''
                    }
                    disabled={tower.pending}
                    onChange={(event) => tower.select(event.target.value)}
                  >
                    {tower.history.map((item) => (
                      <MenuItem key={item.id} value={item.id}>
                        {item.incident.shipment_id} · {statusLabels[item.status]} ·{' '}
                        {dateTime(item.created_at)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              {tower.history.length < tower.total && (
                <Button
                  size="small"
                  disabled={tower.historyLoading || tower.pending}
                  onClick={() => void tower.loadMore()}
                >
                  {tower.historyLoading ? 'Chargement…' : 'Plus d’analyses'}
                </Button>
              )}
            </div>
            <Button
              className="launch-button"
              variant="contained"
              startIcon={
                tower.pending ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <PlayArrowRounded />
                )
              }
              disabled={tower.pending || tower.loading || !bootstrap}
              onClick={() => void tower.launch(preset)}
            >
              Lancer l’analyse
            </Button>
          </div>
          {tower.error && (
            <Alert
              severity="error"
              onClose={tower.clearError}
              action={
                <Button
                  color="inherit"
                  size="small"
                  disabled={tower.loading || tower.pending}
                  onClick={tower.reload}
                >
                  Réessayer
                </Button>
              }
              className="global-alert"
            >
              {tower.error.message}
              {tower.error.correlationId && (
                <small className="correlation-id">Corrélation : {tower.error.correlationId}</small>
              )}
            </Alert>
          )}
          {tower.pending && (
            <LinearProgress aria-label="Action en cours" className="global-progress" />
          )}
          {tower.loading ? (
            <div className="loading-shell" role="status">
              <CircularProgress />
              <h2>Ouverture de votre Control Tower…</h2>
              <p>Chargement du registre, des politiques et de l’historique réel.</p>
            </div>
          ) : !bootstrap ? (
            <section className="surface">
              <EmptyState title="Le cockpit attend son moteur.">
                Le backend est indisponible. Aucun résultat de démonstration n’est inventé. Vérifiez
                la connexion puis réessayez.
              </EmptyState>
              <Button variant="contained" onClick={tower.reload}>
                Reconnecter le backend
              </Button>
            </section>
          ) : (
            <>
              {page === 'tower' && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <p className="eyebrow">
                        <span className="hero-dot" /> SUPPLY CHAIN INTELLIGENCE
                      </p>
                      <h1 aria-label="Anticiper. Décider. Garder le contrôle.">
                        Anticiper. Décider.
                        <br />
                        <span>Garder le contrôle.</span>
                      </h1>
                      <p>
                        Transformez une perturbation en décision éclairée.
                        <br />
                        Six expertises, une trace, votre validation.
                      </p>
                      <div className="hero-state">
                        <StatusPill status={workflow?.status ?? 'pending'} />
                        <span>
                          {workflow
                            ? `${workflow.incident.market} · ${workflow.incident.reason}`
                            : 'Votre première analyse commence ici.'}
                        </span>
                      </div>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="orbit orbit-three" />
                      <div className="orb-core">
                        <RadarRounded />
                      </div>
                      <span className="orbit-node node-a">
                        <AccountTreeRounded />
                      </span>
                      <span className="orbit-node node-b">
                        <ShieldOutlined />
                      </span>
                      <span className="orbit-node node-c">
                        <TrendingUpRounded />
                      </span>
                      <div className="hero-art-label">
                        INTELLIGENCE
                        <br />
                        <strong>WITH GUARDRAILS</strong>
                      </div>
                    </div>
                  </section>
                  <div className="metrics-grid">
                    <Metric
                      icon={<WarningAmberRounded />}
                      label="Retard de la cargaison"
                      value={workflow ? `+${number(workflow.incident.delay_days)} jours` : '—'}
                      note={workflow?.incident.shipment_id ?? 'Aucune analyse sélectionnée'}
                    />
                    <Metric
                      icon={<TrendingUpRounded />}
                      label="Service du plan sélectionné"
                      value={scenario ? `${number(scenario.service_pct)} %` : '—'}
                      note={scenario?.name ?? 'En attente de simulation'}
                    />
                    <Metric
                      icon={<AccountTreeRounded />}
                      label="Agents disponibles"
                      value={`${activeAgents} / ${bootstrap.agents.length}`}
                      note="Statut réel du registre backend"
                    />
                    <Metric
                      icon={<ShieldOutlined />}
                      label="Appels sous contrôle"
                      value={workflow ? number(workflow.metrics.blocked_calls) : '—'}
                      note="Appels bloqués · workflow sélectionné"
                    />
                  </div>
                  {tower.selecting && (
                    <Alert severity="info">
                      Chargement de l’analyse sélectionnée… Les décisions sont momentanément
                      indisponibles.
                    </Alert>
                  )}
                  <div className="tower-layout">
                    <div className="tower-primary">
                      <RouteMap workflow={workflow} scenario={scenario} />
                      {workflow && (
                        <div className="incident-ribbon">
                          <div>
                            <span className="eyebrow">INCIDENT QUALIFIÉ</span>
                            <strong>{workflow.incident.product}</strong>
                          </div>
                          <span>{number(workflow.incident.quantity)} unités</span>
                          <span>{workflow.incident.market}</span>
                          <StatusPill status={workflow.status} />
                        </div>
                      )}
                      <AgentGraph agents={bootstrap.agents} workflow={workflow} />
                      <ScenarioComparison
                        workflow={workflow}
                        selectedId={selectedScenarioId}
                        pending={tower.pending || tower.selecting}
                        onSelect={(id) =>
                          workflow && setScenarioChoice({ workflow: workflow.id, scenario: id })
                        }
                        onRescore={tower.rescore}
                      />
                      <TraceTimeline
                        workflow={workflow}
                        exporting={tower.pending}
                        onExport={() => void tower.exportEvidence()}
                        onCitation={openCitation}
                        knowledge={bootstrap.knowledge}
                      />
                    </div>
                    <ApprovalPanel
                      key={workflow?.id ?? 'empty'}
                      workflow={workflow}
                      scenario={scenario}
                      pending={tower.pending || tower.selecting}
                      onDecide={tower.decide}
                    />
                  </div>
                </>
              )}
              {page === 'agents' && (
                <div className="page-stack">
                  <div className="page-intro">
                    <p className="eyebrow">AGENTS & OBSERVABILITY</p>
                    <h1>
                      Comprendre ce qui se passe.
                      <br />
                      <span>Jusqu’au dernier appel.</span>
                    </h1>
                    <p>
                      Du premier signal à l’action : une orchestration visible, une preuve
                      exploitable.
                    </p>
                  </div>
                  <AgentGraph agents={bootstrap.agents} workflow={workflow} />
                  <TraceTimeline
                    workflow={workflow}
                    exporting={tower.pending}
                    onExport={() => void tower.exportEvidence()}
                    onCitation={openCitation}
                    knowledge={bootstrap.knowledge}
                  />
                </div>
              )}
              <Suspense fallback={<LinearProgress aria-label="Chargement de la vue" />}>
                {page === 'governance' && (
                  <Governance
                    key={bootstrap.policy.revision}
                    bootstrap={bootstrap}
                    pending={tower.pending}
                    onChange={changeBootstrap}
                  />
                )}
                {page === 'knowledge' && (
                  <Knowledge
                    key={citation || 'knowledge'}
                    documents={bootstrap.knowledge}
                    focusedId={citation}
                    onError={tower.reportError}
                  />
                )}
                {page === 'finops' && <FinOps bootstrap={bootstrap} workflow={workflow} />}
              </Suspense>
              <footer className="main-footer">
                <span>PERNOVA · EXECUTIVE CONTROL TOWER</span>
                <span>Données métier, outils locaux et coûts de démonstration synthétiques.</span>
                <Tooltip title="Télécharger les données réelles de l’endpoint d’export">
                  <span>
                    <Button
                      size="small"
                      disabled={!workflow || tower.pending}
                      startIcon={<DownloadRounded />}
                      onClick={() => void tower.exportEvidence()}
                    >
                      Audit JSON
                    </Button>
                  </span>
                </Tooltip>
                <span>
                  {euro(bootstrap.metrics.total_cost_eur)} IA synthétique{' '}
                  <ArrowForwardRounded fontSize="inherit" />
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      <Snackbar
        open={Boolean(tower.notice)}
        autoHideDuration={6000}
        onClose={tower.clearNotice}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" variant="filled" onClose={tower.clearNotice}>
          {tower.notice}
        </Alert>
      </Snackbar>
    </div>
  );
}
