import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import AddRounded from '@mui/icons-material/AddRounded';
import GppGoodOutlined from '@mui/icons-material/GppGoodOutlined';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import PlayCircleOutlineRounded from '@mui/icons-material/PlayCircleOutlineRounded';
import SaveOutlined from '@mui/icons-material/SaveOutlined';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { api } from '../api';
import type { Agent, Bootstrap, Policy } from '../types';
import { euro, number } from '../logic';
import { SectionHeading, StatusPill } from './Common';

const policyFields: {
  key: keyof Pick<
    Policy,
    'max_tool_calls' | 'max_tokens' | 'max_cost_eur' | 'approval_quantity' | 'approval_cost_eur'
  >;
  label: string;
  integer: boolean;
  min: number;
  max: number;
  help: string;
}[] = [
  {
    key: 'max_tool_calls',
    label: 'Appels outils maximum',
    integer: true,
    min: 1,
    max: 100,
    help: 'Circuit breaker par exécution · 1 à 100',
  },
  {
    key: 'max_tokens',
    label: 'Budget tokens',
    integer: true,
    min: 1,
    max: 100000,
    help: 'Plafond par workflow · 100 000 maximum',
  },
  {
    key: 'max_cost_eur',
    label: 'Budget IA (€)',
    integer: false,
    min: 0.01,
    max: 100,
    help: 'Coût synthétique par workflow · 100 € maximum',
  },
  {
    key: 'approval_quantity',
    label: 'Seuil d’approbation (unités)',
    integer: true,
    min: 0,
    max: 2500,
    help: 'Transfert inter-pays · seuil de 0 à 2 500',
  },
  {
    key: 'approval_cost_eur',
    label: 'Seuil d’approbation métier (€)',
    integer: false,
    min: 0,
    max: 15000,
    help: 'Coût métier · seuil de 0 à 15 000 €',
  },
];

export function Governance({
  bootstrap,
  pending,
  onChange,
}: {
  bootstrap: Bootstrap;
  pending: boolean;
  onChange: (action: () => Promise<Bootstrap>, notice: string) => Promise<boolean>;
}) {
  const [target, setTarget] = useState<Agent | null>(null);
  const [reason, setReason] = useState('');
  const [policy, setPolicy] = useState<Policy>(bootstrap.policy);
  const [newModel, setNewModel] = useState('');
  const [newTool, setNewTool] = useState('');
  const [review, setReview] = useState<string[]>([]);
  const models = [
    ...new Set([
      ...bootstrap.agents.map((agent) => agent.model),
      ...bootstrap.policy.allowed_models,
      ...policy.allowed_models,
    ]),
  ];
  const tools = [
    ...new Set([
      ...bootstrap.agents.flatMap((agent) => agent.tools),
      ...bootstrap.policy.blocked_tools,
      ...policy.blocked_tools,
    ]),
  ];
  const valid =
    policyFields.every(
      ({ key, integer, min, max }) =>
        Number.isFinite(policy[key]) &&
        policy[key] >= min &&
        policy[key] <= max &&
        (!integer || Number.isInteger(policy[key])),
    ) &&
    [policy.allowed_models, policy.blocked_tools].every(
      (list) =>
        list.length <= 20 && list.every((identifier) => /^[a-zA-Z0-9_.-]{1,100}$/.test(identifier)),
    );
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  return (
    <div className="page-stack">
      <div className="page-intro">
        <p className="eyebrow">TRUST BY DESIGN</p>
        <h1>
          La confiance se construit.
          <br />
          <span>Le contrôle se démontre.</span>
        </h1>
        <p>
          Modèles autorisés, outils encadrés, propriétaires identifiés : la politique est
          exécutable, pas décorative.
        </p>
      </div>
      <section className="surface">
        <SectionHeading
          eyebrow="REGISTRE DES AGENTS"
          title="Responsables. Observables. Révocables."
          aside={<Chip size="small" icon={<ShieldOutlined />} label="Kill switch applicatif" />}
        />
        <div className="governance-agents">
          {bootstrap.agents.map((agent) => (
            <article key={agent.id} className="governance-agent">
              <div className="governance-agent-header">
                <div className="agent-avatar">
                  {agent.name
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </div>
                <div>
                  <h3>{agent.name}</h3>
                  <p>{agent.role}</p>
                </div>
                <StatusPill status={agent.status} />
              </div>
              <p>{agent.description}</p>
              <dl>
                <div>
                  <dt>Propriétaire</dt>
                  <dd>{agent.owner}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{agent.version}</dd>
                </div>
                <div>
                  <dt>Modèle</dt>
                  <dd>
                    <code>{agent.model}</code>
                  </dd>
                </div>
              </dl>
              <div className="tool-tags">
                {agent.tools.map((tool) => (
                  <Chip
                    key={tool}
                    size="small"
                    label={tool}
                    color={bootstrap.policy.blocked_tools.includes(tool) ? 'error' : 'default'}
                    variant="outlined"
                  />
                ))}
              </div>
              <Button
                variant="outlined"
                color={agent.status === 'active' ? 'error' : 'primary'}
                disabled={pending}
                startIcon={
                  agent.status === 'active' ? (
                    <PauseCircleOutlineRounded />
                  ) : (
                    <PlayCircleOutlineRounded />
                  )
                }
                onClick={() => {
                  setTarget(agent);
                  setReason('');
                }}
              >
                {agent.status === 'active' ? `Suspendre ${agent.name}` : `Réactiver ${agent.name}`}
              </Button>
            </article>
          ))}
        </div>
      </section>
      <section className="surface policy-card">
        <SectionHeading
          eyebrow="POLICY ENGINE · CONTRÔLE DÉTERMINISTE"
          title="Les règles du jeu, explicitement."
          aside={<Chip label={`Révision ${bootstrap.policy.revision}`} size="small" />}
        />
        <Alert severity="info">
          Toute modification de politique ou suspension invalide les exécutions en attente devenues
          non sûres. La révision est vérifiée côté serveur.
        </Alert>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (valid)
              void onChange(
                () => api.policy(policy),
                'Politique enregistrée. La nouvelle révision s’applique aux contrôles.',
              );
          }}
        >
          <div className="policy-fields">
            {policyFields.map(({ key, label, integer, min, max, help }) => (
              <TextField
                key={key}
                label={label}
                type="number"
                value={policy[key]}
                helperText={help}
                disabled={pending}
                slotProps={{ htmlInput: { min, max, step: integer ? 1 : 0.01 } }}
                onChange={(event) =>
                  setPolicy((current) => ({ ...current, [key]: Number(event.target.value) }))
                }
              />
            ))}
          </div>
          <div className="policy-allowlists">
            <div>
              <h3>Model allowlist</h3>
              <p>Un modèle absent de cette liste n’est pas autorisé.</p>
              {models.map((model) => (
                <FormControlLabel
                  key={model}
                  label={model}
                  control={
                    <Switch
                      checked={policy.allowed_models.includes(model)}
                      disabled={pending}
                      onChange={() =>
                        setPolicy((current) => ({
                          ...current,
                          allowed_models: toggle(current.allowed_models, model),
                        }))
                      }
                    />
                  }
                />
              ))}
              <div className="add-rule">
                <TextField
                  label="Ajouter un identifiant de modèle"
                  value={newModel}
                  disabled={pending}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  helperText="Identifiant exact : lettres, chiffres, point, _ ou -"
                  onChange={(event) => setNewModel(event.target.value)}
                />
                <Button
                  aria-label="Ajouter le modèle à l’allowlist"
                  disabled={
                    pending ||
                    !/^[a-zA-Z0-9_.-]{1,100}$/.test(newModel.trim()) ||
                    policy.allowed_models.length >= 20
                  }
                  onClick={() => {
                    setPolicy((current) => ({
                      ...current,
                      allowed_models: [...new Set([...current.allowed_models, newModel.trim()])],
                    }));
                    setNewModel('');
                  }}
                >
                  <AddRounded />
                </Button>
              </div>
            </div>
            <div>
              <h3>MCP tool policy</h3>
              <p>Interrupteur activé = outil autorisé ; désactivé = explicitement bloqué.</p>
              {tools.map((tool) => (
                <FormControlLabel
                  key={tool}
                  label={tool}
                  control={
                    <Switch
                      checked={!policy.blocked_tools.includes(tool)}
                      disabled={pending}
                      onChange={() =>
                        setPolicy((current) => ({
                          ...current,
                          blocked_tools: toggle(current.blocked_tools, tool),
                        }))
                      }
                    />
                  }
                />
              ))}
              <div className="add-rule">
                <TextField
                  label="Bloquer un identifiant d’outil"
                  value={newTool}
                  disabled={pending}
                  slotProps={{ htmlInput: { maxLength: 100 } }}
                  helperText="Identifiant exact : lettres, chiffres, point, _ ou -"
                  onChange={(event) => setNewTool(event.target.value)}
                />
                <Button
                  aria-label="Ajouter l’outil à la liste de blocage"
                  disabled={
                    pending ||
                    !/^[a-zA-Z0-9_.-]{1,100}$/.test(newTool.trim()) ||
                    policy.blocked_tools.length >= 20
                  }
                  onClick={() => {
                    setPolicy((current) => ({
                      ...current,
                      blocked_tools: [...new Set([...current.blocked_tools, newTool.trim()])],
                    }));
                    setNewTool('');
                  }}
                >
                  <AddRounded />
                </Button>
              </div>
            </div>
          </div>
          {!valid && (
            <Alert severity="warning">
              Respectez les bornes affichées et les entiers requis. Chaque liste contient au maximum
              20 identifiants. Une liste de modèles vide bloque tous les modèles.
            </Alert>
          )}
          <div className="policy-footer">
            <span>
              Approbation humaine : &gt; {number(policy.approval_quantity)} unités ou &gt;{' '}
              {euro(policy.approval_cost_eur, 0)}
            </span>
            <Button
              type="submit"
              variant="contained"
              disabled={!valid || pending}
              startIcon={<SaveOutlined />}
            >
              Enregistrer la politique
            </Button>
          </div>
        </form>
      </section>
      <section className="surface enterprise-card">
        <SectionHeading
          eyebrow="ENTERPRISE READINESS"
          title="Agent 365 : une connexion, pas une promesse."
          aside={<GppGoodOutlined color="primary" />}
        />
        <p>
          Le kill switch présenté ici est applicatif. Aucun score de conformité, identité vérifiée
          ou connexion tenant n’est simulé.
        </p>
        <div className="integrations-grid">
          {bootstrap.integrations.map((integration) => (
            <article key={integration.id}>
              <h3>{integration.name}</h3>
              <StatusPill status={integration.status} />
              <p>{integration.description}</p>
            </article>
          ))}
        </div>
        <div className="readiness-checklist">
          <h3>Checklist de revue tenant</h3>
          <p>
            Notes de préparation locales uniquement. Cocher une case ne vérifie ni ne connecte un
            service.
          </p>
          {[
            'Identités Entra et rôles validés',
            'Inventaire Agent 365 revu avec le CISO',
            'Périmètres MCP et RBAC documentés',
            'Télémétrie et rétention des preuves validées',
          ].map((item) => (
            <FormControlLabel
              key={item}
              label={item}
              control={
                <Checkbox
                  checked={review.includes(item)}
                  onChange={() => setReview((current) => toggle(current, item))}
                />
              }
            />
          ))}
        </div>
      </section>
      <Dialog
        open={Boolean(target)}
        onClose={() => !pending && setTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {target?.status === 'active' ? 'Suspendre l’agent' : 'Réactiver l’agent'}
        </DialogTitle>
        <DialogContent>
          <p>{target?.name}</p>
          <Alert severity={target?.status === 'active' ? 'warning' : 'info'}>
            Les appels sont contrôlés par le backend. Cette action est auditée et peut dégrader les
            workflows en cours.
          </Alert>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Motif du changement de statut"
            helperText="Motif audité. Données synthétiques uniquement : aucune information personnelle ou confidentielle."
            value={reason}
            disabled={pending}
            sx={{ mt: 3 }}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            onChange={(event) => setReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button disabled={pending} onClick={() => setTarget(null)}>
            Annuler
          </Button>
          <Button
            variant="contained"
            color={target?.status === 'active' ? 'error' : 'primary'}
            disabled={pending || !reason.trim()}
            onClick={async () => {
              if (!target) return;
              const changed = await onChange(
                () =>
                  api.agentStatus(
                    target.id,
                    target.status === 'active' ? 'suspended' : 'active',
                    reason.trim(),
                  ),
                'Statut de l’agent enregistré dans le backend.',
              );
              if (changed) setTarget(null);
            }}
          >
            Confirmer {target?.status === 'active' ? 'la suspension' : 'la réactivation'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
